import type { AppActions } from '../core/app-context';
import { ALARM_RINGTONES, playRingtonePreview } from '../core/alarm';
import { exportGenericFile, getDesktopRuntimeInfo, isTauriRuntime } from '../core/bridge';
import {
  buildPortableMigrationJson,
  buildPortableMigrationMarkdown,
  buildRtfExport,
  EXPORT_FORMAT_OPTIONS,
} from '../core/export';
import {
  getAllAvailableFontChoices,
  installDeviceFontFile,
  loadCustomFonts,
  pickLocalSystemFont,
  removeCustomFont,
} from '../core/fonts';
import { normalizeProjectDefaults } from '../core/library';
import { getAllScenes } from '../core/manuscript';
import { buildEditorialHandoffReport, importAnyExternalDocumentFile } from '../core/migrate';
import { loadExtensionAuditLog } from '../core/plugins';
import { getPublisherProvenance, verifyPublisherProvenance } from '../core/provenance';
import {
  DEFAULT_SETTINGS,
  formatAppWindowTitle,
  mapAppThemeToPaperTheme,
} from '../core/settings';
import {
  APP_COMMIT,
  APP_VERSION,
  compareSemver,
  isPrereleaseVersion,
} from '../core/version';
import type {
  AlarmRingtoneId,
  AppThemeId,
  EditorialStage,
  ExportFormatId,
  ToolbarDisplayMode,
  ToolTier,
  WindowTitleMode,
} from '../core/types';
import { clearNode, el, icon, preserveScrollPositions, quillvibeLogo, type IconName } from '../ui/dom';
import { createAppThemeButton } from '../ui/theme-button';

export type SettingsTab = 'fonts' | 'editor' | 'publishing' | 'developer';

let currentSettingsTab: SettingsTab = 'editor';

export function setSettingsPageTab(tab: SettingsTab): void {
  currentSettingsTab = tab;
}

const SETTINGS_TABS: Array<{ id: SettingsTab; label: string; iconName: IconName }> = [
  { id: 'editor', label: 'Appearance', iconName: 'appearance' },
  { id: 'fonts', label: 'Fonts', iconName: 'font-family' },
  { id: 'publishing', label: 'Publishing', iconName: 'publish-book' },
  { id: 'developer', label: 'Developer', iconName: 'terminal' },
];

const EDITORIAL_STAGES: Array<{ id: EditorialStage; label: string }> = [
  { id: 'acquisition', label: 'Acquisition / Proposal' },
  { id: 'developmental', label: 'Developmental Edit' },
  { id: 'line-edit', label: 'Line Edit' },
  { id: 'copyedit', label: 'Copyedit' },
  { id: 'proofread', label: 'Final Proofread' },
  { id: 'print-ready', label: 'Print & Press Ready' },
];

const CURRENT_QUILLVIBE_VERSION = APP_VERSION;

function appendInlineMarkdown(target: HTMLElement, text: string): void {
  const tokenRegex = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = tokenRegex.exec(text)) !== null) {
    if (match.index > last) {
      target.appendChild(document.createTextNode(text.slice(last, match.index)));
    }
    const raw = match[0];
    if (raw.startsWith('**')) {
      target.appendChild(el('strong', { text: raw.slice(2, -2) }));
    } else {
      target.appendChild(el('code', { text: raw.slice(1, -1), style: { fontSize: '11.5px' } }));
    }
    last = tokenRegex.lastIndex;
  }
  if (last < text.length) {
    target.appendChild(document.createTextNode(text.slice(last)));
  }
}

function renderFormattedReleaseNotes(body: string): HTMLElement {
  const wrap = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } });
  const lines = body.slice(0, 1200).split(/\r?\n/);
  let currentList: HTMLUListElement | null = null;
  const flushList = () => {
    if (currentList) {
      wrap.appendChild(currentList);
      currentList = null;
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line === '---') {
      flushList();
      continue;
    }
    const headingMatch = /^#{1,4}\s+(.+)$/.exec(line);
    if (headingMatch) {
      flushList();
      const h = el('div', { style: { fontWeight: '600', fontSize: '12.5px', color: 'var(--text-primary)', marginTop: '4px' } });
      appendInlineMarkdown(h, headingMatch[1]);
      wrap.appendChild(h);
      continue;
    }
    if (line.startsWith('- ') || line.startsWith('* ')) {
      if (!currentList) {
        currentList = el('ul', {
          style: { margin: '0', paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '3px', fontSize: '12px', color: 'var(--text-secondary)' },
        });
      }
      const li = el('li');
      appendInlineMarkdown(li, line.slice(2).trim());
      currentList.appendChild(li);
      continue;
    }
    flushList();
    const p = el('p', { style: { margin: '0', fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.45' } });
    appendInlineMarkdown(p, line);
    wrap.appendChild(p);
  }
  flushList();
  return wrap;
}

interface GitHubReleaseAsset {
  name?: string;
  size?: number;
  browser_download_url?: string;
}

function pickInstallerAssetForPlatform(
  assets: GitHubReleaseAsset[],
  platformOs: string,
): GitHubReleaseAsset | null {
  const os = platformOs.toLowerCase();
  const findBy = (re: RegExp) => assets.find((a) => typeof a.name === 'string' && re.test(a.name));
  if (os.includes('win')) {
    return findBy(/-setup\.exe$/i) ?? findBy(/\.msi$/i) ?? null;
  }
  if (os.includes('mac') || os.includes('darwin')) {
    return findBy(/\.dmg$/i) ?? null;
  }
  if (os.includes('linux')) {
    return findBy(/\.AppImage$/i) ?? findBy(/\.deb$/i) ?? findBy(/\.rpm$/i) ?? null;
  }
  return findBy(/-setup\.exe$/i) ?? findBy(/\.dmg$/i) ?? findBy(/\.AppImage$/i) ?? null;
}

function formatByteSize(bytes?: number): string {
  if (!bytes || !Number.isFinite(bytes) || bytes <= 0) return '';
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(1)} MB`;
}

function showUpdateCheckDialog(actions: AppActions): void {
  document.getElementById('qv-update-dialog')?.remove();

  const platformLine = el('div', {
    className: 'bv-mono-tag',
    text: `Installed: v${CURRENT_QUILLVIBE_VERSION} (${APP_COMMIT}) — ${isTauriRuntime() ? 'Desktop App' : 'Web Studio'}`,
  });
  const statusPill = el('span', {
    className: 'qv-update-status-pill is-checking',
    text: 'Checking GitHub Releases…',
  });
  const statusText = el('p', {
    className: 'bv-label',
    style: { margin: '0' },
    text: 'Contacting official jhonrey.com release channel…',
  });
  const notesBox = el('div', {
    className: 'qv-update-notes-scroll',
    style: { display: 'none' },
  });
  const directDownloadBtn = el(
    'a',
    {
      className: 'bv-btn bv-btn-primary',
      attrs: {
        href: 'https://github.com/jhonrey-com/Quillvibe/releases/latest',
        target: '_blank',
        rel: 'noopener noreferrer',
      },
      style: { display: 'none', textDecoration: 'none' },
    },
    icon('download', 14),
    el('span', { text: 'Download Installer' }),
  );
  const allReleasesBtn = el(
    'a',
    {
      className: 'bv-btn',
      attrs: {
        href: 'https://github.com/jhonrey-com/Quillvibe/releases/latest',
        target: '_blank',
        rel: 'noopener noreferrer',
      },
      style: { display: 'none', textDecoration: 'none' },
    },
    'All Release Files',
  );

  const close = () => backdrop.remove();
  const heroCard = el(
    'div',
    { className: 'qv-update-hero' },
    el('div', { className: 'qv-update-logo-box' }, quillvibeLogo(34)),
    el(
      'div',
      { className: 'qv-update-hero-meta' },
      el('strong', { text: 'Quillvibe', style: { fontSize: '15px', letterSpacing: '-0.01em' } }),
      platformLine,
      statusPill,
    ),
  );

  const modal = el(
    'div',
    {
      className: 'bv-modal',
      style: { maxWidth: '560px' },
      attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Quillvibe Software Updates' },
    },
    el(
      'div',
      { className: 'bv-panel-head' },
      el('span', { className: 'bv-panel-title', text: 'Quillvibe Software Updates' }),
      el('button', {
        className: 'bv-mini-btn',
        text: 'Close',
        attrs: { type: 'button' },
        on: { click: close },
      }),
    ),
    el(
      'div',
      { className: 'bv-modal-body', style: { gap: '12px' } },
      heroCard,
      statusText,
      notesBox,
      el(
        'div',
        { style: { display: 'flex', justifyContent: 'flex-end', gap: '8px', flexWrap: 'wrap', marginTop: '4px' } },
        allReleasesBtn,
        directDownloadBtn,
        el('button', {
          className: 'bv-btn',
          text: 'Done',
          attrs: { type: 'button' },
          on: { click: close },
        }),
      ),
    ),
  );

  const backdrop = el(
    'div',
    {
      className: 'bv-modal-backdrop',
      id: 'qv-update-dialog',
      on: {
        click: (e) => {
          if (e.target === backdrop) close();
        },
      },
    },
    modal,
  );
  document.body.appendChild(backdrop);

  const runtimePromise = getDesktopRuntimeInfo().catch(() => null);
  const releasePromise = fetch('https://api.github.com/repos/jhonrey-com/Quillvibe/releases/latest', {
    headers: { Accept: 'application/vnd.github+json' },
  }).then(async (res) => {
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as {
      tag_name?: string;
      name?: string;
      body?: string;
      html_url?: string;
      assets?: GitHubReleaseAsset[];
    };
  });

  Promise.all([runtimePromise, releasePromise])
    .then(([runtime, data]) => {
      const detectedOs =
        runtime?.os ||
        (typeof navigator !== 'undefined' ? navigator.platform || navigator.userAgent : 'windows');
      if (runtime) {
        platformLine.textContent = `Installed: v${CURRENT_QUILLVIBE_VERSION} (${APP_COMMIT}) — ${runtime.os} ${runtime.arch}`;
      }

      const latestTag = (data.tag_name || '').replace(/^v/i, '').trim() || CURRENT_QUILLVIBE_VERSION;
      const cmp = compareSemver(latestTag, CURRENT_QUILLVIBE_VERSION);
      const upToDate = cmp <= 0;

      statusPill.classList.remove('is-checking');
      if (cmp > 0) {
        statusPill.classList.add('is-available');
        statusPill.textContent = `Update Available: v${latestTag}`;
        statusText.textContent = `Quillvibe v${latestTag} is ready to install (you are on v${CURRENT_QUILLVIBE_VERSION}).`;
      } else if (cmp < 0 || isPrereleaseVersion(CURRENT_QUILLVIBE_VERSION)) {
        statusPill.classList.add('is-ok');
        statusPill.textContent = `Pre-Release Build: v${CURRENT_QUILLVIBE_VERSION}`;
        statusText.textContent = `Quillvibe v${CURRENT_QUILLVIBE_VERSION} (${APP_COMMIT}) is ahead of public release v${latestTag}.`;
      } else {
        statusPill.classList.add('is-ok');
        statusPill.textContent = `Up to Date: v${CURRENT_QUILLVIBE_VERSION}`;
        statusText.textContent = 'You are running the latest verified release of Quillvibe.';
      }

      const matchedAsset = pickInstallerAssetForPlatform(data.assets ?? [], detectedOs);
      if (matchedAsset?.browser_download_url && matchedAsset.name) {
        directDownloadBtn.setAttribute('href', matchedAsset.browser_download_url);
        const sizeLabel = formatByteSize(matchedAsset.size);
        const labelSpan = directDownloadBtn.querySelector('span');
        if (labelSpan) {
          labelSpan.textContent = sizeLabel
            ? `Download ${matchedAsset.name} (${sizeLabel})`
            : `Download ${matchedAsset.name}`;
        }
        directDownloadBtn.style.display = 'inline-flex';
      } else if (data.html_url) {
        directDownloadBtn.setAttribute('href', data.html_url);
        const labelSpan = directDownloadBtn.querySelector('span');
        if (labelSpan) labelSpan.textContent = `Open Release v${latestTag}`;
        directDownloadBtn.style.display = 'inline-flex';
      }

      if (data.html_url) {
        allReleasesBtn.setAttribute('href', data.html_url);
        allReleasesBtn.style.display = 'inline-flex';
      }

      if (data.body) {
        notesBox.style.display = 'flex';
        notesBox.replaceChildren(
          el('strong', { text: data.name || `Release v${latestTag}`, style: { fontSize: '12.5px' } }),
          renderFormattedReleaseNotes(data.body),
        );
      }

      actions.notify(
        upToDate ? `Quillvibe v${CURRENT_QUILLVIBE_VERSION} is up to date` : `Quillvibe v${latestTag} is available`,
      );
    })
    .catch(() => {
      statusPill.classList.remove('is-checking');
      statusPill.textContent = 'Offline / Unreachable';
      statusText.textContent = `Installed build: v${CURRENT_QUILLVIBE_VERSION} (${APP_COMMIT}). Unable to reach GitHub Releases right now—you can open the downloads page manually below.`;
      allReleasesBtn.style.display = 'inline-flex';
    });
}

export function showSettingsModal(actions: AppActions, initialTab: SettingsTab = 'editor'): void {
  currentSettingsTab = initialTab;
  actions.openSettingsModal(initialTab);
}

export function renderSettingsPageView(container: HTMLElement, actions: AppActions): void {
  const restoreScroll = preserveScrollPositions(container, [
    '.qv-settings-page',
    '.qv-settings-sidebar-nav',
    '.qv-settings-page-content',
  ]);
  clearNode(container);

  let activeTab: SettingsTab = currentSettingsTab;
  const tabBar = el('div', { className: 'qv-settings-sidebar-nav', attrs: { role: 'tablist' } });
  const bodyWrap = el('div', { className: 'qv-settings-page-content' });

  const closeModal = () => {
    actions.returnToWriting();
  };

  const renderTabs = () => {
    tabBar.textContent = '';
    for (const tab of SETTINGS_TABS) {
      tabBar.appendChild(
        el(
          'button',
          {
            className: `qv-settings-nav-item${activeTab === tab.id ? ' is-active' : ''}`,
            attrs: { type: 'button', role: 'tab', 'aria-selected': String(activeTab === tab.id) },
            on: {
              click: () => {
                activeTab = tab.id;
                currentSettingsTab = tab.id;
                renderTabs();
                renderBody();
              },
            },
          },
          icon(tab.iconName, 15),
          el('span', { text: tab.label }),
        ),
      );
    }
  };

  const renderBody = () => {
    bodyWrap.textContent = '';
    const state = actions.getState();
    const project = normalizeProjectDefaults(state.project);
    const settings = state.settings;

    if (activeTab === 'fonts') {
      const fontInput = el('input', {
        attrs: {
          type: 'file',
          accept: '.ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2',
        },
        style: { display: 'none' },
        on: {
          change: async () => {
            const file = fontInput.files?.[0];
            fontInput.value = '';
            if (!file) return;
            try {
              const installed = await installDeviceFontFile(file);
              actions.notify(`Installed font “${installed.family}”`);
              renderBody();
            } catch (err) {
              actions.notify(err instanceof Error ? err.message : 'Unable to install font file.');
            }
          },
        },
      });

      const dropZone = el(
        'div',
        {
          className: 'bv-font-dropzone',
          on: {
            dragover: (e) => {
              e.preventDefault();
              dropZone.classList.add('is-dragover');
            },
            dragleave: () => dropZone.classList.remove('is-dragover'),
            drop: async (e) => {
              e.preventDefault();
              dropZone.classList.remove('is-dragover');
              const file = e.dataTransfer?.files?.[0];
              if (!file) return;
              try {
                const installed = await installDeviceFontFile(file);
                actions.notify(`Installed font “${installed.family}”`);
                renderBody();
              } catch (err) {
                actions.notify(err instanceof Error ? err.message : 'Unable to load font.');
              }
            },
          },
        },
        el('div', {
          text: 'Drop .ttf, .otf, .woff, or .woff2 font files here',
          style: { fontWeight: '600', fontSize: '12.5px' },
        }),
        el('div', {
          className: 'bv-label',
          text: 'Magic-byte checked on arrival. Fonts stay stored locally on your device for Draft sheets, Typeset previews, and Covers.',
        }),
        el(
          'div',
          { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '6px' } },
          el(
            'button',
            {
              className: 'bv-btn bv-btn-primary',
              attrs: { type: 'button' },
              on: { click: () => fontInput.click() },
            },
            icon('folder', 14),
            'Choose Device Font…',
          ),
          el(
            'button',
            {
              className: 'bv-btn',
              attrs: { type: 'button' },
              on: {
                click: async () => {
                  try {
                    const picked = await pickLocalSystemFont();
                    if (!picked) {
                      actions.notify('Local system font picker requires Chromium permission or HTTPS/desktop context. Use "Choose Device Font…" instead.');
                      return;
                    }
                    actions.notify(`Added system font “${picked.family}”`);
                    renderBody();
                  } catch (err) {
                    actions.notify(err instanceof Error ? err.message : 'Unable to read system fonts.');
                  }
                },
              },
            },
            'Pick Installed OS Font…',
          ),
          el(
            'button',
            {
              className: 'bv-btn',
              attrs: { type: 'button' },
              on: {
                click: () => {
                  closeModal();
                  actions.openExtensionsModal('integrated');
                },
              },
            },
            icon('extensions', 14),
            'Browse Extension Font Packs',
          ),
          fontInput,
        ),
      );

      const choices = getAllAvailableFontChoices();
      const customRecords = loadCustomFonts();
      const fontCards = el('div', { className: 'bv-snap-list' });

      for (const opt of choices) {
        const isDraftActive = settings.editorFontFamily === opt.cssStack || (!settings.editorFontFamily && opt.builtInKey === 'garamond');
        const isTypesetActive = project.typography.customFontFamily
          ? project.typography.customFontFamily === opt.id
          : Boolean(opt.builtInKey && project.typography.fontFamily === opt.builtInKey);
        const customEntry = customRecords.find((c) => c.family.toLowerCase() === opt.id.toLowerCase());

        fontCards.appendChild(
          el(
            'div',
            { className: 'bv-list-card', style: { flexDirection: 'column', alignItems: 'stretch', gap: '8px' } },
            el(
              'div',
              { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap' } },
              el(
                'div',
                {},
                el('strong', { text: opt.label, style: { fontSize: '13px' } }),
                el('div', {
                  className: 'bv-mono-tag',
                  text: `Source: ${opt.source}`,
                  style: { marginTop: '2px' },
                }),
              ),
              el(
                'div',
                { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } },
                el('button', {
                  className: `bv-mini-btn${isDraftActive ? ' is-active' : ''}`,
                  text: isDraftActive ? 'Active in Draft' : 'Use in Draft',
                  attrs: { type: 'button' },
                  on: {
                    click: () => {
                      actions.updateSettings({ editorFontFamily: opt.cssStack });
                      actions.notify(`Draft font set to ${opt.label}`);
                      renderBody();
                    },
                  },
                }),
                el('button', {
                  className: `bv-mini-btn${isTypesetActive ? ' is-active' : ''}`,
                  text: isTypesetActive ? 'Active in Typeset' : 'Use in Book Typeset',
                  attrs: { type: 'button' },
                  on: {
                    click: () => {
                      actions.mutateProject((prev) => ({
                        ...prev,
                        typography: opt.builtInKey
                          ? { ...prev.typography, fontFamily: opt.builtInKey, customFontFamily: '' }
                          : { ...prev.typography, customFontFamily: opt.id },
                      }));
                      actions.notify(`Interior book typeface set to ${opt.label}`);
                      renderBody();
                    },
                  },
                }),
                customEntry
                  ? el(
                      'button',
                      {
                        className: 'bv-mini-btn',
                        attrs: { type: 'button', 'aria-label': `Remove ${opt.label}` },
                        on: {
                          click: () => {
                            removeCustomFont(customEntry.id);
                            renderBody();
                          },
                        },
                      },
                      icon('trash', 12),
                    )
                  : null,
              ),
            ),
            el('div', {
              text: 'Chapter One — The sea kept quiet counsel beneath the winter pier. “0123456789”',
              style: {
                fontFamily: opt.cssStack,
                fontSize: '15px',
                color: 'var(--accent-ivory)',
                padding: '6px 8px',
                background: 'var(--bg-canvas)',
                borderRadius: '4px',
                border: '1px solid var(--border-subtle)',
              },
            }),
          ),
        );
      }

      bodyWrap.append(dropZone, el('span', { className: 'bv-panel-title', text: 'Installed Typefaces' }), fontCards);
      return;
    }

    if (activeTab === 'editor') {
      const themeSel = el(
        'select',
        {
          className: 'bv-input',
          id: 'bv-set-theme',
          on: {
            change: () => {
              const appTheme = themeSel.value as AppThemeId;
              actions.updateSettings({ appTheme });
              actions.setState({}, true);
            },
          },
        },
        el('option', { text: 'Match Device (System Light / Dark)', attrs: { value: 'system', selected: settings.appTheme === 'system' } }),
        el('option', { text: 'Ivory Light (Default Writing Studio)', attrs: { value: 'ivory', selected: settings.appTheme === 'ivory' } }),
        el('option', { text: 'Warm Parchment Paper', attrs: { value: 'parchment', selected: settings.appTheme === 'parchment' } }),
        el('option', { text: 'Obsidian Dark Studio', attrs: { value: 'obsidian', selected: settings.appTheme === 'obsidian' } }),
      );

      const tierOptions: Array<{ id: ToolTier; title: string; desc: string }> = [
        { id: 'basic', title: 'Focused', desc: 'Manuscript sheet & notes only.' },
        { id: 'intermediate', title: 'Editorial', desc: 'Adds Corkboard, Outline, Proofread, Typeset.' },
        { id: 'advanced', title: 'Full Studio', desc: 'Adds Story Bible, Graph, Cover Studio, Permissions.' },
      ];
      const tierCardsGrid = el(
        'div',
        { className: 'qv-tier-card-grid', id: 'bv-set-tier' },
        ...tierOptions.map((opt) =>
          el(
            'button',
            {
              className: `qv-tier-card${settings.toolTier === opt.id ? ' is-active' : ''}`,
              attrs: { type: 'button', 'aria-pressed': String(settings.toolTier === opt.id) },
              on: {
                click: () => {
                  actions.updateSettings({ toolTier: opt.id });
                  actions.setState({}, true);
                  actions.notify(`Switched workspace layout to ${opt.title}`);
                  renderBody();
                },
              },
            },
            el('strong', { text: opt.title, style: { fontSize: '12.5px' } }),
            el('span', { className: 'bv-label', text: opt.desc }),
          ),
        ),
      );

      const toolbarModeSel = el(
        'select',
        {
          className: 'bv-input',
          id: 'bv-set-toolbar-mode',
          on: {
            change: () => {
              actions.updateSettings({ toolbarDisplayMode: toolbarModeSel.value as ToolbarDisplayMode });
              actions.setState({}, true);
            },
          },
        },
        el('option', { text: 'Icons Only (Minimal Bar)', attrs: { value: 'icons', selected: settings.toolbarDisplayMode === 'icons' } }),
        el('option', { text: 'Balanced (Icons + Key Labels)', attrs: { value: 'balanced', selected: settings.toolbarDisplayMode === 'balanced' } }),
        el('option', { text: 'Full Details (Icons + Full Descriptions)', attrs: { value: 'detailed', selected: settings.toolbarDisplayMode === 'detailed' } }),
      );

      const densitySel = el(
        'select',
        {
          className: 'bv-input',
          id: 'bv-set-density',
          on: { change: () => actions.updateSettings({ uiDensity: densitySel.value as 'comfortable' | 'compact' }) },
        },
        el('option', { text: 'Comfortable (Standard Spacing)', attrs: { value: 'comfortable', selected: settings.uiDensity === 'comfortable' } }),
        el('option', { text: 'Compact (Dense Editorial View)', attrs: { value: 'compact', selected: settings.uiDensity === 'compact' } }),
      );

      const motionSel = el(
        'select',
        {
          className: 'bv-input',
          id: 'bv-set-motion',
          on: { change: () => actions.updateSettings({ reducedMotionOverride: motionSel.value as 'system' | 'reduce' }) },
        },
        el('option', { text: 'Follow System Preference', attrs: { value: 'system', selected: settings.reducedMotionOverride === 'system' } }),
        el('option', { text: 'Reduced Motion', attrs: { value: 'reduce', selected: settings.reducedMotionOverride === 'reduce' } }),
      );

      const defaultFmtSel = el(
        'select',
        {
          className: 'bv-input',
          id: 'bv-set-default-fmt',
          on: { change: () => actions.setDefaultExportFormat(defaultFmtSel.value as ExportFormatId) },
        },
        ...EXPORT_FORMAT_OPTIONS.map((opt) =>
          el('option', { text: opt.label, attrs: { value: opt.id, selected: state.defaultExportFormat === opt.id } }),
        ),
      );

      const fontSizeLabel = el('label', {
        className: 'bv-label',
        attrs: { for: 'bv-set-fontsize' },
        text: `Editor Font Size (${settings.editorFontSizePx} px)`,
      });
      const syncFontSize = () => {
        const val = Number(fontSizeSlider.value);
        fontSizeLabel.textContent = `Editor Font Size (${val} px)`;
        actions.updateSettings({ editorFontSizePx: val });
      };
      const fontSizeSlider = el('input', {
        id: 'bv-set-fontsize',
        attrs: { type: 'range', min: 13, max: 28, step: 1, value: settings.editorFontSizePx },
        on: { input: syncFontSize, change: syncFontSize },
      });

      const lhLabel = el('label', {
        className: 'bv-label',
        attrs: { for: 'bv-set-lineheight' },
        text: `Line Height (${settings.editorLineHeight})`,
      });
      const syncLineHeight = () => {
        const val = Number(lhSlider.value);
        lhLabel.textContent = `Line Height (${val})`;
        actions.updateSettings({ editorLineHeight: val });
      };
      const lhSlider = el('input', {
        id: 'bv-set-lineheight',
        attrs: { type: 'range', min: 1.3, max: 2.2, step: 0.05, value: settings.editorLineHeight },
        on: { input: syncLineHeight, change: syncLineHeight },
      });

      const widthLabel = el('label', {
        className: 'bv-label',
        attrs: { for: 'bv-set-sheetwidth' },
        text: `Paper Sheet Width (${settings.editorSheetMaxWidthPx} px)`,
      });
      const syncSheetWidth = () => {
        const val = Number(widthSlider.value);
        widthLabel.textContent = `Paper Sheet Width (${val} px)`;
        actions.updateSettings({ editorSheetMaxWidthPx: val });
      };
      const widthSlider = el('input', {
        id: 'bv-set-sheetwidth',
        attrs: { type: 'range', min: 540, max: 1080, step: 20, value: settings.editorSheetMaxWidthPx },
        on: { input: syncSheetWidth, change: syncSheetWidth },
      });

      const saveDelayLabel = el('label', {
        className: 'bv-label',
        attrs: { for: 'bv-set-savedelay' },
        text: `Auto-Save Interval (${settings.autoSaveDelayMs} ms)`,
      });
      const syncSaveDelay = () => {
        const val = Number(saveDelaySlider.value);
        saveDelayLabel.textContent = `Auto-Save Interval (${val} ms)`;
        actions.updateSettings({ autoSaveDelayMs: val });
      };
      const saveDelaySlider = el('input', {
        id: 'bv-set-savedelay',
        attrs: { type: 'range', min: 150, max: 2000, step: 50, value: settings.autoSaveDelayMs },
        on: { input: syncSaveDelay, change: syncSaveDelay },
      });

      const spellcheckChk = el('input', {
        className: 'bv-lever',
        id: 'bv-set-spellcheck',
        attrs: { type: 'checkbox', role: 'switch', checked: settings.enableSpellcheck },
        on: {
          change: () => {
            actions.updateSettings({ enableSpellcheck: spellcheckChk.checked });
            actions.setState({}, true);
          },
        },
      });

      const richFormattingChk = el('input', {
        className: 'bv-lever',
        id: 'qv-set-rich-formatting',
        attrs: { type: 'checkbox', role: 'switch', checked: settings.enableRichFormatting },
        on: {
          change: () => {
            actions.updateSettings({ enableRichFormatting: richFormattingChk.checked });
            actions.setState({}, true);
          },
        },
      });

      const confirmUnlockChk = el('input', {
        className: 'bv-lever',
        id: 'qv-set-confirm-unlock',
        attrs: { type: 'checkbox', role: 'switch', checked: settings.confirmBeforeUnlock },
        on: {
          change: () => {
            actions.updateSettings({ confirmBeforeUnlock: confirmUnlockChk.checked });
          },
        },
      });

      const blockBrowserExtChk = el('input', {
        className: 'bv-lever',
        id: 'qv-set-block-browser-ext',
        attrs: { type: 'checkbox', role: 'switch', checked: settings.disableBrowserWritingExtensions },
        on: {
          change: () => {
            actions.updateSettings({ disableBrowserWritingExtensions: blockBrowserExtChk.checked });
            actions.setState({}, true);
          },
        },
      });

      const tourChk = el('input', {
        className: 'bv-lever',
        id: 'bv-set-tours',
        attrs: { type: 'checkbox', role: 'switch', checked: settings.showOnboardingHints },
        on: { change: () => actions.updateSettings({ showOnboardingHints: tourChk.checked }) },
      });

      const linkThemeChk = el('input', {
        className: 'bv-lever',
        id: 'qv-set-link-theme',
        attrs: { type: 'checkbox', role: 'switch', checked: settings.linkPaperThemeToAppTheme },
        on: {
          change: () => {
            const linked = linkThemeChk.checked;
            actions.updateSettings({ linkPaperThemeToAppTheme: linked });
            if (linked) {
              const targetPaper = mapAppThemeToPaperTheme(actions.getState().settings.appTheme);
              actions.mutateProject((p) => ({ ...p, paperTheme: targetPaper }), false);
              actions.notify(`Linked App Theme and Manuscript Paper (${targetPaper})`);
            } else {
              actions.notify('Unlinked App Theme and Manuscript Paper');
            }
          },
        },
      });

      const smoothAnimChk = el('input', {
        className: 'bv-lever',
        id: 'qv-set-smooth-anim',
        attrs: { type: 'checkbox', role: 'switch', checked: settings.enableSmoothAnimations },
        on: {
          change: () => {
            actions.updateSettings({ enableSmoothAnimations: smoothAnimChk.checked });
          },
        },
      });

      const desktopTabsChk = el('input', {
        className: 'bv-lever',
        id: 'qv-set-desktop-tabs',
        attrs: { type: 'checkbox', role: 'switch', checked: settings.enableDesktopBookTabs },
        on: {
          change: () => {
            actions.updateSettings({ enableDesktopBookTabs: desktopTabsChk.checked });
          },
        },
      });

      const titlePreviewEl = el('div', {
        className: 'bv-mono-tag',
        text: `Preview: ${formatAppWindowTitle(settings, project, state.activeView, state.typesetSubTab, isTauriRuntime())}`,
      });

      const titleCustomIn = el('input', {
        className: 'bv-input',
        id: 'qv-set-title-custom',
        attrs: {
          type: 'text',
          value: settings.windowTitleCustom,
          placeholder: 'e.g. Quillvibe — {book} ({section})',
        },
        style: { display: settings.windowTitleMode === 'custom' ? '' : 'none' },
        on: {
          input: () => {
            actions.updateSettings({ windowTitleCustom: titleCustomIn.value });
            titlePreviewEl.textContent = `Preview: ${formatAppWindowTitle(
              actions.getState().settings,
              project,
              actions.getState().activeView,
              actions.getState().typesetSubTab,
              isTauriRuntime(),
            )}`;
          },
        },
      });

      const titleModeSel = el(
        'select',
        {
          className: 'bv-input',
          id: 'qv-set-title-mode',
          on: {
            change: () => {
              const mode = titleModeSel.value as WindowTitleMode;
              titleCustomIn.style.display = mode === 'custom' ? '' : 'none';
              actions.updateSettings({ windowTitleMode: mode });
              titlePreviewEl.textContent = `Preview: ${formatAppWindowTitle(
                actions.getState().settings,
                project,
                actions.getState().activeView,
                actions.getState().typesetSubTab,
                isTauriRuntime(),
              )}`;
            },
          },
        },
        el('option', { text: 'Quillvibe - <Book Name> (Recommended)', attrs: { value: 'book', selected: settings.windowTitleMode === 'book' } }),
        el('option', { text: 'Quillvibe - <Author / Pen Name>', attrs: { value: 'author', selected: settings.windowTitleMode === 'author' } }),
        el('option', { text: 'Quillvibe - <Current Section>', attrs: { value: 'section', selected: settings.windowTitleMode === 'section' } }),
        el('option', { text: 'Quillvibe Only', attrs: { value: 'brand', selected: settings.windowTitleMode === 'brand' } }),
        el('option', { text: 'Custom Title Template…', attrs: { value: 'custom', selected: settings.windowTitleMode === 'custom' } }),
      );

      const immClockChk = el('input', {
        className: 'bv-lever',
        attrs: { type: 'checkbox', role: 'switch', checked: settings.immersiveShowClock },
        on: { change: () => actions.updateSettings({ immersiveShowClock: immClockChk.checked }) },
      });
      const immDateChk = el('input', {
        className: 'bv-lever',
        attrs: { type: 'checkbox', role: 'switch', checked: settings.immersiveShowDate },
        on: { change: () => actions.updateSettings({ immersiveShowDate: immDateChk.checked }) },
      });
      const immTimerChk = el('input', {
        className: 'bv-lever',
        attrs: { type: 'checkbox', role: 'switch', checked: settings.immersiveShowTimer },
        on: { change: () => actions.updateSettings({ immersiveShowTimer: immTimerChk.checked }) },
      });
      const immWordsChk = el('input', {
        className: 'bv-lever',
        attrs: { type: 'checkbox', role: 'switch', checked: settings.immersiveShowWords },
        on: { change: () => actions.updateSettings({ immersiveShowWords: immWordsChk.checked }) },
      });
      const immTargetChk = el('input', {
        className: 'bv-lever',
        attrs: { type: 'checkbox', role: 'switch', checked: settings.immersiveShowTarget },
        on: { change: () => actions.updateSettings({ immersiveShowTarget: immTargetChk.checked }) },
      });
      const immBatteryChk = el('input', {
        className: 'bv-lever',
        attrs: { type: 'checkbox', role: 'switch', checked: settings.immersiveShowBattery },
        on: { change: () => actions.updateSettings({ immersiveShowBattery: immBatteryChk.checked }) },
      });
      const immMediaChk = el('input', {
        className: 'bv-lever',
        attrs: { type: 'checkbox', role: 'switch', checked: settings.immersiveShowMedia },
        on: { change: () => actions.updateSettings({ immersiveShowMedia: immMediaChk.checked }) },
      });
      const immAlarmChk = el('input', {
        className: 'bv-lever',
        attrs: { type: 'checkbox', role: 'switch', checked: settings.immersiveShowAlarm },
        on: { change: () => actions.updateSettings({ immersiveShowAlarm: immAlarmChk.checked }) },
      });
      const detailedTooltipsChk = el('input', {
        className: 'bv-lever',
        id: 'qv-set-detailed-tooltips',
        attrs: { type: 'checkbox', role: 'switch', checked: settings.detailedTooltips },
        on: {
          change: () => {
            actions.updateSettings({ detailedTooltips: detailedTooltipsChk.checked });
          },
        },
      });

      const ringtoneSel = el(
        'select',
        {
          className: 'bv-input',
          id: 'qv-set-ringtone',
          on: {
            change: () => {
              const id = ringtoneSel.value as AlarmRingtoneId;
              actions.updateSettings({ alarmRingtone: id });
              playRingtonePreview(id, actions.getState().settings.alarmVolume);
            },
          },
        },
        ...ALARM_RINGTONES.map((rt) =>
          el('option', {
            text: rt.label,
            attrs: { value: rt.id, selected: settings.alarmRingtone === rt.id },
          }),
        ),
      );

      const volLabel = el('label', {
        className: 'bv-label',
        attrs: { for: 'qv-set-alarm-vol' },
        text: `Alarm Volume (${Math.round(settings.alarmVolume * 100)}%)`,
      });
      const volSlider = el('input', {
        id: 'qv-set-alarm-vol',
        attrs: { type: 'range', min: 10, max: 100, step: 5, value: Math.round(settings.alarmVolume * 100) },
        on: {
          input: () => {
            const pct = Number(volSlider.value) || 65;
            volLabel.textContent = `Alarm Volume (${pct}%)`;
            actions.updateSettings({ alarmVolume: pct / 100 });
          },
        },
      });

      bodyWrap.append(
        el(
          'div',
          { className: 'bv-two-col' },
          el(
            'section',
            { className: 'bv-cork-card' },
            el('span', { className: 'bv-panel-title', text: 'Theme & Workspace Layout' }),
            el('div', { className: 'bv-field' }, el('label', { className: 'bv-label', attrs: { for: 'bv-set-theme' }, text: 'Application Theme' }), themeSel),
            el(
              'label',
              { className: 'bv-check-row', attrs: { for: 'qv-set-link-theme' } },
              linkThemeChk,
              el('span', { text: 'Link Manuscript Paper Theme & Application Theme (changing one updates the other)' }),
            ),
            ...(typeof window === 'undefined' || window.innerWidth > 768
              ? [el('div', { className: 'bv-field' }, el('label', { className: 'bv-label', text: 'Workspace Layout' }), tierCardsGrid)]
              : [el('p', { className: 'bv-label', text: 'Small / mobile screens automatically use Focused layout for distraction-free writing.' })]),
            el('div', { className: 'bv-field' }, el('label', { className: 'bv-label', attrs: { for: 'bv-set-toolbar-mode' }, text: 'Toolbar Detail Mode' }), toolbarModeSel),
            el('div', { className: 'bv-field' }, fontSizeLabel, fontSizeSlider),
            el('div', { className: 'bv-field' }, lhLabel, lhSlider),
            el('div', { className: 'bv-field' }, widthLabel, widthSlider),
          ),
          el(
            'section',
            { className: 'bv-cork-card' },
            el('span', { className: 'bv-panel-title', text: 'Interface, Split Panes & Save' }),
            el('div', { className: 'bv-field' }, el('label', { className: 'bv-label', attrs: { for: 'bv-set-density' }, text: 'Workspace Density' }), densitySel),
            el('div', { className: 'bv-field' }, el('label', { className: 'bv-label', attrs: { for: 'bv-set-motion' }, text: 'Motion' }), motionSel),
            el('div', { className: 'bv-field' }, el('label', { className: 'bv-label', attrs: { for: 'bv-set-default-fmt' }, text: 'Default Save / Export Extension' }), defaultFmtSel),
            el('div', { className: 'bv-field' }, saveDelayLabel, saveDelaySlider),
            el(
              'label',
              { className: 'bv-check-row', attrs: { for: 'qv-set-rich-formatting' } },
              richFormattingChk,
              el('span', { text: 'Show rich formatting (Bold, Italic, Headings) while writing (turn off for raw Markdown)' }),
            ),
            el(
              'label',
              { className: 'bv-check-row', attrs: { for: 'qv-set-confirm-unlock' } },
              confirmUnlockChk,
              el('span', { text: 'Ask for confirmation before unlocking locked chapters or parts' }),
            ),
            el('label', { className: 'bv-check-row', attrs: { for: 'bv-set-spellcheck' } }, spellcheckChk, el('span', { text: 'Enable strict word spellcheck underlines while drafting' })),
            el(
              'label',
              { className: 'bv-check-row', attrs: { for: 'qv-set-block-browser-ext' } },
              blockBrowserExtChk,
              el('span', { text: 'Disable browser writing & grammar extensions (Grammarly, LanguageTool, etc.) while writing' }),
            ),
            el('label', { className: 'bv-check-row', attrs: { for: 'qv-set-smooth-anim' } }, smoothAnimChk, el('span', { text: 'Enable smooth animations & transitions for Binder, Inspector, and menus' })),
            ...(isTauriRuntime()
              ? [
                  el(
                    'label',
                    { className: 'bv-check-row', attrs: { for: 'qv-set-desktop-tabs' } },
                    desktopTabsChk,
                    el('span', { text: 'Stack multiple books in a top desktop tab bar for series reference' }),
                  ),
                ]
              : []),
            el('label', { className: 'bv-check-row', attrs: { for: 'bv-set-tours' } }, tourChk, el('span', { text: 'Show interactive hints & course tips' })),
            el('label', { className: 'bv-check-row', attrs: { for: 'qv-set-detailed-tooltips' } }, detailedTooltipsChk, el('span', { text: 'Show detailed descriptions in hover tooltips' })),
            el(
              'button',
              {
                className: 'bv-mini-btn',
                text: 'Reset Resizable Panel Widths',
                attrs: { type: 'button' },
                on: {
                  click: () => {
                    actions.updateSettings({
                      binderWidthPx: DEFAULT_SETTINGS.binderWidthPx,
                      inspectorWidthPx: DEFAULT_SETTINGS.inspectorWidthPx,
                      studioLeftWidthPx: DEFAULT_SETTINGS.studioLeftWidthPx,
                      studioRightWidthPx: DEFAULT_SETTINGS.studioRightWidthPx,
                    });
                    actions.notify('Panel split widths restored to defaults');
                  },
                },
              },
            ),
          ),
        ),
        el(
          'div',
          { className: 'bv-two-col', style: { marginTop: '12px' } },
          el(
            'section',
            { className: 'bv-cork-card' },
            el('span', { className: 'bv-panel-title', text: 'Window & Taskbar Title' }),
            el('div', { className: 'bv-field' }, el('label', { className: 'bv-label', attrs: { for: 'qv-set-title-mode' }, text: 'Display Format (Website Tab & Desktop Window Hover)' }), titleModeSel),
            titleCustomIn,
            el('p', { className: 'bv-label', text: 'Custom placeholders: {book}, {author}, and {section}.' }),
            titlePreviewEl,
          ),
          el(
            'section',
            { className: 'bv-cork-card' },
            el('span', {
              className: 'bv-panel-title',
              text: isTauriRuntime() ? 'Immersive Fullscreen & Alarm Ringtones' : 'Writing Sprint & Alarm Ringtones',
            }),
            ...(isTauriRuntime()
              ? [
                  el('label', { className: 'bv-check-row' }, immClockChk, el('span', { text: 'Show live wall clock in Immersive Mode' })),
                  el('label', { className: 'bv-check-row' }, immDateChk, el('span', { text: 'Show current date in Immersive Mode' })),
                  el('label', { className: 'bv-check-row' }, immTimerChk, el('span', { text: 'Show writing sprint timer in Immersive Mode' })),
                  el('label', { className: 'bv-check-row' }, immWordsChk, el('span', { text: 'Show word count progress in Immersive Mode' })),
                  el('label', { className: 'bv-check-row' }, immTargetChk, el('span', { text: 'Show word target percentage in Immersive Mode' })),
                  el('label', { className: 'bv-check-row' }, immBatteryChk, el('span', { text: 'Show device battery status in Immersive Mode' })),
                  el('label', { className: 'bv-check-row' }, immMediaChk, el('span', { text: 'Show background media & audio volume in Immersive Mode' })),
                  el('label', { className: 'bv-check-row' }, immAlarmChk, el('span', { text: 'Show alarm clock pill in Immersive Mode' })),
                ]
              : []),
            el(
              'div',
              { className: 'bv-field' },
              el('label', { className: 'bv-label', attrs: { for: 'qv-set-ringtone' }, text: 'Alarm Clock Ringtone' }),
              el(
                'div',
                { style: { display: 'flex', gap: '8px', alignItems: 'center' } },
                ringtoneSel,
                el(
                  'button',
                  {
                    className: 'bv-btn qv-ringtone-preview-btn',
                    attrs: { type: 'button', 'aria-label': 'Preview selected alarm ringtone' },
                    on: {
                      click: () => {
                        const s = actions.getState().settings;
                        playRingtonePreview(s.alarmRingtone, s.alarmVolume);
                      },
                    },
                  },
                  icon('volume', 14),
                  el('span', { text: 'Preview' }),
                ),
              ),
            ),
            el('div', { className: 'bv-field' }, volLabel, volSlider),
          ),
        ),
      );
      return;
    }

    if (activeTab === 'publishing') {
      const pub = project.publishing ?? {
        imprintName: settings.defaultImprint,
        isbn: '',
        editionNumber: '1st Edition',
        editorialStage: 'developmental' as EditorialStage,
      };

      const imprintIn = el('input', {
        className: 'bv-input',
        attrs: { type: 'text', value: pub.imprintName, placeholder: 'Imprint / Publishing House' },
        on: {
          change: () => {
            actions.updateSettings({ defaultImprint: imprintIn.value.trim() || 'Independent Press' });
            actions.mutateProject((p) => ({
              ...p,
              publishing: { ...(p.publishing ?? pub), imprintName: imprintIn.value.trim() },
            }));
          },
        },
      });
      const isbnIn = el('input', {
        className: 'bv-input',
        attrs: { type: 'text', value: pub.isbn, placeholder: '978-0-000-00000-0 (Optional)' },
        on: {
          change: () =>
            actions.mutateProject((p) => ({
              ...p,
              publishing: { ...(p.publishing ?? pub), isbn: isbnIn.value.trim() },
            })),
        },
      });
      const editionIn = el('input', {
        className: 'bv-input',
        attrs: { type: 'text', value: pub.editionNumber, placeholder: '1st Edition' },
        on: {
          change: () =>
            actions.mutateProject((p) => ({
              ...p,
              publishing: { ...(p.publishing ?? pub), editionNumber: editionIn.value.trim() || '1st Edition' },
            })),
        },
      });
      const stageSel = el(
        'select',
        {
          className: 'bv-input',
          on: {
            change: () =>
              actions.mutateProject((p) => ({
                ...p,
                publishing: { ...(p.publishing ?? pub), editorialStage: stageSel.value as EditorialStage },
              })),
          },
        },
        ...EDITORIAL_STAGES.map((st) =>
          el('option', { text: st.label, attrs: { value: st.id, selected: pub.editorialStage === st.id } }),
        ),
      );

      const publisherCompanyIn = el('input', {
        className: 'bv-input',
        attrs: { type: 'text', value: pub.publisherCompany ?? '', placeholder: 'Publishing Company / Studio Legal Name' },
        on: {
          change: () =>
            actions.mutateProject((p) => ({
              ...p,
              publishing: { ...(p.publishing ?? pub), publisherCompany: publisherCompanyIn.value.trim() },
            })),
        },
      });
      const ebookIsbnIn = el('input', {
        className: 'bv-input',
        attrs: { type: 'text', value: pub.ebookIsbn ?? '', placeholder: 'eBook ISBN (978-...)' },
        on: {
          change: () =>
            actions.mutateProject((p) => ({
              ...p,
              publishing: { ...(p.publishing ?? pub), ebookIsbn: ebookIsbnIn.value.trim() },
            })),
        },
      });
      const rightsTerritoryIn = el('input', {
        className: 'bv-input',
        attrs: { type: 'text', value: pub.rightsTerritory ?? '', placeholder: 'e.g. World All Languages' },
        on: {
          change: () =>
            actions.mutateProject((p) => ({
              ...p,
              publishing: { ...(p.publishing ?? pub), rightsTerritory: rightsTerritoryIn.value.trim() },
            })),
        },
      });
      const commercialLicenseSel = el(
        'select',
        {
          className: 'bv-input',
          on: {
            change: () =>
              actions.mutateProject((p) => ({
                ...p,
                publishing: { ...(p.publishing ?? pub), commercialLicense: commercialLicenseSel.value },
              })),
          },
        },
        ...[
          'All Rights Reserved',
          'Commercial Print & Digital License',
          'Publishing House Exclusive',
          'Creative Commons BY-NC-ND',
        ].map((lic) =>
          el('option', {
            text: lic,
            attrs: { value: lic, selected: (pub.commercialLicense || 'All Rights Reserved') === lic },
          }),
        ),
      );
      const bisacIn = el('input', {
        className: 'bv-input',
        attrs: { type: 'text', value: pub.bisacCategory ?? '', placeholder: 'BISAC Code / Category (e.g. FIC009000)' },
        on: {
          change: () =>
            actions.mutateProject((p) => ({
              ...p,
              publishing: { ...(p.publishing ?? pub), bisacCategory: bisacIn.value.trim() },
            })),
        },
      });
      const embargoIn = el('input', {
        className: 'bv-input',
        attrs: { type: 'date', value: pub.embargoDate ?? '' },
        on: {
          change: () =>
            actions.mutateProject((p) => ({
              ...p,
              publishing: { ...(p.publishing ?? pub), embargoDate: embargoIn.value },
            })),
        },
      });
      const arcWatermarkIn = el('input', {
        className: 'bv-input',
        attrs: { type: 'text', value: pub.arcWatermarkText ?? '', placeholder: 'Advance Review Copy / Reviewer Watermark' },
        on: {
          change: () =>
            actions.mutateProject((p) => ({
              ...p,
              publishing: { ...(p.publishing ?? pub), arcWatermarkText: arcWatermarkIn.value.trim() },
            })),
        },
      });
      const reqSignedSyncChk = el('input', {
        className: 'bv-lever',
        attrs: { type: 'checkbox', role: 'switch', checked: Boolean(pub.enterpriseRequireSignedSync) },
        on: {
          change: () =>
            actions.mutateProject((p) => ({
              ...p,
              publishing: { ...(p.publishing ?? pub), enterpriseRequireSignedSync: reqSignedSyncChk.checked },
            })),
        },
      });
      const reqPasswordExportChk = el('input', {
        className: 'bv-lever',
        attrs: { type: 'checkbox', role: 'switch', checked: Boolean(pub.enterpriseRequirePasswordExport) },
        on: {
          change: () =>
            actions.mutateProject((p) => ({
              ...p,
              publishing: { ...(p.publishing ?? pub), enterpriseRequirePasswordExport: reqPasswordExportChk.checked },
            })),
        },
      });

      const migrateInput = el('input', {
        attrs: { type: 'file', accept: '.docx,.html,.htm,.rtf,.md,.markdown,.txt' },
        style: { display: 'none' },
        on: {
          change: async () => {
            const file = migrateInput.files?.[0];
            migrateInput.value = '';
            if (!file) return;
            try {
              const imported = await importAnyExternalDocumentFile(file);
              const nextLib = {
                activeBookId: imported.id,
                books: [...actions.getState().library.books, imported],
              };
              actions.replaceLibrary(nextLib);
              actions.notify(`Imported “${imported.title}” (${imported.parts[0]?.chapters.length ?? 0} chapter(s))`);
              closeModal();
            } catch (err) {
              actions.notify(err instanceof Error ? err.message : 'Unable to import external manuscript.');
            }
          },
        },
      });

      bodyWrap.append(
        el(
          'div',
          { className: 'bv-two-col' },
          el(
            'section',
            { className: 'bv-cork-card' },
            el('span', { className: 'bv-panel-title', text: 'Imprint, ISBN & Editorial Stage' }),
            el('div', { className: 'bv-field' }, el('label', { className: 'bv-label', text: 'Imprint / Press Name' }), imprintIn),
            el('div', { className: 'bv-field' }, el('label', { className: 'bv-label', text: 'Print ISBN or Catalog ID' }), isbnIn),
            el('div', { className: 'bv-field' }, el('label', { className: 'bv-label', text: 'eBook ISBN' }), ebookIsbnIn),
            el('div', { className: 'bv-field' }, el('label', { className: 'bv-label', text: 'Edition Label' }), editionIn),
            el('div', { className: 'bv-field' }, el('label', { className: 'bv-label', text: 'Editorial Pipeline Stage' }), stageSel),
            el(
              'button',
              {
                className: 'bv-btn',
                attrs: { type: 'button' },
                style: { marginTop: '6px' },
                on: {
                  click: () => {
                    const report = buildEditorialHandoffReport(actions.getState().project);
                    const blob = new Blob([report], { type: 'text/markdown' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `${project.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-handoff.md`;
                    a.click();
                    setTimeout(() => URL.revokeObjectURL(url), 2500);
                    actions.notify('Exported Editorial Handoff Sheet (.md)');
                  },
                },
              },
              icon('download', 14),
              'Export Editorial Handoff Sheet',
            ),
          ),
          el(
            'section',
            { className: 'bv-cork-card' },
            el('span', { className: 'bv-panel-title', text: 'Commercial & Enterprise Publishing Options' }),
            el('div', { className: 'bv-field' }, el('label', { className: 'bv-label', text: 'Publisher / Company Legal Entity' }), publisherCompanyIn),
            el('div', { className: 'bv-field' }, el('label', { className: 'bv-label', text: 'Rights & Distribution Territory' }), rightsTerritoryIn),
            el('div', { className: 'bv-field' }, el('label', { className: 'bv-label', text: 'Commercial Rights License' }), commercialLicenseSel),
            el('div', { className: 'bv-field' }, el('label', { className: 'bv-label', text: 'BISAC Category Code' }), bisacIn),
            el('div', { className: 'bv-field' }, el('label', { className: 'bv-label', text: 'Press Embargo / Street Date' }), embargoIn),
            el('div', { className: 'bv-field' }, el('label', { className: 'bv-label', text: 'Printable ARC / Proof Watermark' }), arcWatermarkIn),
            el('label', { className: 'bv-check-row' }, reqSignedSyncChk, el('span', { text: 'Require valid Author Key signature on team sync' })),
            el('label', { className: 'bv-check-row' }, reqPasswordExportChk, el('span', { text: 'Require password on every QVBX file export' })),
          ),
        ),
        el(
          'section',
          { className: 'bv-cork-card', style: { marginTop: '12px' } },
          el('span', { className: 'bv-panel-title', text: 'Import Manuscripts & Legacy Archives' }),
          el('p', {
            className: 'bv-label',
            text: 'Import manuscripts from .docx word-processor files, Web HTML (.html), Rich Text (.rtf), Markdown (.md), Plain Text (.txt), or upgrade legacy .quillvibe / .qvibe / .qvbook / .bookvibe files into .qv.',
          }),
          el(
            'div',
            { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '6px' } },
            el(
              'button',
              {
                className: 'bv-btn bv-btn-primary',
                attrs: { type: 'button' },
                on: { click: () => migrateInput.click() },
              },
              icon('folder', 14),
              'Import .docx / .html / .rtf / .md / .txt…',
            ),
            el(
              'button',
              {
                className: 'bv-btn',
                attrs: { type: 'button' },
                on: {
                  click: () => {
                    closeModal();
                    void actions.importLegacyBookFile();
                  },
                },
              },
              icon('folder', 14),
              'Import Legacy Archive (.quillvibe / .bookvibe)…',
            ),
            migrateInput,
          ),
        ),
        el(
          'section',
          { className: 'bv-cork-card', style: { marginTop: '12px' } },
          el('span', { className: 'bv-panel-title', text: 'Migrate to Another Writing Tool (Portable Export)' }),
          el('p', {
            className: 'bv-label',
            text: 'Moving your book to another writing program? Export an open, unlocked copy of your entire manuscript and Story Bible in standard formats that any editor can open.',
          }),
          el(
            'div',
            { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '6px' } },
            el(
              'button',
              {
                className: 'bv-btn bv-btn-primary',
                attrs: { type: 'button' },
                on: {
                  click: async () => {
                    await actions.exportDocx();
                  },
                },
              },
              icon('download', 14),
              'Export Word-Compatible (.docx)',
            ),
            el(
              'button',
              {
                className: 'bv-btn',
                attrs: { type: 'button' },
                on: {
                  click: async () => {
                    const md = buildPortableMigrationMarkdown(actions.getState().project);
                    const saved = await exportGenericFile({
                      suggestedName: `${project.title || 'book'}-portable-migration`,
                      extension: 'md',
                      description: 'Portable Manuscript + Story Bible Markdown',
                      mimeType: 'text/markdown;charset=utf-8',
                      textContent: md,
                    });
                    if (saved) actions.notify('Exported Portable Markdown + Story Bible (.md)');
                  },
                },
              },
              icon('download', 14),
              'Export Manuscript + Notes (.md)',
            ),
            el(
              'button',
              {
                className: 'bv-btn',
                attrs: { type: 'button' },
                on: {
                  click: async () => {
                    const rtf = buildRtfExport(actions.getState().project);
                    const saved = await exportGenericFile({
                      suggestedName: `${project.title || 'book'}-manuscript`,
                      extension: 'rtf',
                      description: 'Rich Text Document',
                      mimeType: 'application/rtf',
                      textContent: rtf,
                    });
                    if (saved) actions.notify('Exported Rich Text Document (.rtf)');
                  },
                },
              },
              icon('download', 14),
              'Export Rich Text (.rtf)',
            ),
            el(
              'button',
              {
                className: 'bv-btn',
                attrs: { type: 'button' },
                on: {
                  click: async () => {
                    const json = buildPortableMigrationJson(actions.getState().project);
                    const saved = await exportGenericFile({
                      suggestedName: `${project.title || 'book'}-open-archive`,
                      extension: 'json',
                      description: 'Open Portable Book JSON',
                      mimeType: 'application/json;charset=utf-8',
                      textContent: json,
                    });
                    if (saved) actions.notify('Exported Open Portable Archive (.json)');
                  },
                },
              },
              icon('download', 14),
              'Export Open JSON (.json)',
            ),
          ),
        ),
      );
      return;
    }

    // Developer Tab
    const devChk = el('input', {
      className: 'bv-lever',
      attrs: { type: 'checkbox', role: 'switch', checked: settings.developerMode },
      on: {
        change: () => {
          actions.updateSettings({ developerMode: devChk.checked });
          renderBody();
        },
      },
    });
    const prov = getPublisherProvenance(project.id);
    const verified = verifyPublisherProvenance(prov.publisher, prov.mark, project.id);
    const scenesCount = getAllScenes(project).length;
    const auditEntries = loadExtensionAuditLog().length;
    const fontsCount = loadCustomFonts().length;

    bodyWrap.append(
      el(
        'section',
        { className: 'bv-cork-card' },
        el('span', { className: 'bv-panel-title', text: 'Developer Mode & Build Provenance' }),
        el('label', { className: 'bv-check-row' }, devChk, el('span', { text: 'Enable developer diagnostics and extension tools' })),
        el('div', {
          className: 'bv-list-card',
          style: { marginTop: '8px' },
        },
          el('div', {},
            el('div', { text: `Publisher Origin: ${prov.publisher}`, style: { fontWeight: '600', fontSize: '12.5px' } }),
            el('div', { className: 'bv-mono-tag', text: `Build Mark: ${prov.mark} | Verified: ${verified ? 'Valid' : 'Mismatch'}` }),
          ),
          el('span', { className: 'bv-mono-tag', text: `v${CURRENT_QUILLVIBE_VERSION} (${APP_COMMIT})`, style: { color: 'var(--accent-emerald)' } }),
        ),
        el(
          'div',
          { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '10px' } },
          el(
            'button',
            {
              className: 'bv-btn bv-btn-primary',
              attrs: { type: 'button' },
              on: { click: () => showUpdateCheckDialog(actions) },
            },
            icon('download', 14),
            'Check for Quillvibe Updates',
          ),
        ),
      ),
      el(
        'section',
        { className: 'bv-cork-card' },
        el('span', { className: 'bv-panel-title', text: 'Workspace Telemetry Summary (Local Only)' }),
        el('div', { className: 'bv-mono-tag', text: `Book ID: ${project.id} | Scenes: ${scenesCount} | Custom Fonts: ${fontsCount} | Audit Events: ${auditEntries}` }),
        el(
          'div',
          { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '8px' } },
          el(
            'button',
            {
              className: 'bv-btn',
              attrs: { type: 'button' },
              on: {
                click: () => {
                  const snapshot = {
                    version: CURRENT_QUILLVIBE_VERSION,
                    commit: APP_COMMIT,
                    publisher: prov.publisher,
                    mark: prov.mark,
                    bookId: project.id,
                    scenes: scenesCount,
                    customFonts: fontsCount,
                    auditLogCount: auditEntries,
                    viewport: `${window.innerWidth}x${window.innerHeight}`,
                  };
                  void exportGenericFile({
                    suggestedName: 'quillvibe-diagnostics',
                    extension: 'json',
                    description: 'Quillvibe Diagnostics JSON',
                    mimeType: 'application/json;charset=utf-8',
                    textContent: JSON.stringify(snapshot, null, 2),
                  }).then((saved) => {
                    if (saved) actions.notify('Exported local diagnostics JSON');
                  });
                },
              },
            },
            icon('download', 14),
            'Export Local Diagnostics JSON',
          ),
          el(
            'button',
            {
              className: 'bv-btn',
              attrs: { type: 'button' },
              on: {
                click: () => {
                  actions.openExtensionsModal('external');
                },
              },
            },
            icon('shield', 14),
            'Open Extension Audit & Sandbox',
          ),
        ),
      ),
    );
  };

  const header = el(
    'header',
    { className: 'qv-standalone-header' },
    el(
      'div',
      { style: { display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' } },
      el(
        'button',
        {
          className: 'bv-btn',
          attrs: { type: 'button' },
          on: { click: closeModal },
        },
        icon('draft-sheet', 14),
        'Back to Writing',
      ),
      el('h1', { text: 'Settings', style: { margin: '0', fontSize: '20px', fontWeight: '600' } }),
    ),
    el(
      'div',
      { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' } },
      ...(isTauriRuntime()
        ? [
            el(
              'button',
              {
                className: 'bv-mini-btn',
                attrs: { type: 'button' },
                on: { click: () => showUpdateCheckDialog(actions) },
              },
              `Check Updates (v${CURRENT_QUILLVIBE_VERSION})`,
            ),
          ]
        : []),
      el(
        'button',
        {
          className: 'bv-btn bv-btn-icon',
          tooltip: { title: 'Help & Manual', short: 'Open the Quillvibe manual, shortcuts, and reference.' },
          attrs: { type: 'button', 'aria-label': 'Help & Manual' },
          on: { click: () => actions.openHelpModal('course') },
        },
        icon('help', 15),
      ),
      createAppThemeButton(actions),
    ),
  );

  const pageShell = el(
    'div',
    { className: 'qv-settings-page' },
    header,
    el('div', { className: 'qv-settings-page-grid' }, el('aside', { className: 'qv-settings-sidebar' }, tabBar), bodyWrap),
  );

  container.appendChild(pageShell);
  renderTabs();
  renderBody();
  restoreScroll();
}
