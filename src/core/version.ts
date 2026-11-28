declare const __QUILLVIBE_VERSION__: string | undefined;
declare const __QUILLVIBE_COMMIT__: string | undefined;

export const APP_VERSION: string =
  typeof __QUILLVIBE_VERSION__ !== 'undefined' && __QUILLVIBE_VERSION__.trim().length > 0
    ? __QUILLVIBE_VERSION__.trim()
    : '3.3.7';

export const APP_COMMIT: string =
  typeof __QUILLVIBE_COMMIT__ !== 'undefined' && __QUILLVIBE_COMMIT__.trim().length > 0
    ? __QUILLVIBE_COMMIT__.trim()
    : 'local';

interface ParsedSemver {
  major: number;
  minor: number;
  patch: number;
  pre: Array<number | string>;
}

function parseSemver(raw: string): ParsedSemver | null {
  const clean = raw.replace(/^v/i, '').split('+')[0].trim();
  const dashIdx = clean.indexOf('-');
  const corePart = dashIdx === -1 ? clean : clean.slice(0, dashIdx);
  const prePart = dashIdx === -1 ? '' : clean.slice(dashIdx + 1);
  const coreParts = corePart.split('.');
  if (coreParts.length < 1 || coreParts.length > 3) return null;

  const major = Number(coreParts[0]);
  const minor = Number(coreParts[1] ?? 0);
  const patch = Number(coreParts[2] ?? 0);
  if (!Number.isInteger(major) || !Number.isInteger(minor) || !Number.isInteger(patch)) {
    return null;
  }

  const pre = prePart
    ? prePart.split('.').map((seg) => (/^\d+$/.test(seg) ? Number(seg) : seg))
    : [];
  return { major, minor, patch, pre };
}

export function isPrereleaseVersion(version: string): boolean {
  const parsed = parseSemver(version);
  return Boolean(parsed && parsed.pre.length > 0);
}

/**
 * Compares two SemVer strings (`a` vs `b`):
 * returns `1` if `a > b`, `-1` if `a < b`, or `0` if equal.
 */
export function compareSemver(a: string, b: string): number {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  if (!pa || !pb) return a.localeCompare(b);

  if (pa.major !== pb.major) return pa.major > pb.major ? 1 : -1;
  if (pa.minor !== pb.minor) return pa.minor > pb.minor ? 1 : -1;
  if (pa.patch !== pb.patch) return pa.patch > pb.patch ? 1 : -1;

  if (pa.pre.length === 0 && pb.pre.length === 0) return 0;
  if (pa.pre.length === 0) return 1;
  if (pb.pre.length === 0) return -1;

  const len = Math.max(pa.pre.length, pb.pre.length);
  for (let i = 0; i < len; i += 1) {
    const segA = pa.pre[i];
    const segB = pb.pre[i];
    if (segA === undefined) return -1;
    if (segB === undefined) return 1;
    if (segA === segB) continue;
    const numA = typeof segA === 'number';
    const numB = typeof segB === 'number';
    if (numA && numB) return segA > segB ? 1 : -1;
    if (numA !== numB) return numA ? -1 : 1;
    return String(segA) > String(segB) ? 1 : -1;
  }
  return 0;
}
