import { applySmartTypography } from './export';
import { safeJsonParse } from './extensions';
import { normalizeProjectDefaults } from './library';
import { countWords, findSceneContext, newId } from './manuscript';
import { addProofreadMark } from './proofread';
import type {
  BookProject,
  ExtensionAuditEntry,
  ExtensionPermission,
  InstalledExtension,
  ProofreadMarkKind,
  QuillvibePluginManifest,
} from './types';

const EXTENSIONS_STORAGE_KEY = 'quillvibe.extensions.v2';
const LEGACY_EXTENSIONS_STORAGE_KEY = 'bookvibe.extensions.v1';
const AUDIT_STORAGE_KEY = 'quillvibe.extensionAudit.v2';
const LEGACY_AUDIT_STORAGE_KEY = 'bookvibe.extensionAudit.v1';
let memoryAuditLog: ExtensionAuditEntry[] = [];
let memoryExternalExtensions: InstalledExtension[] = [];

export const ALLOWED_EXTENSION_PERMISSIONS: readonly ExtensionPermission[] = [
  'read:active-scene',
  'read:manuscript',
  'read:bible',
  'propose:proofread-marks',
  'apply:text-transform',
  'add:export-preset',
  'add:font-pack',
] as const;

export const EXTENSION_PERMISSION_INFO: Record<
  ExtensionPermission,
  { title: string; dataAccessed: string; riskLabel: string }
> = {
  'read:active-scene': {
    title: 'Read Active Scene Text',
    dataAccessed: 'Reads only the title and prose of the scene currently open in the editor.',
    riskLabel: 'Low (Scoped to 1 scene)',
  },
  'read:manuscript': {
    title: 'Read Manuscript Chapters & Word Counts',
    dataAccessed: 'Reads scene headings, chapter hierarchy, and draft text across the active book.',
    riskLabel: 'Medium (Active book only)',
  },
  'read:bible': {
    title: 'Read Story Bible Entries',
    dataAccessed: 'Reads character names, locations, and lore entries in the active book.',
    riskLabel: 'Low (Worldbuilding entries)',
  },
  'propose:proofread-marks': {
    title: 'Propose Proofreading Marks',
    dataAccessed: 'Adds reviewable strikeout, replacement, and comment marks. Cannot overwrite prose silently.',
    riskLabel: 'Low (Review required before changes)',
  },
  'apply:text-transform': {
    title: 'Run Snapshot-Backed Text Cleanup',
    dataAccessed: 'Modifies prose formatting in the active scene after saving an automatic recovery snapshot.',
    riskLabel: 'Medium (Creates snapshot before edits)',
  },
  'add:export-preset': {
    title: 'Apply Typeset Style Presets',
    dataAccessed: 'Updates trim size, typeface, line spacing, margins, and paper theme in the active book.',
    riskLabel: 'Low (Layout settings only)',
  },
  'add:font-pack': {
    title: 'Register Editorial Font Stacks',
    dataAccessed: 'Adds named font families into your Fonts & Preferences selector without accessing documents.',
    riskLabel: 'Low (Typography list only)',
  },
};

export const SANDBOX_BLOCKED_CAPABILITIES: readonly string[] = [
  'No Internet or Network Access: extensions cannot fetch external URLs, open sockets, or upload manuscripts.',
  'No Filesystem Access: extensions cannot browse folders, read disk files, or modify OS registry settings.',
  'No Author Keys or Secrets: cryptographic Author Keys (privateKeyJwk) are stripped before any extension sees book data.',
  'No Cross-Book Access: other books in your Library stay isolated and invisible.',
  'No Script Execution: Quillvibe rejects executable JavaScript; .qvext packages contain declarative JSON rules and presets only.',
];

export const INTEGRATED_EXTENSIONS: readonly QuillvibePluginManifest[] = [
  {
    magic: 'QUILLVIBE_EXT_V2',
    id: 'core.editorial-proofing',
    name: 'Editorial Proofing Toolkit',
    version: '2.0.0',
    author: 'Quillvibe Integrated',
    description: 'Scans the active scene offline for repeated words, spacing flaws, and weak filter verbs.',
    kind: 'integrated',
    permissions: ['read:active-scene', 'propose:proofread-marks'],
    dataUsageSummary:
      'Reads text in the open scene locally and adds reviewable proofreading marks. Never alters text without your click.',
    rules: [
      {
        id: 'rule-double-word',
        label: 'Repeated consecutive word',
        pattern: '\\b([a-z]{2,})\\s+\\1\\b',
        flags: 'gi',
        markKind: 'delete',
        note: 'Duplicate consecutive word detected.',
      },
      {
        id: 'rule-multi-space',
        label: 'Double space between words',
        pattern: '[^\\S\\r\\n]{2,}',
        flags: 'g',
        markKind: 'substitute',
        replacement: ' ',
        note: 'Collapse extra spaces to a single word space.',
      },
      {
        id: 'rule-double-hyphen',
        label: 'Double hyphen (--)',
        pattern: '--',
        flags: 'g',
        markKind: 'substitute',
        replacement: '—',
        note: 'Replace double hyphen with literary em-dash (—).',
      },
      {
        id: 'rule-very',
        label: 'Overused intensifier ("very")',
        pattern: '\\bvery\\b',
        flags: 'gi',
        markKind: 'comment',
        note: 'Check whether a stronger verb or noun reads tighter than "very".',
      },
    ],
  },
  {
    magic: 'QUILLVIBE_EXT_V2',
    id: 'core.typo-cleanup',
    name: 'Typographic Punctuation Cleanup',
    version: '2.0.0',
    author: 'Quillvibe Integrated',
    description: 'Converts straight quotes, double hyphens, ellipses, and stray spacing with snapshot backup.',
    kind: 'integrated',
    permissions: ['read:active-scene', 'apply:text-transform'],
    dataUsageSummary:
      'Reads active scene text locally, saves a full Revision Snapshot first, then applies deterministic typographic cleanup.',
    transforms: [
      {
        id: 'tr-smart-typo',
        label: 'Apply Smart Curly Quotes & Em-Dashes',
        description: 'Converts straight quotes, "--", and "..." into curved book quotes, em-dashes, and ellipses.',
        kind: 'smart-typography',
      },
      {
        id: 'tr-collapse-spaces',
        label: 'Collapse Double Spaces',
        description: 'Normalizes two or more consecutive spaces to a single space.',
        kind: 'collapse-double-spaces',
      },
      {
        id: 'tr-trim-lines',
        label: 'Trim Trailing Line Spaces',
        description: 'Removes invisible whitespace at the end of lines.',
        kind: 'trim-trailing-spaces',
      },
    ],
  },
  {
    magic: 'QUILLVIBE_EXT_V2',
    id: 'core.readability-ledger',
    name: 'Readability & Pacing Ledger',
    version: '2.0.0',
    author: 'Quillvibe Integrated',
    description: 'Calculates sentence length, dialogue ratio, paragraph spread, and Flesch-Kincaid grade locally.',
    kind: 'integrated',
    permissions: ['read:active-scene'],
    dataUsageSummary:
      'Read-only pass over the active scene text. Writes nothing to your manuscript.',
    metricsReport: 'readability',
  },
  {
    magic: 'QUILLVIBE_EXT_V2',
    id: 'core.print-presets',
    name: 'Print Trim Preset Pack',
    version: '2.0.0',
    author: 'Quillvibe Integrated',
    description: 'Applies trade print geometry presets (Pocket 5×8, Trade 6×9, A5 Classic) in one click.',
    kind: 'integrated',
    permissions: ['add:export-preset'],
    dataUsageSummary:
      'Updates only typography trim size, margins, line spacing, and paper theme fields.',
    presets: [
      {
        id: 'preset-trade-6x9',
        label: 'Trade Paperback 6" × 9" (Garamond 11pt)',
        paperTheme: 'ivory',
        typography: { trimSize: '6x9', fontFamily: 'garamond', fontSizePt: 11, lineHeight: 1.55, dropCaps: true },
      },
      {
        id: 'preset-pocket-5x8',
        label: 'Pocket Novel 5" × 8" (Baskerville 10.5pt)',
        paperTheme: 'parchment',
        typography: { trimSize: '5x8', fontFamily: 'baskerville', fontSizePt: 10.5, lineHeight: 1.5, dropCaps: true },
      },
      {
        id: 'preset-a5-literary',
        label: 'A5 Literary Press (Palatino 11pt)',
        paperTheme: 'ivory',
        typography: { trimSize: 'a5', fontFamily: 'palatino', fontSizePt: 11, lineHeight: 1.6, dropCaps: true },
      },
    ],
  },
  {
    magic: 'QUILLVIBE_EXT_V2',
    id: 'core.editorial-fonts',
    name: 'Editorial Typeface Pack',
    version: '2.0.0',
    author: 'Quillvibe Integrated',
    description: 'Registers classic editorial serif, monospace typewriter, and archival display font stacks offline.',
    kind: 'integrated',
    permissions: ['add:font-pack'],
    dataUsageSummary: 'Adds curated offline CSS font stacks to Quillvibe Settings and Cover Studio. Reads zero manuscript text.',
    fonts: [
      {
        id: 'f-caslon',
        family: 'Archival Caslon',
        cssStack: '"Libre Caslon Text", "Caslon Old Face", Georgia, serif',
        category: 'serif',
      },
      {
        id: 'f-typewriter',
        family: 'Courier Manuscript',
        cssStack: '"Courier Prime", "Courier New", Consolas, monospace',
        category: 'mono',
      },
      {
        id: 'f-didot',
        family: 'Editorial Display Didone',
        cssStack: 'Didot, "Bodoni MT", "Times New Roman", serif',
        category: 'serif',
      },
    ],
  },
];

export const SAMPLE_EXTERNAL_EXTENSION_JSON = JSON.stringify(
  {
    magic: 'QUILLVIBE_EXT_V2',
    id: 'ext.uk-house-style',
    name: 'British House Style Proofing',
    version: '1.0.0',
    author: 'Open Editorial Guild',
    description: 'Flags US spelling variants ("color", "honor", "realize", "center") as reviewable British house-style marks.',
    kind: 'external',
    permissions: ['read:active-scene', 'propose:proofread-marks'],
    dataUsageSummary:
      'Reads only the open scene to propose UK spelling marks ("colour", "honour", "realise", "centre"). Cannot save, edit prose directly, or access the internet.',
    rules: [
      {
        id: 'uk-color',
        label: 'color -> colour',
        pattern: '\\bcolor\\b',
        flags: 'g',
        markKind: 'substitute',
        replacement: 'colour',
        note: 'British house spelling prefers "colour".',
      },
      {
        id: 'uk-honor',
        label: 'honor -> honour',
        pattern: '\\bhonor\\b',
        flags: 'g',
        markKind: 'substitute',
        replacement: 'honour',
        note: 'British house spelling prefers "honour".',
      },
      {
        id: 'uk-realize',
        label: 'realize -> realise',
        pattern: '\\brealize\\b',
        flags: 'g',
        markKind: 'substitute',
        replacement: 'realise',
        note: 'British house spelling prefers "realise".',
      },
      {
        id: 'uk-center',
        label: 'center -> centre',
        pattern: '\\bcenter\\b',
        flags: 'g',
        markKind: 'substitute',
        replacement: 'centre',
        note: 'British house spelling prefers "centre".',
      },
    ],
  } satisfies QuillvibePluginManifest,
  null,
  2,
);

const VALID_MARK_KINDS = new Set<ProofreadMarkKind>([
  'delete',
  'insert',
  'substitute',
  'comment',
  'highlight',
  'transpose',
  'stet',
  'paragraph',
  'run-in',
  'closeup',
  'space',
  'capitalize',
  'lowercase',
  'italic',
  'bold',
]);

/**
 * Guard against catastrophic backtracking / ReDoS in user-supplied external extension patterns.
 */
export function isSafeRegexPattern(pattern: string): boolean {
  if (typeof pattern !== 'string') return false;
  const trimmed = pattern.trim();
  if (trimmed.length === 0 || trimmed.length > 120) return false;
  // Block backreferences, lookbehinds, nested quantifiers e.g. (a+)+, ((?:a+))+, and quantified alternations (a|a)+
  if (/\\[1-9]/.test(trimmed)) return false;
  if (/\(\?<[=!]/.test(trimmed)) return false;
  if (/\([^)]*[+*][^)]*\)[+*?{]/.test(trimmed)) return false;
  if (/[+*]\s*[+*]/.test(trimmed)) return false;
  if (/\((?:[^()|]*\|)+[^()]*\)[+*?{]/.test(trimmed)) return false;
  let parenDepth = 0;
  let hasQuantifierInsideParen = false;
  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (ch === '\\') {
      i++;
      continue;
    }
    if (ch === '(') {
      parenDepth++;
    } else if (ch === ')') {
      if (parenDepth > 0) parenDepth--;
      const nextCh = trimmed[i + 1] || '';
      if (hasQuantifierInsideParen && /[+*?{]/.test(nextCh)) {
        return false;
      }
      if (parenDepth === 0) hasQuantifierInsideParen = false;
    } else if (parenDepth > 0 && (ch === '+' || ch === '*')) {
      hasQuantifierInsideParen = true;
    }
  }
  try {
    new RegExp(trimmed, 'gu');
    return true;
  } catch {
    return false;
  }
}

export async function computeManifestSha256(rawJson: string): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const encoded = new TextEncoder().encode(rawJson);
    const digest = await crypto.subtle.digest('SHA-256', encoded);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
      .slice(0, 16);
  }
  let hash = 2166136261;
  for (let i = 0; i < rawJson.length; i++) {
    hash ^= rawJson.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function assertCleanString(val: unknown, fieldName: string, maxLen = 240): string {
  if (typeof val !== 'string' || val.trim().length === 0) {
    throw new Error(`Extension field "${fieldName}" must be a non-empty string.`);
  }
  if (val.length > maxLen) {
    throw new Error(`Extension field "${fieldName}" exceeds ${maxLen} characters.`);
  }
  if (/<script|javascript:|onerror\s*=|onload\s*=|\beval\s*\(/i.test(val)) {
    throw new Error(`Extension field "${fieldName}" contains blocked script content.`);
  }
  return val.trim();
}

export function validateExternalExtensionManifest(rawJson: string): QuillvibePluginManifest {
  let parsed: unknown;
  try {
    parsed = safeJsonParse(rawJson);
  } catch {
    throw new Error('External extension file must contain valid JSON.');
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Extension root must be a JSON object.');
  }

  const obj = parsed as Record<string, unknown>;
  if (obj.magic !== 'QUILLVIBE_EXT_V2' && obj.magic !== 'BOOKVIBE_EXT_V1') {
    throw new Error('Missing required "magic": "QUILLVIBE_EXT_V2" header.');
  }

  const id = assertCleanString(obj.id, 'id', 64);
  if (!/^[a-z0-9][a-z0-9._-]{2,63}$/.test(id)) {
    throw new Error('Extension id must use lowercase letters, digits, dots, underscores, or hyphens.');
  }
  if (id.startsWith('core.')) {
    throw new Error('External extensions cannot impersonate reserved "core.*" integrated IDs.');
  }

  const name = assertCleanString(obj.name, 'name', 80);
  const version = assertCleanString(obj.version, 'version', 24);
  const author = assertCleanString(obj.author, 'author', 80);
  const description = assertCleanString(obj.description, 'description', 280);
  const dataUsageSummary = assertCleanString(obj.dataUsageSummary, 'dataUsageSummary', 360);

  if (!Array.isArray(obj.permissions) || obj.permissions.length === 0) {
    throw new Error('Extension must declare at least one explicit permission scope.');
  }

  const permSet = new Set<ExtensionPermission>();
  for (const rawPerm of obj.permissions) {
    if (
      typeof rawPerm !== 'string' ||
      !(ALLOWED_EXTENSION_PERMISSIONS as readonly string[]).includes(rawPerm)
    ) {
      throw new Error(`Unsupported or blocked permission requested: "${String(rawPerm)}".`);
    }
    permSet.add(rawPerm as ExtensionPermission);
  }

  const manifest: QuillvibePluginManifest = {
    magic: obj.magic,
    id,
    name,
    version,
    author,
    description,
    kind: 'external',
    permissions: Array.from(permSet),
    dataUsageSummary,
  };

  if (obj.rules !== undefined) {
    if (!Array.isArray(obj.rules) || obj.rules.length > 30) {
      throw new Error('Extension "rules" must be an array with at most 30 rules.');
    }
    manifest.rules = obj.rules.map((r, idx) => {
      if (typeof r !== 'object' || r === null) {
        throw new Error(`Invalid rule at index ${idx}.`);
      }
      const ro = r as Record<string, unknown>;
      const ruleId = assertCleanString(ro.id, `rules[${idx}].id`, 48);
      const label = assertCleanString(ro.label, `rules[${idx}].label`, 80);
      const pattern = assertCleanString(ro.pattern, `rules[${idx}].pattern`, 120);
      if (!isSafeRegexPattern(pattern)) {
        throw new Error(`Rule "${label}" uses an unsafe or invalid regex pattern.`);
      }
      const markKind = String(ro.markKind) as ProofreadMarkKind;
      if (!VALID_MARK_KINDS.has(markKind)) {
        throw new Error(`Rule "${label}" specifies unknown proofread markKind "${ro.markKind}".`);
      }
      const rawFlags = typeof ro.flags === 'string' ? ro.flags : 'g';
      const safeFlags = Array.from(new Set(rawFlags.replace(/[^gimsu]/g, '').split(''))).join('');
      const finalFlags = safeFlags.includes('g') ? safeFlags : `g${safeFlags}`;

      return {
        id: ruleId,
        label,
        pattern,
        flags: finalFlags,
        markKind,
        replacement: typeof ro.replacement === 'string' ? ro.replacement.slice(0, 120) : undefined,
        note: assertCleanString(ro.note, `rules[${idx}].note`, 200),
      };
    });
  }

  if (obj.transforms !== undefined) {
    if (!Array.isArray(obj.transforms) || obj.transforms.length > 10) {
      throw new Error('Extension "transforms" must be an array with at most 10 transforms.');
    }
    const allowedTransforms = new Set([
      'smart-typography',
      'collapse-double-spaces',
      'trim-trailing-spaces',
      'strip-straight-quotes',
    ]);
    manifest.transforms = obj.transforms.map((t, idx) => {
      if (typeof t !== 'object' || t === null) throw new Error(`Invalid transform at index ${idx}.`);
      const to = t as Record<string, unknown>;
      const kind = String(to.kind);
      if (!allowedTransforms.has(kind)) {
        throw new Error(`Transform kind "${kind}" is not permitted in sandboxed extensions.`);
      }
      return {
        id: assertCleanString(to.id, `transforms[${idx}].id`, 48),
        label: assertCleanString(to.label, `transforms[${idx}].label`, 80),
        description: assertCleanString(to.description, `transforms[${idx}].description`, 200),
        kind: kind as NonNullable<QuillvibePluginManifest['transforms']>[number]['kind'],
      };
    });
  }

  if (obj.presets !== undefined) {
    if (!Array.isArray(obj.presets) || obj.presets.length > 10) {
      throw new Error('Extension "presets" must be an array with at most 10 items.');
    }
    manifest.presets = obj.presets.map((p, idx) => {
      if (typeof p !== 'object' || p === null) throw new Error(`Invalid preset at index ${idx}.`);
      const po = p as Record<string, unknown>;
      let safeTypo:
        | {
            fontFamily?: string;
            fontSizePt?: number;
            lineHeight?: number;
            marginInches?: number;
            dropCaps?: boolean;
          }
        | undefined;
      if (typeof po.typography === 'object' && po.typography !== null) {
        const to = po.typography as Record<string, unknown>;
        safeTypo = {
          fontFamily:
            typeof to.fontFamily === 'string' && /^[a-z0-9-]+$/i.test(to.fontFamily)
              ? to.fontFamily
              : undefined,
          fontSizePt:
            typeof to.fontSizePt === 'number' && Number.isFinite(to.fontSizePt)
              ? Math.max(8, Math.min(24, to.fontSizePt))
              : undefined,
          lineHeight:
            typeof to.lineHeight === 'number' && Number.isFinite(to.lineHeight)
              ? Math.max(1, Math.min(3, to.lineHeight))
              : undefined,
          marginInches:
            typeof to.marginInches === 'number' && Number.isFinite(to.marginInches)
              ? Math.max(0.25, Math.min(2.5, to.marginInches))
              : undefined,
          dropCaps: typeof to.dropCaps === 'boolean' ? to.dropCaps : undefined,
        };
      }
      return {
        id: assertCleanString(po.id, `presets[${idx}].id`, 48),
        label: assertCleanString(po.label, `presets[${idx}].label`, 80),
        paperTheme:
          po.paperTheme === 'obsidian' || po.paperTheme === 'parchment' || po.paperTheme === 'ivory'
            ? po.paperTheme
            : undefined,
        typography: safeTypo as QuillvibePluginManifest['presets'] extends Array<infer U>
          ? U extends { typography?: infer T }
            ? T
            : never
          : never,
      };
    });
  }

  if (obj.metricsReport === 'readability') {
    manifest.metricsReport = 'readability';
  }

  if (obj.fonts !== undefined) {
    if (!Array.isArray(obj.fonts) || obj.fonts.length > 16) {
      throw new Error('Extension "fonts" must be an array with at most 16 font definitions.');
    }
    manifest.fonts = obj.fonts.map((f, idx) => {
      if (typeof f !== 'object' || f === null) throw new Error(`Invalid font at index ${idx}.`);
      const fo = f as Record<string, unknown>;
      const cat = fo.category === 'sans' || fo.category === 'mono' ? fo.category : 'serif';
      const dataUrl =
        typeof fo.dataUrl === 'string' &&
        /^data:font\/(ttf|otf|woff|woff2);base64,[A-Za-z0-9+/=]+$/.test(fo.dataUrl)
          ? fo.dataUrl
          : undefined;
      const cssStack = assertCleanString(fo.cssStack, `fonts[${idx}].cssStack`, 160);
      if (!/^[a-zA-Z0-9\s,'"-]+$/.test(cssStack)) {
        throw new Error(`Extension font "${fo.family}" contains unsafe CSS characters in cssStack.`);
      }
      return {
        id: assertCleanString(fo.id, `fonts[${idx}].id`, 48),
        family: assertCleanString(fo.family, `fonts[${idx}].family`, 64),
        cssStack,
        category: cat,
        dataUrl,
      };
    });
  }

  return manifest;
}

export function loadInstalledExtensions(): InstalledExtension[] {
  let savedExternal: InstalledExtension[] = [...memoryExternalExtensions];
  const integratedState = new Map<string, InstalledExtension>();

  if (typeof window !== 'undefined' && window.localStorage) {
    savedExternal = [];
    try {
      const raw =
        window.localStorage.getItem(EXTENSIONS_STORAGE_KEY) ??
        window.localStorage.getItem(LEGACY_EXTENSIONS_STORAGE_KEY);
      if (raw) {
        const parsed = safeJsonParse<InstalledExtension[]>(raw);
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            if (!item || !item.manifest) continue;
            if (item.source === 'integrated') {
              integratedState.set(item.manifest.id, item);
            } else {
              savedExternal.push(item);
            }
          }
        }
      }
    } catch {
      // Ignore corrupt storage gracefully
    }
  }

  const builtIns: InstalledExtension[] = INTEGRATED_EXTENSIONS.map((manifest) => {
    const prev = integratedState.get(manifest.id);
    const validPrevPerms = prev?.grantedPermissions.filter((p) =>
      manifest.permissions.includes(p),
    );
    return {
      manifest: structuredClone(manifest),
      source: 'integrated',
      enabled: prev ? prev.enabled : true,
      grantedPermissions:
        validPrevPerms && validPrevPerms.length > 0 ? validPrevPerms : [...manifest.permissions],
      installedAt: prev?.installedAt ?? '2026-11-23T00:00:00.000Z',
      sha256: 'integrated-core',
    };
  });

  return [...builtIns, ...savedExternal];
}

export function saveInstalledExtensions(items: InstalledExtension[]): void {
  memoryExternalExtensions = items.filter((i) => i.source === 'external');
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(EXTENSIONS_STORAGE_KEY, JSON.stringify(items));
  } catch {
    // Ignore storage quota issues
  }
}

export function loadExtensionAuditLog(): ExtensionAuditEntry[] {
  if (typeof window === 'undefined' || !window.localStorage) {
    return [...memoryAuditLog];
  }
  try {
    const raw =
      window.localStorage.getItem(AUDIT_STORAGE_KEY) ??
      window.localStorage.getItem(LEGACY_AUDIT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = safeJsonParse<ExtensionAuditEntry[]>(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function appendAuditLog(
  entry: Omit<ExtensionAuditEntry, 'id' | 'timestamp'>,
): ExtensionAuditEntry[] {
  const existing = loadExtensionAuditLog();
  const next: ExtensionAuditEntry[] = [
    {
      ...entry,
      id: newId('audit'),
      timestamp: new Date().toISOString(),
    },
    ...existing,
  ].slice(0, 50);

  memoryAuditLog = next;
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem(AUDIT_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Ignore quota
    }
  }
  return next;
}

export function clearExtensionAuditLog(): void {
  memoryAuditLog = [];
  if (typeof window === 'undefined' || !window.localStorage) return;
  window.localStorage.removeItem(AUDIT_STORAGE_KEY);
}

function assertPermissions(ext: InstalledExtension, required: ExtensionPermission[]): void {
  if (!ext.enabled) {
    throw new Error(`Extension "${ext.manifest.name}" is currently disabled.`);
  }
  for (const perm of required) {
    if (!ext.manifest.permissions.includes(perm) || !ext.grantedPermissions.includes(perm)) {
      throw new Error(
        `Permission denied: "${ext.manifest.name}" lacks granted scope "${perm}".`,
      );
    }
  }
}

export function runExtensionRulesOnScene(
  ext: InstalledExtension,
  project: BookProject,
  sceneId: string,
): { project: BookProject; addedMarks: number } {
  assertPermissions(ext, ['read:active-scene', 'propose:proofread-marks']);
  const next = normalizeProjectDefaults(project);
  const ctx = findSceneContext(next, sceneId);
  if (!ctx) return { project: next, addedMarks: 0 };

  const rules = ext.manifest.rules ?? [];
  const content = ctx.scene.content;
  const authorLabel = `${ext.manifest.name}`;
  let workingProject = next;
  let totalAdded = 0;

  for (const rule of rules) {
    if (!isSafeRegexPattern(rule.pattern)) continue;
    const regex = new RegExp(rule.pattern, rule.flags || 'g');
    let ruleMatches = 0;
    let m: RegExpExecArray | null;
    while ((m = regex.exec(content)) !== null) {
      if (m[0].length === 0) {
        regex.lastIndex++;
        continue;
      }
      if (ruleMatches >= 60 || totalAdded >= 200) break;
      const res = addProofreadMark(workingProject, sceneId, {
        kind: rule.markKind,
        start: m.index,
        end: m.index + m[0].length,
        replacement: rule.replacement,
        note: rule.note,
        authorName: authorLabel,
        role: 'proofreader',
      });
      workingProject = res.project;
      ruleMatches++;
      totalAdded++;
    }
  }

  appendAuditLog({
    extensionId: ext.manifest.id,
    extensionName: ext.manifest.name,
    action: `Proposed ${totalAdded} proofreading mark(s) on "${ctx.scene.title}"`,
    permissionsUsed: ['read:active-scene', 'propose:proofread-marks'],
    dataAccessed: `Scene "${ctx.scene.title}" (${countWords(content)} words)`,
  });

  return { project: workingProject, addedMarks: totalAdded };
}

export function runExtensionTransformOnScene(
  ext: InstalledExtension,
  transformId: string,
  project: BookProject,
  sceneId: string,
): { project: BookProject; changed: boolean } {
  assertPermissions(ext, ['read:active-scene', 'apply:text-transform']);
  const tr = (ext.manifest.transforms ?? []).find((t) => t.id === transformId);
  if (!tr) {
    throw new Error(`Transform "${transformId}" not found on "${ext.manifest.name}".`);
  }

  const next = normalizeProjectDefaults(project);
  const ctx = findSceneContext(next, sceneId);
  if (!ctx) return { project: next, changed: false };

  const scene = next.parts[ctx.partIndex].chapters[ctx.chapterIndex].scenes[ctx.sceneIndex];
  const prev = scene.content;
  let updated = prev;

  switch (tr.kind) {
    case 'smart-typography':
      updated = applySmartTypography(prev);
      break;
    case 'collapse-double-spaces':
      updated = prev.replace(/[^\S\r\n]{2,}/g, ' ');
      break;
    case 'trim-trailing-spaces':
      updated = prev.replace(/[^\S\r\n]+$/gm, '');
      break;
    case 'strip-straight-quotes':
      updated = prev.replace(/"([^"]*)"/g, '“$1”');
      break;
  }

  if (updated !== prev) {
    scene.snapshots.unshift({
      id: newId('snap'),
      createdAt: new Date().toISOString(),
      label: `Before ${tr.label}`,
      content: prev,
      wordCount: countWords(prev),
    });
    scene.content = updated;
    scene.updatedAt = new Date().toISOString();
  }

  appendAuditLog({
    extensionId: ext.manifest.id,
    extensionName: ext.manifest.name,
    action: `Ran transform "${tr.label}" (${updated !== prev ? 'modified with snapshot' : 'no changes needed'})`,
    permissionsUsed: ['read:active-scene', 'apply:text-transform'],
    dataAccessed: `Scene "${ctx.scene.title}" (${countWords(prev)} words)`,
  });

  return { project: next, changed: updated !== prev };
}

export interface ReadabilityReport {
  words: number;
  sentences: number;
  paragraphs: number;
  avgWordsPerSentence: number;
  dialogueRatioPct: number;
  fleschKincaidGrade: number;
}

function countSyllablesApprox(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (w.length <= 3) return w.length > 0 ? 1 : 0;
  const trimmed = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '');
  const groups = trimmed.match(/[aeiouy]{1,2}/g);
  return Math.max(1, groups ? groups.length : 1);
}

export function runExtensionReadabilityReport(
  ext: InstalledExtension,
  project: BookProject,
  sceneId: string,
): ReadabilityReport {
  assertPermissions(ext, ['read:active-scene']);
  const ctx = findSceneContext(project, sceneId);
  const content = ctx?.scene.content ?? '';
  const wordMatches = content.match(/[A-Za-z0-9’'-]+/g) ?? [];
  const words = wordMatches.length;
  const sentences = Math.max(1, (content.match(/[.!?]+(?=\s|$|[”"])/g) ?? []).length);
  const paragraphs = Math.max(
    1,
    content
      .split(/\r?\n\s*\r?\n/)
      .filter((p) => p.trim().length > 0).length,
  );
  const syllables = wordMatches.reduce((acc, w) => acc + countSyllablesApprox(w), 0);
  const avgWordsPerSentence = words > 0 ? Number((words / sentences).toFixed(1)) : 0;
  const quotedChars = (content.match(/[“"][^”"]*[”"]/g) ?? []).reduce(
    (acc, q) => acc + q.length,
    0,
  );
  const dialogueRatioPct =
    content.length > 0 ? Math.min(100, Math.round((quotedChars / content.length) * 100)) : 0;
  const fkGrade =
    words > 0
      ? Number(
          Math.max(
            1,
            0.39 * (words / sentences) + 11.8 * (syllables / words) - 15.59,
          ).toFixed(1),
        )
      : 0;

  appendAuditLog({
    extensionId: ext.manifest.id,
    extensionName: ext.manifest.name,
    action: `Analyzed readability metrics (${words} words, FK grade ${fkGrade})`,
    permissionsUsed: ['read:active-scene'],
    dataAccessed: `Scene "${ctx?.scene.title ?? 'None'}" (read-only)`,
  });

  return {
    words,
    sentences,
    paragraphs,
    avgWordsPerSentence,
    dialogueRatioPct,
    fleschKincaidGrade: fkGrade,
  };
}

export function applyExtensionPreset(
  ext: InstalledExtension,
  presetId: string,
  project: BookProject,
): BookProject {
  assertPermissions(ext, ['add:export-preset']);
  const preset = (ext.manifest.presets ?? []).find((p) => p.id === presetId);
  if (!preset) {
    throw new Error(`Preset "${presetId}" not found on "${ext.manifest.name}".`);
  }
  const next = normalizeProjectDefaults(project);
  if (preset.paperTheme) next.paperTheme = preset.paperTheme;
  if (preset.typography) {
    next.typography = { ...next.typography, ...preset.typography };
  }

  appendAuditLog({
    extensionId: ext.manifest.id,
    extensionName: ext.manifest.name,
    action: `Applied typography preset "${preset.label}"`,
    permissionsUsed: ['add:export-preset'],
    dataAccessed: 'Typography & paper theme settings only',
  });

  return next;
}
