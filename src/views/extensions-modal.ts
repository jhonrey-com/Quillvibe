import type { AppActions, ExtensionsModalTab } from '../core/app-context';
import { getOsExtensionStatus, isTauriRuntime, registerOsExtensions } from '../core/bridge';
import { QUILLVIBE_EXTENSIONS } from '../core/extensions';
import { installFontPackFromExtension } from '../core/fonts';
import {
  EXTENSION_PERMISSION_INFO,
  SANDBOX_BLOCKED_CAPABILITIES,
  SAMPLE_EXTERNAL_EXTENSION_JSON,
  applyExtensionPreset,
  clearExtensionAuditLog,
  computeManifestSha256,
  loadExtensionAuditLog,
  loadInstalledExtensions,
  runExtensionReadabilityReport,
  runExtensionRulesOnScene,
  runExtensionTransformOnScene,
  saveInstalledExtensions,
  validateExternalExtensionManifest,
} from '../core/plugins';
import type {
  AssociationReport,
  ExtensionPermission,
  InstalledExtension,
  QuillvibePluginManifest,
} from '../core/types';
import { clearNode, el, icon, type IconName } from '../ui/dom';
import { createAppThemeButton } from '../ui/theme-button';
import { LiquidGlassControl } from '../ui/liquid-glass';
import { TOOLTIP_CATALOG } from '../ui/tooltips-catalog';

export interface ShowExtensionsOptions {
  initialTab?: ExtensionsModalTab;
  pendingExternalRawJson?: string;
}

interface MountExtensionsNavBridge {
  onRender?: (activeTab: ExtensionsModalTab, setTab: (tab: ExtensionsModalTab) => void) => void;
}

const EXTENSIONS_PAGE_TABS: ReadonlyArray<{ id: ExtensionsModalTab; label: string; iconName: IconName }> = [
  { id: 'integrated', label: 'Integrated', iconName: 'extensions' },
  { id: 'external', label: 'Sandbox', iconName: 'sandbox' },
  { id: 'formats', label: 'Formats', iconName: 'archive-format' },
];

let activeExtensionsPageGlass: LiquidGlassControl<ExtensionsModalTab> | null = null;
let pendingExtensionsPageOptions: ShowExtensionsOptions = {};

export function setExtensionsPageOptions(options: ShowExtensionsOptions): void {
  pendingExtensionsPageOptions = { ...options };
}

async function mountExtensionsWorkspace(
  hostBody: HTMLElement,
  actions: AppActions,
  options: ShowExtensionsOptions,
  closeModal: () => void,
  registerGlass: (glass: LiquidGlassControl<ExtensionsModalTab>) => void,
  navBridge?: MountExtensionsNavBridge,
): Promise<void> {

  let activeTab: ExtensionsModalTab = options.pendingExternalRawJson
    ? 'external'
    : (options.initialTab ?? 'integrated');
  let osReport: AssociationReport = await getOsExtensionStatus();
  let lastReadabilitySummary = '';
  let pendingConsent: {
    manifest: QuillvibePluginManifest;
    sha256: string;
    selectedPerms: Set<ExtensionPermission>;
  } | null = null;

  if (options.pendingExternalRawJson) {
    try {
      const manifest = validateExternalExtensionManifest(options.pendingExternalRawJson);
      const sha256 = await computeManifestSha256(options.pendingExternalRawJson);
      pendingConsent = {
        manifest,
        sha256,
        selectedPerms: new Set(manifest.permissions),
      };
    } catch (err) {
      actions.notify(err instanceof Error ? err.message : 'Invalid external extension package.');
    }
  }

  const contentArea = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '14px' } });

  const renderPermissionBadges = (ext: InstalledExtension, onTogglePerm?: (p: ExtensionPermission, granted: boolean) => void) => {
    const wrap = el('div', { className: 'bv-perm-grid' });
    for (const perm of ext.manifest.permissions) {
      const info = EXTENSION_PERMISSION_INFO[perm];
      const isGranted = ext.grantedPermissions.includes(perm);
      if (onTogglePerm) {
        const chk = el('input', {
          attrs: { type: 'checkbox', checked: isGranted },
          on: { change: () => onTogglePerm(perm, chk.checked) },
        });
        wrap.appendChild(
          el(
            'label',
            {
              className: `bv-perm-pill${isGranted ? ' is-granted' : ''}`,
              tooltip: { title: info.title, short: info.dataAccessed, details: info.riskLabel },
            },
            chk,
            el('span', { text: info.title }),
          ),
        );
      } else {
        wrap.appendChild(
          el('span', {
            className: `bv-perm-pill${isGranted ? ' is-granted' : ''}`,
            text: `${isGranted ? '✓' : '○'} ${info.title}`,
            tooltip: { title: info.title, short: info.dataAccessed, details: info.riskLabel },
          }),
        );
      }
    }
    return wrap;
  };

  const renderExtensionActions = (ext: InstalledExtension): HTMLElement => {
    const row = el('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' } });
    const sceneId = actions.getState().activeSceneId;

    if (ext.manifest.rules && ext.manifest.rules.length > 0) {
      row.appendChild(
        el(
          'button',
          {
            className: 'bv-btn bv-btn-primary',
            attrs: { type: 'button', disabled: !ext.enabled },
            on: {
              click: () => {
                try {
                  const res = runExtensionRulesOnScene(ext, actions.getState().project, sceneId);
                  actions.mutateProject(() => res.project, false);
                  actions.setState({ activeView: 'editor', editorSubMode: 'proofread' }, true);
                  actions.notify(
                    res.addedMarks > 0
                      ? `${ext.manifest.name}: added ${res.addedMarks} proofreading mark(s)`
                      : `${ext.manifest.name}: no issues found in active scene`,
                  );
                  closeModal();
                } catch (err) {
                  actions.notify(err instanceof Error ? err.message : 'Run failed.');
                }
              },
            },
          },
          icon('proofread', 14),
          'Scan Active Scene',
        ),
      );
    }

    for (const tr of ext.manifest.transforms ?? []) {
      row.appendChild(
        el('button', {
          className: 'bv-btn',
          text: tr.label,
          tooltip: { title: tr.label, short: tr.description },
          attrs: { type: 'button', disabled: !ext.enabled },
          on: {
            click: () => {
              try {
                const res = runExtensionTransformOnScene(
                  ext,
                  tr.id,
                  actions.getState().project,
                  sceneId,
                );
                actions.mutateProject(() => res.project);
                actions.notify(
                  res.changed
                    ? `${tr.label}: applied cleanly (snapshot saved)`
                    : `${tr.label}: prose already normalized`,
                );
                renderContent();
              } catch (err) {
                actions.notify(err instanceof Error ? err.message : 'Transform failed.');
              }
            },
          },
        }),
      );
    }

    if (ext.manifest.metricsReport === 'readability') {
      row.appendChild(
        el('button', {
          className: 'bv-btn bv-btn-primary',
          text: 'Analyze Active Scene',
          attrs: { type: 'button', disabled: !ext.enabled },
          on: {
            click: () => {
              try {
                const r = runExtensionReadabilityReport(ext, actions.getState().project, sceneId);
                lastReadabilitySummary = `${r.words} words | ${r.sentences} sentences | Avg ${r.avgWordsPerSentence} w/sent | ${r.dialogueRatioPct}% dialogue | Flesch-Kincaid Grade ${r.fleschKincaidGrade}`;
                actions.notify('Readability metrics updated');
                renderContent();
              } catch (err) {
                actions.notify(err instanceof Error ? err.message : 'Analysis failed.');
              }
            },
          },
        }),
      );
    }

    for (const preset of ext.manifest.presets ?? []) {
      row.appendChild(
        el('button', {
          className: 'bv-btn',
          text: preset.label,
          attrs: { type: 'button', disabled: !ext.enabled },
          on: {
            click: () => {
              try {
                const nextProj = applyExtensionPreset(ext, preset.id, actions.getState().project);
                actions.mutateProject(() => nextProj);
                actions.notify(`Applied ${preset.label}`);
                renderContent();
              } catch (err) {
                actions.notify(err instanceof Error ? err.message : 'Preset failed.');
              }
            },
          },
        }),
      );
    }

    if (ext.manifest.fonts && ext.manifest.fonts.length > 0) {
      row.appendChild(
        el(
          'button',
          {
            className: 'bv-btn bv-btn-primary',
            attrs: { type: 'button', disabled: !ext.enabled },
            on: {
              click: async () => {
                try {
                  const installed = await installFontPackFromExtension(ext);
                  actions.notify(`Installed ${installed.length} font(s) from ${ext.manifest.name}`);
                  renderContent();
                } catch (err) {
                  actions.notify(err instanceof Error ? err.message : 'Font pack install failed.');
                }
              },
            },
          },
          icon('plus', 13),
          `Install Font Pack (${ext.manifest.fonts.length})`,
        ),
      );
    }

    return row;
  };

  const renderConsentDialog = (): HTMLElement | null => {
    if (!pendingConsent) return null;
    const c = pendingConsent;
    const permCheckboxes = el('div', { className: 'bv-snap-list' });
    for (const perm of c.manifest.permissions) {
      const info = EXTENSION_PERMISSION_INFO[perm];
      const chk = el('input', {
        attrs: { type: 'checkbox', checked: c.selectedPerms.has(perm) },
        on: {
          change: () => {
            if (chk.checked) c.selectedPerms.add(perm);
            else c.selectedPerms.delete(perm);
          },
        },
      });
      permCheckboxes.appendChild(
        el(
          'label',
          { className: 'bv-list-card', style: { cursor: 'pointer', alignItems: 'flex-start' } },
          el(
            'div',
            { style: { display: 'flex', gap: '10px', alignItems: 'flex-start' } },
            chk,
            el(
              'div',
              {},
              el('div', { text: info.title, style: { fontWeight: '600', fontSize: '12.5px' } }),
              el('div', { className: 'bv-label', text: info.dataAccessed }),
            ),
          ),
          el('span', { className: 'bv-mono-tag', text: info.riskLabel }),
        ),
      );
    }

    return el(
      'section',
      { className: 'bv-consent-box' },
      el(
        'div',
        { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
        el('span', {
          className: 'bv-panel-title',
          text: 'Permission Consent Required Before Installation',
          style: { color: 'var(--accent-amber)' },
        }),
        el('span', { className: 'bv-mono-tag', text: `SHA-256: ${c.sha256}` }),
      ),
      el('div', {
        text: `${c.manifest.name} v${c.manifest.version} — Author: ${c.manifest.author}`,
        style: { fontWeight: '600', fontSize: '14px' },
      }),
      el('p', { className: 'bv-label', text: c.manifest.description, style: { margin: '0' } }),
      el('div', {
        className: 'bv-list-card',
        style: { background: 'var(--bg-canvas)' },
        text: `Data Usage Statement: ${c.manifest.dataUsageSummary}`,
      }),
      el('span', { className: 'bv-panel-title', text: 'Requested Access Scopes (Uncheck to Deny)' }),
      permCheckboxes,
      el(
        'div',
        { style: { display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '6px' } },
        el('button', {
          className: 'bv-btn',
          text: 'Cancel Install',
          attrs: { type: 'button' },
          on: {
            click: () => {
              pendingConsent = null;
              renderContent();
            },
          },
        }),
        el(
          'button',
          {
            className: 'bv-btn bv-btn-primary',
            attrs: { type: 'button' },
            on: {
              click: () => {
                const list = loadInstalledExtensions().filter(
                  (e) => e.manifest.id !== c.manifest.id,
                );
                list.push({
                  manifest: c.manifest,
                  source: 'external',
                  enabled: true,
                  grantedPermissions: Array.from(c.selectedPerms),
                  installedAt: new Date().toISOString(),
                  sha256: c.sha256,
                });
                saveInstalledExtensions(list);
                const approvedName = c.manifest.name;
                pendingConsent = null;
                actions.notify(`Installed "${approvedName}" with ${list[list.length - 1].grantedPermissions.length} granted scope(s)`);
                renderContent();
              },
            },
          },
          icon('check', 14),
          'Grant Approved Scopes & Install',
        ),
      ),
    );
  };

  const renderContent = () => {
    contentArea.replaceChildren();
    const installed = loadInstalledExtensions();

    if (activeTab === 'integrated') {
      const builtIns = installed.filter((e) => e.source === 'integrated');
      contentArea.appendChild(
        el('p', {
          className: 'bv-label',
          text: 'Integrated extensions ship inside Quillvibe, run 100% locally offline, and declare every data scope they access.',
          style: { margin: '0' },
        }),
      );
      if (lastReadabilitySummary) {
        contentArea.appendChild(
          el('div', {
            className: 'bv-list-card',
            style: { borderColor: 'var(--accent-emerald)', color: 'var(--accent-ivory)' },
            text: `Readability Ledger: ${lastReadabilitySummary}`,
          }),
        );
      }

      for (const ext of builtIns) {
        const enableChk = el('input', {
          attrs: { type: 'checkbox', checked: ext.enabled },
          on: {
            change: () => {
              const all = loadInstalledExtensions().map((item) =>
                item.manifest.id === ext.manifest.id
                  ? { ...item, enabled: enableChk.checked }
                  : item,
              );
              saveInstalledExtensions(all);
              renderContent();
            },
          },
        });

        contentArea.appendChild(
          el(
            'section',
            { className: 'bv-cork-card' },
            el(
              'div',
              { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' } },
              el(
                'div',
                {},
                el('div', {
                  text: `${ext.manifest.name} v${ext.manifest.version}`,
                  style: { fontWeight: '600', fontSize: '13.5px', color: 'var(--text-primary)' },
                }),
                el('div', { className: 'bv-label', text: ext.manifest.description }),
              ),
              el(
                'label',
                { style: { display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '12px' } },
                enableChk,
                ext.enabled ? 'Enabled' : 'Disabled',
              ),
            ),
            el('div', {
              className: 'bv-mono-tag',
              text: `Data Usage: ${ext.manifest.dataUsageSummary}`,
            }),
            renderPermissionBadges(ext),
            renderExtensionActions(ext),
          ),
        );
      }
      return;
    }

    if (activeTab === 'external') {
      const consentEl = renderConsentDialog();
      if (consentEl) contentArea.appendChild(consentEl);

      const extFileInput = el('input', {
        attrs: { type: 'file', accept: '.qvext,.bvext,.json' },
        style: { display: 'none' },
        on: {
          change: async () => {
            const f = extFileInput.files?.[0];
            if (!f) return;
            try {
              const raw = await f.text();
              const manifest = validateExternalExtensionManifest(raw);
              const sha256 = await computeManifestSha256(raw);
              pendingConsent = {
                manifest,
                sha256,
                selectedPerms: new Set(manifest.permissions),
              };
              renderContent();
            } catch (err) {
              actions.notify(err instanceof Error ? err.message : 'Rejected extension file.');
            }
          },
        },
      });

      const sandboxBox = el(
        'section',
        { className: 'bv-cork-card', style: { background: 'var(--bg-bar)' } },
        el(
          'div',
          { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap' } },
          el('span', { className: 'bv-panel-title', text: 'External Extension Sandbox (.qvext)' }),
          el(
            'div',
            { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } },
            el(
              'button',
              {
                className: 'bv-btn bv-btn-primary',
                attrs: { type: 'button' },
                on: { click: () => extFileInput.click() },
              },
              icon('folder', 14),
              'Install .qvext File…',
            ),
            el('button', {
              className: 'bv-btn',
              text: 'Inspect Sample External Extension',
              attrs: { type: 'button' },
              on: {
                click: async () => {
                  const manifest = validateExternalExtensionManifest(SAMPLE_EXTERNAL_EXTENSION_JSON);
                  const sha256 = await computeManifestSha256(SAMPLE_EXTERNAL_EXTENSION_JSON);
                  pendingConsent = {
                    manifest,
                    sha256,
                    selectedPerms: new Set(manifest.permissions),
                  };
                  renderContent();
                },
              },
            }),
            el('button', {
              className: 'bv-btn',
              text: 'Developer Portal (/developer)',
              attrs: { type: 'button' },
              on: {
                click: () => {
                  closeModal();
                  actions.openDeveloperPage();
                },
              },
            }),
            el('button', {
              className: 'bv-mini-btn',
              text: 'Download .qvext Template',
              attrs: { type: 'button' },
              on: {
                click: () => {
                  const blob = new Blob([SAMPLE_EXTERNAL_EXTENSION_JSON], { type: 'application/json' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = 'uk-house-style.qvext';
                  a.click();
                  setTimeout(() => URL.revokeObjectURL(url), 2500);
                },
              },
            }),
            extFileInput,
          ),
        ),
        el('div', {
          className: 'bv-label',
          text: SANDBOX_BLOCKED_CAPABILITIES.join(', '),
        }),
      );
      contentArea.appendChild(sandboxBox);

      const externals = installed.filter((e) => e.source === 'external');
      if (externals.length === 0 && !consentEl) {
        contentArea.appendChild(
          el('p', {
            className: 'bv-label',
            text: 'No external extensions installed. Drop any .qvext file onto Quillvibe or click "Inspect Sample External Extension" above to review permissions before installing.',
          }),
        );
      } else {
        for (const ext of externals) {
          const enableChk = el('input', {
            attrs: { type: 'checkbox', checked: ext.enabled },
            on: {
              change: () => {
                const updated = loadInstalledExtensions().map((item) =>
                  item.manifest.id === ext.manifest.id
                    ? { ...item, enabled: enableChk.checked }
                    : item,
                );
                saveInstalledExtensions(updated);
                renderContent();
              },
            },
          });

          contentArea.appendChild(
            el(
              'section',
              { className: 'bv-cork-card' },
              el(
                'div',
                { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' } },
                el(
                  'div',
                  {},
                  el('div', {
                    text: `${ext.manifest.name} v${ext.manifest.version} by ${ext.manifest.author}`,
                    style: { fontWeight: '600', fontSize: '13.5px' },
                  }),
                  el('div', { className: 'bv-label', text: ext.manifest.dataUsageSummary }),
                ),
                el(
                  'div',
                  { style: { display: 'flex', gap: '8px', alignItems: 'center' } },
                  el(
                    'label',
                    { style: { display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer', fontSize: '12px' } },
                    enableChk,
                    ext.enabled ? 'Enabled' : 'Paused',
                  ),
                  el(
                    'button',
                    {
                      className: 'bv-mini-btn',
                      attrs: { type: 'button' },
                      tooltip: { title: 'Remove Extension', short: 'Uninstall external extension.' },
                      on: {
                        click: () => {
                          const next = loadInstalledExtensions().filter(
                            (i) => i.manifest.id !== ext.manifest.id,
                          );
                          saveInstalledExtensions(next);
                          renderContent();
                        },
                      },
                    },
                    icon('trash', 12),
                  ),
                ),
              ),
              renderPermissionBadges(ext, (perm, granted) => {
                const updated = loadInstalledExtensions().map((item) => {
                  if (item.manifest.id !== ext.manifest.id) return item;
                  const nextPerms = new Set(item.grantedPermissions);
                  if (granted) nextPerms.add(perm);
                  else nextPerms.delete(perm);
                  return { ...item, grantedPermissions: Array.from(nextPerms) };
                });
                saveInstalledExtensions(updated);
                renderContent();
              }),
              renderExtensionActions(ext),
            ),
          );
        }
      }

      // Data Access Audit Log
      const auditEntries = loadExtensionAuditLog();
      const auditList = el('div', { className: 'bv-snap-list' });
      if (auditEntries.length === 0) {
        auditList.appendChild(
          el('span', { className: 'bv-label', text: 'No extension runs recorded yet.' }),
        );
      } else {
        for (const a of auditEntries.slice(0, 12)) {
          auditList.appendChild(
            el(
              'div',
              { className: 'bv-list-card' },
              el(
                'div',
                {},
                el('div', { text: `${a.extensionName}: ${a.action}`, style: { fontWeight: '600', fontSize: '12px' } }),
                el('div', { className: 'bv-label', text: `Data read: ${a.dataAccessed}` }),
              ),
              el('span', { className: 'bv-mono-tag', text: new Date(a.timestamp).toLocaleTimeString() }),
            ),
          );
        }
      }

      contentArea.appendChild(
        el(
          'section',
          { className: 'bv-cork-card' },
          el(
            'div',
            { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
            el('span', { className: 'bv-panel-title', text: 'Extension Data Access Audit Log' }),
            auditEntries.length > 0
              ? el('button', {
                  className: 'bv-mini-btn',
                  text: 'Clear Log',
                  attrs: { type: 'button' },
                  on: {
                    click: () => {
                      clearExtensionAuditLog();
                      renderContent();
                    },
                  },
                })
              : null,
          ),
          auditList,
        ),
      );
      return;
    }

    // Tab 3: Official File Extensions (& OS Registration on Desktop)
    const desktopMode = isTauriRuntime();
    const statusBanner = desktopMode
      ? el(
          'div',
          {
            className: 'bv-list-card',
            style: { background: 'var(--bg-bar)' },
          },
          el(
            'div',
            {},
            el('div', {
              text: osReport.allRegistered
                ? 'All 4 Quillvibe extensions are active in your OS file shell'
                : `Platform: ${osReport.platform} | Scope: ${osReport.scope}`,
              style: { fontWeight: '600' },
            }),
            el('div', { className: 'bv-label', text: osReport.executablePath }),
          ),
          el(
            'button',
            {
              className: 'bv-btn bv-btn-primary',
              attrs: { type: 'button' },
              on: {
                click: async () => {
                  osReport = await registerOsExtensions();
                  actions.notify(
                    osReport.allRegistered
                      ? 'Registered all 4 Quillvibe extensions in OS shell.'
                      : 'OS registration requires launching the compiled desktop binary.',
                  );
                  renderContent();
                },
              },
            },
            icon('check', 14),
            'Register in OS Shell',
          ),
        )
      : el('p', {
          className: 'bv-label',
          style: { margin: '0' },
          text: 'All 4 official Quillvibe file formats (.qv, .qvbible, .qvscene, .qvstyle) use QVBX binary protection so external tools cannot read or alter manuscripts or Author Keys. Legacy .quillvibe and .bookvibe archives can still be imported from Settings -> Publishing & Archive.',
        });

    const tbody = el('tbody');
    for (const spec of QUILLVIBE_EXTENSIONS) {
      const liveItem = osReport.items.find((i) => i.extension === spec.extension);
      const isOk = Boolean(liveItem?.registered);
      tbody.appendChild(
        el(
          'tr',
          {},
          el('td', {
            className: 'bv-mono-tag',
            text: spec.extension,
            style: { color: 'var(--accent-ivory)', fontWeight: '600', whiteSpace: 'nowrap' },
          }),
          el(
            'td',
            { className: 'bv-ext-desc-col' },
            el('div', { text: spec.name, style: { fontWeight: '500', color: 'var(--text-primary)' } }),
            el('div', { className: 'bv-label', text: spec.purpose }),
          ),
          el('td', { className: 'bv-mono-tag', text: spec.mimeType }),
          ...(desktopMode
            ? [
                el(
                  'td',
                  { style: { whiteSpace: 'nowrap' } },
                  el('span', {
                    className: 'bv-mono-tag',
                    text: isOk ? 'Registered' : 'Ready to Register',
                    style: { color: isOk ? 'var(--accent-emerald)' : 'var(--accent-amber)' },
                  }),
                ),
              ]
            : []),
          el(
            'td',
            {},
            el('button', {
              className: 'bv-mini-btn',
              text: 'Save',
              attrs: { type: 'button' },
              on: { click: () => void actions.exportAsExtension(spec.extension as import('../core/types').QuillvibeExtension) },
            }),
          ),
        ),
      );
    }

    const table = el(
      'table',
      { className: 'bv-table bv-ext-table' },
      el(
        'thead',
        {},
        el(
          'tr',
          {},
          el('th', { text: 'Ext' }),
          el('th', { text: 'Format' }),
          el('th', { text: 'Official MIME' }),
          ...(desktopMode ? [el('th', { text: 'OS Status' })] : []),
          el('th', { text: 'Action' }),
        ),
      ),
      tbody,
    );

    contentArea.append(statusBanner, el('div', { className: 'bv-table-wrap' }, table));
  };

  const setActiveTab = (tab: ExtensionsModalTab) => {
    activeTab = tab;
    renderContent();
    navBridge?.onRender?.(activeTab, setActiveTab);
  };

  if (navBridge?.onRender) {
    hostBody.append(contentArea);
    renderContent();
    navBridge.onRender(activeTab, setActiveTab);
    return;
  }

  const tabSwitcher = new LiquidGlassControl<ExtensionsModalTab>({
    ariaLabel: 'Extensions section',
    surface: 'solid',
    compact: true,
    iconOnly: true,
    value: activeTab,
    options: [
      { id: 'integrated', label: 'Integrated', icon: 'layers', tooltip: TOOLTIP_CATALOG.extIntegrated },
      { id: 'external', label: 'External Sandbox', icon: 'shield', tooltip: TOOLTIP_CATALOG.extExternal },
      { id: 'formats', label: 'File Formats', icon: 'file-code', tooltip: TOOLTIP_CATALOG.extFormats },
    ],
    onChange: (tab) => {
      activeTab = tab;
      renderContent();
    },
  });
  registerGlass(tabSwitcher);
  hostBody.append(tabSwitcher.element, contentArea);
  renderContent();
}

export function renderExtensionsPageView(container: HTMLElement, actions: AppActions): void {
  if (activeExtensionsPageGlass) {
    activeExtensionsPageGlass.destroy();
    activeExtensionsPageGlass = null;
  }
  clearNode(container);

  const opts = pendingExtensionsPageOptions;
  pendingExtensionsPageOptions = {};

  const backToWriting = () => {
    actions.returnToWriting();
  };

  const tabBar = el('div', { className: 'qv-settings-sidebar-nav', attrs: { role: 'tablist', 'aria-label': 'Extensions sections' } });
  const bodyWrap = el('div', { className: 'qv-settings-page-content qv-ext-page-content' });

  const renderSidebarTabs = (activeTab: ExtensionsModalTab, setTab: (tab: ExtensionsModalTab) => void) => {
    tabBar.textContent = '';
    for (const tab of EXTENSIONS_PAGE_TABS) {
      tabBar.appendChild(
        el(
          'button',
          {
            className: `qv-settings-nav-item${activeTab === tab.id ? ' is-active' : ''}`,
            attrs: { type: 'button', role: 'tab', 'aria-selected': String(activeTab === tab.id) },
            on: { click: () => setTab(tab.id) },
          },
          icon(tab.iconName, 15),
          el('span', { text: tab.label }),
        ),
      );
    }
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
          on: { click: backToWriting },
        },
        icon('draft-sheet', 14),
        'Back to Writing',
      ),
      el('h1', { text: 'Extensions', style: { margin: '0', fontSize: '20px', fontWeight: '600' } }),
    ),
    el(
      'div',
      { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' } },
      el(
        'button',
        {
          className: 'bv-btn bv-btn-icon',
          tooltip: { title: 'Settings', short: 'Open Settings.' },
          attrs: { type: 'button', 'aria-label': 'Settings' },
          on: { click: () => actions.openSettingsModal('developer') },
        },
        icon('settings', 15),
      ),
      el(
        'button',
        {
          className: 'bv-btn bv-btn-icon',
          tooltip: { title: 'Help & Manual', short: 'Open the Quillvibe Help Center.' },
          attrs: { type: 'button', 'aria-label': 'Help & Manual' },
          on: { click: () => actions.openHelpPage() },
        },
        icon('help', 15),
      ),
      createAppThemeButton(actions),
    ),
  );

  const pageGrid = el(
    'div',
    { className: 'qv-settings-page-grid' },
    el('aside', { className: 'qv-settings-sidebar' }, tabBar),
    bodyWrap,
  );

  const pageShell = el(
    'div',
    { className: 'qv-settings-page' },
    header,
    pageGrid,
  );
  container.appendChild(pageShell);

  void mountExtensionsWorkspace(
    bodyWrap,
    actions,
    opts,
    backToWriting,
    (glass) => {
      activeExtensionsPageGlass = glass;
    },
    { onRender: renderSidebarTabs },
  );
}

export async function showExtensionsModal(
  actions: AppActions,
  options: ShowExtensionsOptions = {},
): Promise<void> {
  const existing = document.getElementById('bv-extensions-modal');
  if (existing) existing.remove();

  let modalGlass: LiquidGlassControl<ExtensionsModalTab> | null = null;
  const closeModal = () => {
    modalGlass?.destroy();
    backdrop.remove();
  };

  const modalBody = el('div', { className: 'bv-modal-body' });

  const modal = el(
    'div',
    {
      className: 'bv-modal',
      attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Extensions and Formats Manager' },
    },
    el(
      'div',
      { className: 'bv-panel-head' },
      el('span', { className: 'bv-panel-title', text: 'Extensions, Permissions & Official File Formats' }),
      el('button', {
        className: 'bv-mini-btn',
        text: 'Close',
        attrs: { type: 'button' },
        on: { click: closeModal },
      }),
    ),
    modalBody,
  );

  const backdrop = el(
    'div',
    {
      className: 'bv-modal-backdrop',
      id: 'bv-extensions-modal',
      on: {
        click: (e) => {
          if (e.target === backdrop) closeModal();
        },
      },
    },
    modal,
  );
  backdrop.addEventListener('bv-close-modal', closeModal);

  document.body.appendChild(backdrop);
  await mountExtensionsWorkspace(modalBody, actions, options, closeModal, (g) => {
    modalGlass = g;
  });
}
