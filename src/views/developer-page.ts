import type { AppActions } from '../core/app-context';
import { exportGenericFile } from '../core/bridge';
import {
  ALLOWED_EXTENSION_PERMISSIONS,
  computeManifestSha256,
  EXTENSION_PERMISSION_INFO,
  SANDBOX_BLOCKED_CAPABILITIES,
  SAMPLE_EXTERNAL_EXTENSION_JSON,
  validateExternalExtensionManifest,
} from '../core/plugins';
import { el, icon } from '../ui/dom';
import { createAppThemeButton } from '../ui/theme-button';
import { showExtensionsModal } from './extensions-modal';

interface StarterTemplate {
  id: string;
  label: string;
  filename: string;
  json: string;
}

const DEV_STARTER_TEMPLATES: readonly StarterTemplate[] = [
  {
    id: 'proof-rules',
    label: 'Proofreading Rules',
    filename: 'house-style-rules',
    json: SAMPLE_EXTERNAL_EXTENSION_JSON,
  },
  {
    id: 'text-transform',
    label: 'Text Cleanup Transform',
    filename: 'scene-cleanup-kit',
    json: JSON.stringify(
      {
        magic: 'QUILLVIBE_EXT_V2',
        id: 'dev.clean-punctuation',
        name: 'Manuscript Punctuation Normalizer',
        version: '1.0.0',
        author: 'Independent Author Press',
        description: 'Normalizes straight quotes, ellipses, and extra spaces after saving an automatic recovery snapshot.',
        kind: 'external',
        dataUsageSummary: 'Reads active scene prose, saves a revision snapshot, and normalizes spacing and quotation marks locally.',
        permissions: ['read:active-scene', 'apply:text-transform'],
        transforms: [
          {
            id: 'normalize-quotes',
            label: 'Smart Quotes & Em-Dashes',
            description: 'Converts straight quotes, double hyphens, and three dots into typeset glyphs.',
            kind: 'smart-typography',
          },
          {
            id: 'strip-trailing',
            label: 'Trim Line Endings',
            description: 'Removes trailing spaces at the end of every line.',
            kind: 'trim-trailing-spaces',
          },
        ],
      },
      null,
      2,
    ),
  },
  {
    id: 'export-preset',
    label: 'Print Trim Preset Pack',
    filename: 'novel-trim-presets',
    json: JSON.stringify(
      {
        magic: 'QUILLVIBE_EXT_V2',
        id: 'dev.indie-trade-presets',
        name: 'Indie Trade & Novella Presets',
        version: '1.0.0',
        author: 'Harbor Press Tools',
        description: 'Adds pre-configured trim, margin, and line-height presets for novellas and 6x9 hardcovers.',
        kind: 'external',
        dataUsageSummary: 'Updates interior typography fields only when clicked. Does not read manuscript prose.',
        permissions: ['add:export-preset'],
        presets: [
          {
            id: 'novella-5x8',
            label: 'Novella Digest 5" × 8" (10.5pt)',
            paperTheme: 'parchment',
            typography: { trimSize: '5x8', fontFamily: 'baskerville', fontSizePt: 10.5, lineHeight: 1.52, dropCaps: true },
          },
          {
            id: 'hardcover-royal',
            label: 'Royal Literary 6.14" × 9.21" (11pt)',
            paperTheme: 'ivory',
            typography: { trimSize: 'royal', fontFamily: 'garamond', fontSizePt: 11, lineHeight: 1.58, dropCaps: true },
          },
        ],
      },
      null,
      2,
    ),
  },
  {
    id: 'font-pack',
    label: 'Editorial Font Pack',
    filename: 'editorial-font-pack',
    json: JSON.stringify(
      {
        magic: 'QUILLVIBE_EXT_V2',
        id: 'dev.editorial-font-stack',
        name: 'Classical Press Font Stack',
        version: '1.0.0',
        author: 'Foundry Commons',
        description: 'Registers classic literary serif and monospace drafting stacks offline.',
        kind: 'external',
        dataUsageSummary: 'Registers typeface entries in Settings and Cover Studio. Zero document access.',
        permissions: ['add:font-pack'],
        fonts: [
          {
            id: 'f-baskerville-old',
            family: 'Classical Baskerville',
            cssStack: '"Libre Baskerville", Baskerville, Georgia, serif',
            category: 'serif',
          },
          {
            id: 'f-draft-mono',
            family: 'Typewriter Proof Mono',
            cssStack: '"IBM Plex Mono", "Courier New", monospace',
            category: 'mono',
          },
        ],
      },
      null,
      2,
    ),
  },
];

let selectedTemplateId = DEV_STARTER_TEMPLATES[0]!.id;
let draftManifestText = DEV_STARTER_TEMPLATES[0]!.json;

export function renderDeveloperPageView(container: HTMLElement, actions: AppActions): void {
  container.textContent = '';

  const schemaRows: Array<[string, string, string]> = [
    ['magic', 'Required header string', '"QUILLVIBE_EXT_V2" (also reads legacy "BOOKVIBE_EXT_V1")'],
    ['id', 'Required unique slug (3–64 chars)', 'Lowercase letters, digits, dots, hyphens, underscores. Reserved prefix "core." is rejected.'],
    ['name', 'Required display name (1–80 chars)', 'Shown in Extensions Sandbox, consent prompt, and audit logs.'],
    ['version', 'Required string (1–24 chars)', 'Use semantic versioning such as "1.0.0".'],
    ['author', 'Required string (1–80 chars)', 'Publisher, pen name, or developer handle shown on install.'],
    ['description', 'Required string (1–280 chars)', 'Concise factual summary of what the extension adds.'],
    ['dataUsageSummary', 'Required string (1–360 chars)', 'Plain explanation of what data the extension reads or modifies.'],
    ['permissions', 'Required non-empty array', 'One or more scopes from the Permission Scopes table below.'],
    ['rules', 'Optional array (max 30 items)', 'Regex proofreading rules matching safe pattern checks (max 120 chars, no lookbehinds or backreferences).'],
    ['transforms', 'Optional array (max 10 items)', 'Allowed kinds: smart-typography, collapse-double-spaces, trim-trailing-spaces, strip-straight-quotes.'],
    ['presets', 'Optional array (max 10 items)', 'Updates paperTheme (ivory | parchment | obsidian) and interior typography fields.'],
    ['fonts', 'Optional array (max 16 items)', 'Registers font families + optional base64 data:font/(ttf|otf|woff|woff2);base64,... URLs.'],
    ['metricsReport', 'Optional literal', 'Set to "readability" to expose local word, sentence, dialogue, and grade-level stats.'],
  ];

  const schemaTable = el('div', { style: { display: 'grid', gap: '8px', marginTop: '8px' } });
  for (const [field, req, detail] of schemaRows) {
    schemaTable.appendChild(
      el(
        'div',
        {
          style: {
            display: 'grid',
            gridTemplateColumns: 'minmax(135px, 175px) minmax(145px, 195px) 1fr',
            gap: '10px',
            padding: '8px 10px',
            borderRadius: '6px',
            border: '1px solid var(--border-hairline)',
            background: 'var(--bg-canvas)',
            fontSize: '12.5px',
          },
        },
        el('code', { text: field, style: { fontWeight: '700' } }),
        el('span', { className: 'bv-mono-tag', text: req }),
        el('span', { className: 'bv-label', text: detail }),
      ),
    );
  }

  const permGrid = el('div', { style: { display: 'grid', gap: '8px', marginTop: '8px' } });
  for (const scope of ALLOWED_EXTENSION_PERMISSIONS) {
    const info = EXTENSION_PERMISSION_INFO[scope];
    permGrid.appendChild(
      el(
        'div',
        {
          style: {
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '12px',
            flexWrap: 'wrap',
            padding: '8px 10px',
            borderRadius: '6px',
            border: '1px solid var(--border-hairline)',
            background: 'var(--bg-canvas)',
          },
        },
        el(
          'div',
          {},
          el('code', { text: scope, style: { fontWeight: '700', marginRight: '8px' } }),
          el('strong', { text: info.title, style: { fontSize: '12.5px' } }),
          el('div', { className: 'bv-label', text: info.dataAccessed, style: { marginTop: '2px' } }),
        ),
        el('span', { className: 'bv-mono-tag', text: info.riskLabel }),
      ),
    );
  }

  const sandboxList = el('ul', { className: 'qv-help-detail-list' });
  for (const rule of SANDBOX_BLOCKED_CAPABILITIES) {
    sandboxList.appendChild(el('li', { text: rule }));
  }

  // Interactive .qvext Manifest Validator & Sandbox Launcher
  const manifestInput = el('textarea', {
    className: 'bv-textarea',
    attrs: {
      rows: 16,
      spellcheck: 'false',
      'aria-label': 'Extension manifest JSON editor',
    },
    style: { fontFamily: 'var(--font-mono)', fontSize: '12px', lineHeight: '1.45' },
  });
  manifestInput.value = draftManifestText;
  manifestInput.addEventListener('input', () => {
    draftManifestText = manifestInput.value;
  });

  const validatorResult = el('div', {
    className: 'bv-list-card',
    style: { background: 'var(--bg-canvas)', fontSize: '12.5px' },
    text: 'Edit the JSON manifest above or pick a starter template, then click Validate & Hash.',
  });

  const templateRow = el('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } });
  const syncTemplateButtons = () => {
    templateRow.querySelectorAll('button').forEach((b) => {
      b.classList.toggle('is-active', b.getAttribute('data-tpl-id') === selectedTemplateId);
    });
  };
  for (const tpl of DEV_STARTER_TEMPLATES) {
    templateRow.appendChild(
      el('button', {
        className: `bv-fmt-btn${selectedTemplateId === tpl.id ? ' is-active' : ''}`,
        text: tpl.label,
        attrs: { type: 'button', 'data-tpl-id': tpl.id },
        on: {
          click: () => {
            selectedTemplateId = tpl.id;
            draftManifestText = tpl.json;
            manifestInput.value = tpl.json;
            syncTemplateButtons();
            validatorResult.textContent = `Loaded "${tpl.label}" template.`;
            validatorResult.style.borderColor = 'var(--border-hairline)';
          },
        },
      }),
    );
  }

  const runValidate = async () => {
    try {
      const parsed = validateExternalExtensionManifest(manifestInput.value);
      const sha = await computeManifestSha256(manifestInput.value);
      validatorResult.textContent = `Valid manifest: ${parsed.name} v${parsed.version} (${parsed.id}) | Permissions: ${parsed.permissions.join(', ')} | SHA-256 prefix: ${sha}`;
      validatorResult.style.borderColor = 'var(--accent-emerald)';
      return parsed;
    } catch (err) {
      validatorResult.textContent = `Validation failed: ${err instanceof Error ? err.message : String(err)}`;
      validatorResult.style.borderColor = '#d4827d';
      return null;
    }
  };

  const validatorCard = el(
    'section',
    { className: 'bv-cork-card', id: 'dev-validator' },
    el('h2', { className: 'qv-help-article-title', text: 'Interactive .qvext Manifest Validator & Starter Templates' }),
    el('p', {
      className: 'qv-help-article-summary',
      text: 'Test your .qvext JSON against the exact parser rules before distributing, compute its consent SHA-256 fingerprint, download the .qvext package, or load it directly into your local sandbox.',
    }),
    templateRow,
    manifestInput,
    el(
      'div',
      { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
      el('button', {
        className: 'bv-btn bv-btn-primary',
        text: 'Validate & Compute SHA-256',
        attrs: { type: 'button' },
        on: { click: () => void runValidate() },
      }),
      el('button', {
        className: 'bv-btn',
        text: 'Test in Extensions Sandbox',
        attrs: { type: 'button' },
        on: {
          click: async () => {
            const ok = await runValidate();
            if (!ok) return;
            await showExtensionsModal(actions, {
              initialTab: 'external',
              pendingExternalRawJson: manifestInput.value,
            });
          },
        },
      }),
      el('button', {
        className: 'bv-btn',
        text: 'Download .qvext File',
        attrs: { type: 'button' },
        on: {
          click: async () => {
            const ok = await runValidate();
            if (!ok) return;
            await exportGenericFile({
              suggestedName: ok.id.replace(/[^a-z0-9._-]/gi, '-'),
              extension: 'qvext',
              description: 'Quillvibe External Extension (.qvext)',
              mimeType: 'application/json;charset=utf-8',
              textContent: manifestInput.value,
            });
            actions.notify(`Exported ${ok.id}.qvext`);
          },
        },
      }),
    ),
    validatorResult,
  );

  const page = el(
    'div',
    { className: 'qv-help-page' },
    el(
      'div',
      { className: 'qv-help-page-inner' },
      el(
        'header',
        { className: 'qv-help-hero' },
        el(
          'div',
          { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' } },
          el(
            'div',
            {},
            el('h1', { className: 'qv-help-title', text: 'Developer' }),
            el('p', {
              className: 'qv-help-subtitle',
              text: 'Build, validate, hash, and test .qvext extension packages.',
            }),
          ),
          el(
            'div',
            { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' } },
            el(
              'button',
              {
                className: 'bv-btn bv-btn-primary',
                attrs: { type: 'button' },
                on: { click: () => actions.openExtensionsModal('external') },
              },
              icon('extensions', 14),
              'Sandbox',
            ),
            el(
              'button',
              {
                className: 'bv-btn bv-btn-icon',
                tooltip: { title: 'Help & FAQ', short: 'Open the Help Center & Error FAQ.' },
                attrs: { type: 'button', 'aria-label': 'Help & FAQ' },
                on: { click: () => actions.openHelpPage() },
              },
              icon('help', 15),
            ),
            el(
              'button',
              {
                className: 'bv-btn',
                attrs: { type: 'button' },
                on: { click: () => actions.returnToWriting() },
              },
              icon('quill', 14),
              'Back to Writing',
            ),
            createAppThemeButton(actions),
          ),
        ),
      ),
      el(
        'section',
        { className: 'bv-cork-card' },
        el(
          'div',
          { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap' } },
          el('h2', { className: 'qv-help-article-title', text: 'Quillvibe Extension Builder App (Coming Soon)' }),
        ),
        el('p', {
          className: 'qv-help-article-summary',
          text: 'A dedicated standalone desktop application for authoring, linting, live-testing against sample manuscripts, and packaging signed .qvext add-ons is currently in planning.',
        }),
        el(
          'ul',
          { className: 'qv-help-detail-list' },
          el('li', { text: 'Live regex rule debugger that tests pattern speed and verifies ReDoS safety rules before export.' }),
          el('li', { text: 'Visual packager for embedding WOFF2/TTF fonts, print trim presets, and house editorial stylebooks into a single .qvext file.' }),
          el('li', { text: 'Direct one-click handoff to your installed Quillvibe desktop app for end-to-end permission testing.' }),
          el('li', { text: 'Follow progress on GitHub Releases or email quillvibe@jhonrey.com to join early developer testing.' }),
        ),
      ),
      validatorCard,
      el(
        'section',
        { className: 'bv-cork-card' },
        el('h2', { className: 'qv-help-article-title', text: 'Manifest Schema Reference (QUILLVIBE_EXT_V2)' }),
        el('p', {
          className: 'qv-help-article-summary',
          text: 'Every .qvext file is a UTF-8 JSON object validated strictly before showing the user consent screen. All 15 markKind values (delete, insert, substitute, comment, highlight, transpose, stet, paragraph, run-in, closeup, space, capitalize, lowercase, italic, bold) and valid Regex flags (g, i, m, s, u) are supported.',
        }),
        schemaTable,
      ),
      el(
        'section',
        { className: 'bv-cork-card' },
        el('h2', { className: 'qv-help-article-title', text: 'Permission Scopes & Sandbox Enforcement' }),
        el('p', {
          className: 'qv-help-article-summary',
          text: 'Users can approve or uncheck individual requested scopes on installation. Every run records an entry in the Extension Data Access Audit Log.',
        }),
        permGrid,
        el('h3', { text: 'Blocked Outside Sandbox', style: { fontSize: '13.5px', margin: '10px 0 2px' } }),
        sandboxList,
      ),
      el(
        'footer',
        { className: 'bv-cork-card qv-help-footer' },
        el('strong', { text: 'Developer Relations, Pull Requests & Extension Review' }),
        el('p', {
          className: 'bv-label',
          text: 'Publish your .qvext manifest openly on GitHub or your own domain with its SHA-256 digest so authors can verify it in the consent prompt. For API proposals, documentation corrections, developer previews, or security reports, email quillvibe@jhonrey.com.',
          style: { margin: '4px 0 0' },
        }),
      ),
    ),
  );

  container.appendChild(page);
}
