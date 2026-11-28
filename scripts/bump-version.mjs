#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SEMVER_RE = /^(\d+)\.(\d+)\.(\d+)(?:-([a-zA-Z0-9.-]+))?$/;

function readJson(relPath) {
  return JSON.parse(readFileSync(resolve(rootDir, relPath), 'utf8'));
}

function writeJson(relPath, data) {
  const abs = resolve(rootDir, relPath);
  const prev = readFileSync(abs, 'utf8');
  const trailingNewline = prev.endsWith('\n') ? '\n' : '';
  writeFileSync(abs, `${JSON.stringify(data, null, 2)}${trailingNewline}`, 'utf8');
}

function resolveNextVersion(current, arg) {
  const match = SEMVER_RE.exec(current);
  if (!match) {
    throw new Error(`Invalid current version in package.json: "${current}"`);
  }
  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);
  const pre = match[4] ?? '';

  if (arg === '--rc') {
    if (pre) {
      const rcMatch = /^(.*?)(\d+)$/.exec(pre);
      if (rcMatch) {
        return `${major}.${minor}.${patch}-${rcMatch[1]}${Number(rcMatch[2]) + 1}`;
      }
      return `${major}.${minor}.${patch}-${pre}.1`;
    }
    return `${major}.${minor}.${patch + 1}-rc.1`;
  }

  if (arg === '--promote') {
    return `${major}.${minor}.${patch}`;
  }

  if (arg === '--patch') {
    return pre ? `${major}.${minor}.${patch}` : `${major}.${minor}.${patch + 1}`;
  }

  if (arg === '--minor') {
    return `${major}.${minor + 1}.0`;
  }

  const normalized = arg.replace(/^v/i, '').trim();
  if (!SEMVER_RE.test(normalized)) {
    throw new Error(
      `Invalid SemVer target "${arg}". Expected X.Y.Z, X.Y.Z-rc.N, --rc, --promote, --patch, or --minor.`,
    );
  }
  return normalized;
}

function toTauriBundleVersion(semver) {
  const match = SEMVER_RE.exec(semver);
  if (!match) return semver;
  const core = `${match[1]}.${match[2]}.${match[3]}`;
  const pre = match[4];
  if (!pre) return core;
  const numMatch = /(\d+)$/.exec(pre);
  const rcNum = numMatch ? Math.max(1, Math.min(65535, Number(numMatch[1]))) : 1;
  return `${core}-${rcNum}`;
}

const arg = process.argv[2];
if (!arg) {
  console.error('Usage: node scripts/bump-version.mjs <X.Y.Z[-rc.N] | --rc | --promote | --patch | --minor>');
  process.exit(1);
}

const pkg = readJson('package.json');
const nextVersion = resolveNextVersion(pkg.version, arg);
const tauriBundleVersion = toTauriBundleVersion(nextVersion);
const isStable = !nextVersion.includes('-');

pkg.version = nextVersion;
writeJson('package.json', pkg);

const tauriConf = readJson('src-tauri/tauri.conf.json');
tauriConf.version = tauriBundleVersion;
writeJson('src-tauri/tauri.conf.json', tauriConf);

const cargoPath = resolve(rootDir, 'src-tauri/Cargo.toml');
const cargoText = readFileSync(cargoPath, 'utf8');
const nextCargo = cargoText.replace(
  /^(version\s*=\s*)"[^"]*"/m,
  `$1"${nextVersion}"`,
);
if (nextCargo === cargoText && !cargoText.includes(`version = "${nextVersion}"`)) {
  throw new Error('Could not find package version field in src-tauri/Cargo.toml');
}
writeFileSync(cargoPath, nextCargo, 'utf8');

const versionTsPath = resolve(rootDir, 'src/core/version.ts');
const versionTsText = readFileSync(versionTsPath, 'utf8');
const nextVersionTs = versionTsText.replace(/^(\s*:\s*)'[^']*';/m, `$1'${nextVersion}';`);
if (nextVersionTs === versionTsText && !versionTsText.includes(`'${nextVersion}';`)) {
  throw new Error('Could not find fallback version in src/core/version.ts');
}
writeFileSync(versionTsPath, nextVersionTs, 'utf8');

for (const viteRel of ['vite.config.ts', 'vite.desktop.config.ts']) {
  const vitePath = resolve(rootDir, viteRel);
  const viteText = readFileSync(vitePath, 'utf8');
  const nextVite = viteText.replace(
    /^(const appVersion = String\(pkg\.version \|\| )'[^']*'\);/m,
    `$1'${nextVersion}');`,
  );
  if (nextVite === viteText && !viteText.includes(`'${nextVersion}');`)) {
    throw new Error(`Could not find fallback appVersion in ${viteRel}`);
  }
  writeFileSync(vitePath, nextVite, 'utf8');
}

if (isStable) {
  const wingetPath = resolve(rootDir, 'packaging/winget/jhonrey.Quillvibe.yaml');
  const wingetText = readFileSync(wingetPath, 'utf8');
  const updatedWinget = wingetText
    .replace(/^(PackageVersion:\s*).+$/m, `$1${nextVersion}`)
    .replace(/\/download\/v[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.-]+)?\//g, `/download/v${nextVersion}/`)
    .replace(/Quillvibe_[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.-]+)?_x64_en-US\.msi/g, `Quillvibe_${nextVersion}_x64_en-US.msi`);
  writeFileSync(wingetPath, updatedWinget, 'utf8');

  const brewPath = resolve(rootDir, 'packaging/homebrew/quillvibe.rb');
  const brewText = readFileSync(brewPath, 'utf8');
  const updatedBrew = brewText.replace(/^( {2}version\s+)"[^"]*"/m, `$1"${nextVersion}"`);
  writeFileSync(brewPath, updatedBrew, 'utf8');

  const readmePath = resolve(rootDir, 'README.md');
  const readmeText = readFileSync(readmePath, 'utf8');
  const updatedReadme = readmeText
    .replace(/(\(`v\d+\.\d+\.\d+` — Windows, Mac & Linux\))/g, `(\`v${nextVersion}\` — Windows, Mac & Linux)`)
    .replace(/(### Live Screenshots \()`v\d+\.\d+\.\d+`(\))/g, `$1\`v${nextVersion}\`$2`)
    .replace(/(GitHub Releases \(<code>)v\d+\.\d+\.\d+(<\/code>\))/g, `$1v${nextVersion}$2`);
  writeFileSync(readmePath, updatedReadme, 'utf8');
}

console.log(
  tauriBundleVersion === nextVersion
    ? `Updated Quillvibe version to ${nextVersion} (${isStable ? 'stable' : 'pre-release'})`
    : `Updated Quillvibe version to ${nextVersion} (tauri.conf.json bundle version: ${tauriBundleVersion})`,
);
