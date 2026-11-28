import type { AppActions } from '../core/app-context';
import {
  getLanSyncStatus,
  isTauriRuntime,
  launchBluetoothShare,
  openQuillvibeFile,
  pollLanIncomingSync,
  pullFromLanPeer,
  pushToLanPeer,
  sanitizeSlug,
  saveQuillvibeExtensionFile,
  startLanSyncHost,
  stopLanSyncHost,
  updateLanSyncHostBook,
} from '../core/bridge';
import {
  COLLABORATOR_ROLE_LABELS,
  addCollaborator,
  addVerifiedCoAuthorFromToken,
  generateLocalCoAuthorInviteToken,
  getActiveSessionPermissions,
  getCollaboratorPermissions,
  mergeBookRevisions,
  removeCollaborator,
  updateCollaboratorPermissions,
} from '../core/collab';
import { getOrCreateLocalDeviceId } from '../core/identity';
import {
  ENTERPRISE_SERVER_CONTRACT_DOC,
  computeSha256Hex,
  loadEnterpriseSessionToken,
  loadEnterpriseSyncConfig,
  pullBookFromEnterpriseServer,
  pushBookToEnterpriseServer,
  saveEnterpriseSessionToken,
  saveEnterpriseSyncConfig,
  testEnterpriseServer,
  type EnterpriseSyncConfig,
} from '../core/enterprise-sync';
import {
  parseQuillvibeInput,
  serializeExtensionFile,
  serializeQuillvibeBinary,
} from '../core/extensions';
import { normalizeProjectDefaults } from '../core/library';
import type { CollaboratorPermissions, CollaboratorRole, LanSessionInfo } from '../core/types';
import { el, icon } from '../ui/dom';
import { LiquidGlassControl } from '../ui/liquid-glass';
import { TOOLTIP_CATALOG } from '../ui/tooltips-catalog';

type CollabTab = 'credits' | 'wifi' | 'bluetooth' | 'server';

export function showCollabModal(actions: AppActions): void {
  const existing = document.getElementById('bv-collab-modal');
  if (existing) existing.remove();

  let activeTab: CollabTab = 'credits';
  let activeGlass: LiquidGlassControl<CollabTab> | null = null;
  let lanSession: LanSessionInfo | null = null;
  let lanPollTimer: number | null = null;
  let autoMergeLan = false;
  let savedPeerAddr = '192.168.1.';
  let savedPeerPin = '';

  const initialProj = normalizeProjectDefaults(actions.getState().project);
  let serverCfg: EnterpriseSyncConfig = loadEnterpriseSyncConfig(initialProj.id);
  let serverToken = loadEnterpriseSessionToken();
  let serverStatusMessage = '';
  let serverStatusOk: boolean | null = null;

  const clearLanPolling = () => {
    if (lanPollTimer !== null) {
      window.clearInterval(lanPollTimer);
      lanPollTimer = null;
    }
  };

  const contentArea = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '14px' } });

  const mergeIncomingRaw = async (
    rawInput: Uint8Array | string,
    filenameHint: string,
    peerLabel: string,
    base64Encoded = false,
  ) => {
    try {
      const decoded = await parseQuillvibeInput(rawInput, { filenameHint, base64Encoded });
      const { parsed } = decoded;
      const valid =
        parsed.extension === '.qv' ||
        parsed.extension === '.quillvibe' ||
        parsed.extension === '.qvibe' ||
        parsed.extension === '.bookvibe' ||
        parsed.extension === '.bvibe';
      if (!valid) {
        actions.notify('Peer file must be a .qv (or legacy .quillvibe / .bookvibe) book package.');
        return;
      }
      const summary = mergeBookRevisions(actions.getState().project, parsed.payload, peerLabel);
      actions.mutateProject(() => summary.project);
      actions.notify(
        `Synced ${peerLabel}: ${summary.updatedScenes} updated, ${summary.addedScenes} new scenes, ${summary.mergedAnnotations} notes`,
      );
    } catch (err) {
      actions.notify(err instanceof Error ? err.message : 'Unable to decode peer revision.');
    }
  };

  const buildDesktopBanner = (titleText: string, bodyText: string) =>
    el(
      'div',
      { className: 'bv-desktop-banner' },
      el(
        'div',
        { className: 'bv-desktop-banner-head' },
        el('span', { className: 'bv-panel-title', text: titleText }),
      ),
      el('p', { className: 'bv-label', text: bodyText }),
      el('a', {
        className: 'bv-btn bv-btn-primary',
        text: 'Download Desktop App',
        attrs: {
          href: 'https://github.com/jhonrey-com/Quillvibe/releases/latest',
          target: '_blank',
          rel: 'noopener noreferrer',
        },
      }),
    );

  const renderTabContent = async () => {
    clearLanPolling();
    contentArea.replaceChildren();
    const project = normalizeProjectDefaults(actions.getState().project);
    const collabs = project.collaborators ?? [];
    const desktopMode = isTauriRuntime();

    if (activeTab === 'credits') {
      const sessionPerms = getActiveSessionPermissions(project);
      const canManageTeam = sessionPerms.canManageCollaborators;
      const activeNames = [
        project.authorIdentity?.penName || project.author || 'Primary Author',
        ...collabs.map((c) => c.penName || c.name),
      ];
      const activeSel = el(
        'select',
        {
          className: 'bv-input',
          on: {
            change: () => {
              actions.mutateProject((prev) => ({ ...prev, activeAuthorLabel: activeSel.value }));
              actions.notify(`Active editing identity: ${activeSel.value}`);
            },
          },
        },
        ...activeNames.map((n) =>
          el('option', {
            text: n,
            attrs: { value: n, selected: project.activeAuthorLabel === n },
          }),
        ),
      );

      const permFields: Array<{ key: keyof CollaboratorPermissions; label: string }> = [
        { key: 'canEditProse', label: 'Edit prose' },
        { key: 'canProofreadOnly', label: 'Proofread marks & notes' },
        { key: 'canEditBibleAndGraph', label: 'Edit Bible & Graph' },
        { key: 'canEditCoverAndTypeset', label: 'Edit Cover & Typeset' },
        { key: 'canExportFiles', label: 'Export files' },
        { key: 'canManageCollaborators', label: 'Manage team' },
      ];

      const list = el('div', { className: 'bv-snap-list' });
      if (collabs.length === 0) {
        list.appendChild(
          el('span', { className: 'bv-label', text: 'No co-authors, proofreaders, or team members credited yet.' }),
        );
      } else {
        for (const c of collabs) {
          const perms = getCollaboratorPermissions(c);
          const permGrid = el(
            'div',
            { className: 'qv-collab-perm-grid' },
            ...permFields.map((pf) => {
              const chk = el('input', {
                attrs: { type: 'checkbox', checked: perms[pf.key], disabled: !canManageTeam },
                on: {
                  change: () => {
                    if (!canManageTeam) {
                      chk.checked = perms[pf.key];
                      actions.notify('Managing team permissions is restricted to the book owner or managers.');
                      return;
                    }
                    actions.mutateProject((prev) =>
                      updateCollaboratorPermissions(prev, c.id, { [pf.key]: chk.checked }),
                    );
                  },
                },
              });
              return el('label', { className: 'bv-check-row' }, chk, el('span', { text: pf.label }));
            }),
          );
          list.appendChild(
            el(
              'div',
              { className: 'bv-list-card', style: { flexDirection: 'column', alignItems: 'stretch', gap: '6px' } },
              el(
                'div',
                { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' } },
                el(
                  'div',
                  {},
                  el('div', {
                    text: `${c.penName || c.name} — ${COLLABORATOR_ROLE_LABELS[c.role]}`,
                    style: { fontWeight: '600', color: 'var(--text-primary)' },
                  }),
                  el('div', {
                    className: 'bv-label',
                    text: `${c.creditLine}${c.coAuthorKeyId || c.authorKeyId ? ` | Key ${c.coAuthorKeyId || c.authorKeyId}` : ''}`,
                  }),
                ),
                el(
                  'button',
                  {
                    className: 'bv-mini-btn',
                    tooltip: { title: 'Remove Collaborator', short: 'Remove credit and access restriction rule.' },
                    attrs: { type: 'button', disabled: !canManageTeam },
                    on: {
                      click: () => {
                        if (!canManageTeam) {
                          actions.notify('Only the primary author or team managers can remove collaborators.');
                          return;
                        }
                        actions.mutateProject((prev) => removeCollaborator(prev, c.id));
                        void renderTabContent();
                      },
                    },
                  },
                  icon('trash', 12),
                ),
              ),
              el('span', {
                className: 'qv-key-locked-pill',
                text: c.verifiedDevice
                  ? `Verified Separate Device (${c.deviceId})`
                  : 'Owner Author Key: Protected (Never Changeable by Peers)',
              }),
              permGrid,
            ),
          );
        }
      }

      const localDeviceId = getOrCreateLocalDeviceId();
      const nameIn = el('input', {
        className: 'bv-input',
        attrs: { type: 'text', placeholder: 'Name / Pen name' },
      });
      const roleSel = el(
        'select',
        { className: 'bv-input' },
        ...(['co-author', 'proofreader', 'editor', 'typesetter', 'publisher', 'beta-reader'] as const).map((r) =>
          el('option', { text: COLLABORATOR_ROLE_LABELS[r], attrs: { value: r } }),
        ),
      );
      const creditIn = el('input', {
        className: 'bv-input',
        attrs: { type: 'text', placeholder: 'Credit line (e.g. Co-Author / Copyediting)' },
      });
      const coTokenIn = el('textarea', {
        className: 'bv-textarea',
        attrs: {
          rows: 2,
          placeholder: 'Paste QVCA1... Co-Author Device Key token generated on the second device',
        },
      });
      const myTokenOut = el('input', {
        className: 'bv-input',
        attrs: {
          type: 'text',
          readonly: '',
          placeholder: `Device ${localDeviceId} — click below to generate your co-author token`,
        },
      });

      contentArea.append(
        el(
          'div',
          { className: 'bv-cork-card' },
          el('span', { className: 'bv-panel-title', text: 'Active Editor / Reviewer Role' }),
          el('div', { className: 'bv-field' }, el('label', { className: 'bv-label', text: 'Attribution for new proofreader notes & snapshots' }), activeSel),
        ),
        el(
          'div',
          { className: 'bv-two-col' },
          el(
            'div',
            { className: 'bv-cork-card' },
            el('span', { className: 'bv-panel-title', text: `Co-Authors & Proofreaders (${collabs.length})` }),
            list,
          ),
          el(
            'div',
            { className: 'bv-cork-card' },
            el('span', { className: 'bv-panel-title', text: 'Verified Multi-Device Co-Author & Team' }),
            el('p', {
              className: 'bv-label',
              text: 'Adding a Co-Author requires a cryptographically signed QVCA1 token generated on their separate Quillvibe device.',
            }),
            el('div', { className: 'bv-field' }, el('label', { className: 'bv-label', text: 'Role' }), roleSel),
            el('div', { className: 'bv-field' }, el('label', { className: 'bv-label', text: 'Co-Author Device Token (Required for Co-Author)' }), coTokenIn),
            el('div', { className: 'bv-field' }, el('label', { className: 'bv-label', text: 'Name (for reviewer roles without token)' }), nameIn),
            el('div', { className: 'bv-field' }, el('label', { className: 'bv-label', text: 'Published Credit Line (Optional)' }), creditIn),
            el(
              'button',
              {
                className: 'bv-btn bv-btn-primary',
                attrs: { type: 'button', disabled: !canManageTeam },
                on: {
                  click: async () => {
                    if (!canManageTeam) {
                      actions.notify('Only the primary author or team managers can add collaborators.');
                      return;
                    }
                    const role = roleSel.value as CollaboratorRole;
                    const token = coTokenIn.value.trim();
                    if (token) {
                      try {
                        const res = await addVerifiedCoAuthorFromToken(actions.getState().project, token, {
                          roleOverride: role,
                          creditLine: creditIn.value,
                          requireDistinctDevice: true,
                        });
                        actions.mutateProject(() => res.project);
                        void renderTabContent();
                        actions.notify(`Verified & paired ${res.collaborator.penName} (${res.collaborator.coAuthorKeyId})`);
                      } catch (err) {
                        actions.notify(err instanceof Error ? err.message : 'Invalid Co-Author Device Token.');
                      }
                      return;
                    }
                    if (role === 'co-author') {
                      actions.notify('Co-Authors require a signed QVCA1 device token generated on another device.');
                      return;
                    }
                    if (!nameIn.value.trim()) {
                      actions.notify('Enter a collaborator name.');
                      return;
                    }
                    actions.mutateProject((prev) =>
                      addCollaborator(prev, {
                        name: nameIn.value,
                        role,
                        creditLine: creditIn.value,
                      }),
                    );
                    void renderTabContent();
                    actions.notify('Added reviewer credit');
                  },
                },
              },
              icon('plus', 14),
              'Verify & Add Collaborator',
            ),
            el('hr', { style: { border: '0', borderTop: '1px solid var(--border-subtle)', margin: '8px 0' } }),
            el('span', { className: 'bv-label', text: `On a 2nd device (${localDeviceId}): generate a token to send to the primary author:` }),
            myTokenOut,
            el(
              'button',
              {
                className: 'bv-mini-btn',
                attrs: { type: 'button' },
                on: {
                  click: async () => {
                    const res = await generateLocalCoAuthorInviteToken({
                      name: nameIn.value.trim() || actions.getState().project.activeAuthorLabel || 'Co-Author',
                      role: 'co-author',
                    });
                    myTokenOut.value = res.token;
                    try {
                      await navigator.clipboard?.writeText(res.token);
                      actions.notify(`Generated Co-Author Key ${res.coAuthorKeyId} (${res.deviceId}) and copied to clipboard.`);
                    } catch {
                      actions.notify(`Generated Co-Author Key ${res.coAuthorKeyId} (${res.deviceId}).`);
                    }
                  },
                },
              },
              icon('key', 13),
              'Generate My Device Co-Author Key Token',
            ),
          ),
        ),
      );
      return;
    }

    if (activeTab === 'wifi') {
      lanSession = desktopMode ? await getLanSyncStatus() : null;
      const peerAddrIn = el('input', {
        className: 'bv-input',
        attrs: { type: 'text', value: savedPeerAddr, placeholder: '192.168.1.42:48321', disabled: !desktopMode },
        on: { input: () => (savedPeerAddr = peerAddrIn.value) },
      });
      const peerPinIn = el('input', {
        className: 'bv-input',
        attrs: { type: 'text', value: savedPeerPin, placeholder: '6-digit PIN', disabled: !desktopMode },
        on: { input: () => (savedPeerPin = peerPinIn.value) },
      });

      const pendingStatusEl = el('div', {
        className: 'bv-label',
        text: `Pending peer pushes: ${lanSession?.incomingCount ?? 0}`,
      });

      const autoMergeChk = el('input', {
        className: 'bv-lever',
        attrs: { type: 'checkbox', role: 'switch', checked: autoMergeLan, disabled: !desktopMode },
        on: {
          change: () => {
            autoMergeLan = autoMergeChk.checked;
            actions.notify(autoMergeLan ? 'Auto-merge enabled while LAN host runs.' : 'Manual merge mode active.');
          },
        },
      });

      if (desktopMode && lanSession?.active) {
        lanPollTimer = window.setInterval(() => {
          void getLanSyncStatus().then(async (latest) => {
            if (!latest || !pendingStatusEl.isConnected) return;
            lanSession = latest;
            pendingStatusEl.textContent = `Pending peer pushes: ${latest.incomingCount}`;
            if (autoMergeLan && latest.incomingCount > 0) {
              while (true) {
                const incoming = await pollLanIncomingSync();
                if (!incoming) break;
                await mergeIncomingRaw(incoming, 'peer.qv', 'Wi-Fi Peer');
              }
              await updateLanSyncHostBook(
                serializeExtensionFile('.qv', actions.getState().project),
              );
            }
          });
        }, 3000);
      }

      if (!desktopMode) {
        contentArea.appendChild(
          buildDesktopBanner(
            'Same-Wi-Fi LAN Sync — Desktop App Only',
            'Web browsers block raw local Wi-Fi TCP servers and peer sockets. Install the Windows, macOS, or Linux desktop app to pair over local Wi-Fi, or use the Enterprise / Website Sync tab directly from any browser.',
          ),
        );
      }

      contentArea.append(
        el(
          'div',
          {
            className: `bv-two-col${!desktopMode ? ' bv-desktop-only-section' : ''}`,
            attrs: { 'aria-disabled': !desktopMode },
          },
          el(
            'section',
            { className: 'bv-cork-card' },
            el('span', { className: 'bv-panel-title', text: 'Host Offline Same-Wi-Fi Session' }),
            el('p', {
              className: 'bv-label',
              text: 'Shares this book directly over your local private Wi-Fi router with constant-time 6-digit PIN verification and automatic conflict snapshots.',
            }),
            lanSession?.active
              ? el(
                  'div',
                  { className: 'bv-list-card', style: { flexDirection: 'column', alignItems: 'flex-start', gap: '4px' } },
                  el('div', {
                    className: 'bv-mono-tag',
                    text: `Address: ${lanSession.hostIp}:${lanSession.port}`,
                    style: { color: 'var(--accent-ivory)', fontSize: '12.5px' },
                  }),
                  lanSession.candidateIps && lanSession.candidateIps.length > 1
                    ? el('div', {
                        className: 'bv-label',
                        text: `Alternate IPs: ${lanSession.candidateIps.slice(1).join(', ')}`,
                      })
                    : null,
                  lanSession.hostIp === '127.0.0.1'
                    ? el('div', {
                        className: 'bv-label',
                        text: 'Loopback only detected. Connect to a Wi-Fi router or hotspot and click Restart Host.',
                        style: { color: 'var(--accent-amber)' },
                      })
                    : null,
                  el('div', {
                    className: 'bv-mono-tag',
                    text: `Pairing PIN: ${lanSession.pin}`,
                    style: { color: 'var(--accent-emerald)', fontSize: '13px', fontWeight: '600' },
                  }),
                  pendingStatusEl,
                )
              : null,
            el('label', { className: 'bv-check-row' }, autoMergeChk, el('span', { text: 'Auto-merge incoming peer pushes' })),
            el(
              'div',
              { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
              !lanSession?.active
                ? el(
                    'button',
                    {
                      className: 'bv-btn bv-btn-primary',
                      attrs: { type: 'button', disabled: !desktopMode },
                      on: {
                        click: async () => {
                          try {
                            const latest = actions.getState().project;
                            const json = serializeExtensionFile('.qv', latest);
                            lanSession = await startLanSyncHost(
                              json,
                              latest.activeAuthorLabel || 'Quillvibe Host',
                            );
                            void renderTabContent();
                            actions.notify(`LAN Host active at ${lanSession.hostIp}:${lanSession.port}`);
                          } catch (err) {
                            actions.notify(err instanceof Error ? err.message : 'Unable to start LAN host.');
                          }
                        },
                      },
                    },
                    icon('wifi', 14),
                    'Start LAN Sync Host',
                  )
                : el(
                    'button',
                    {
                      className: 'bv-btn',
                      text: 'Stop Host',
                      attrs: { type: 'button' },
                      on: {
                        click: async () => {
                          await stopLanSyncHost();
                          lanSession = null;
                          void renderTabContent();
                        },
                      },
                    },
                  ),
              lanSession?.active
                ? el('button', {
                    className: 'bv-btn',
                    text: 'Copy Address & PIN',
                    attrs: { type: 'button' },
                    on: {
                      click: async () => {
                        if (!lanSession) return;
                        const text = `Address: ${lanSession.hostIp}:${lanSession.port}\nPIN: ${lanSession.pin}`;
                        try {
                          await navigator.clipboard?.writeText(text);
                          actions.notify('Copied LAN address and PIN to clipboard.');
                        } catch {
                          actions.notify(`Share ${text}`);
                        }
                      },
                    },
                  })
                : null,
              lanSession?.active
                ? el('button', {
                    className: 'bv-btn',
                    text: 'Update Hosted Book',
                    attrs: { type: 'button' },
                    on: {
                      click: async () => {
                        const json = serializeExtensionFile('.qv', actions.getState().project);
                        const ok = await updateLanSyncHostBook(json);
                        actions.notify(
                          ok
                            ? 'Updated live Wi-Fi snapshot with your latest edits.'
                            : 'Host session is not active.',
                        );
                      },
                    },
                  })
                : null,
              lanSession?.active
                ? el('button', {
                    className: 'bv-btn',
                    text: 'Merge Incoming Push',
                    attrs: { type: 'button' },
                    on: {
                      click: async () => {
                        let mergedCount = 0;
                        while (true) {
                          const incoming = await pollLanIncomingSync();
                          if (!incoming) break;
                          await mergeIncomingRaw(incoming, 'peer.qv', 'Wi-Fi Peer');
                          mergedCount++;
                        }
                        if (mergedCount === 0) {
                          actions.notify('No incoming peer edits waiting.');
                          return;
                        }
                        await updateLanSyncHostBook(
                          serializeExtensionFile('.qv', actions.getState().project),
                        );
                        void renderTabContent();
                      },
                    },
                  })
                : null,
            ),
          ),
          el(
            'section',
            { className: 'bv-cork-card' },
            el('span', { className: 'bv-panel-title', text: 'Connect to Peer on Same Wi-Fi' }),
            el('div', { className: 'bv-field' }, el('label', { className: 'bv-label', text: 'Peer LAN Address (IP:PORT)' }), peerAddrIn),
            el('div', { className: 'bv-field' }, el('label', { className: 'bv-label', text: 'Host 6-Digit PIN' }), peerPinIn),
            el(
              'div',
              { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
              el('button', {
                className: 'bv-btn bv-btn-primary',
                text: 'Pull & Merge Book',
                attrs: { type: 'button', disabled: !desktopMode },
                on: {
                  click: async () => {
                    try {
                      const raw = await pullFromLanPeer(peerAddrIn.value, peerPinIn.value);
                      await mergeIncomingRaw(raw, 'lan-peer.qv', peerAddrIn.value.trim());
                    } catch (err) {
                      actions.notify(err instanceof Error ? err.message : 'LAN pull failed.');
                    }
                  },
                },
              }),
              el('button', {
                className: 'bv-btn',
                text: 'Push My Edits to Host',
                attrs: { type: 'button', disabled: !desktopMode },
                on: {
                  click: async () => {
                    try {
                      const json = serializeExtensionFile('.qv', actions.getState().project);
                      await pushToLanPeer(peerAddrIn.value, peerPinIn.value, json);
                      actions.notify('Sent book edits to LAN host');
                    } catch (err) {
                      actions.notify(err instanceof Error ? err.message : 'LAN push failed.');
                    }
                  },
                },
              }),
            ),
          ),
        ),
      );
      return;
    }

    if (activeTab === 'bluetooth') {
      const fingerprintEl = el('div', {
        className: 'bv-mono-tag',
        text: 'Computing package SHA-256 checksum…',
      });
      const currentPayload = serializeExtensionFile('.qv', project);
      void computeSha256Hex(currentPayload).then((hex) => {
        if (fingerprintEl.isConnected) {
          fingerprintEl.textContent = `Package SHA-256: ${hex.slice(0, 16).toUpperCase()} (${Math.round(currentPayload.length / 1024)} KB)`;
        }
      });

      if (!desktopMode) {
        contentArea.appendChild(
          buildDesktopBanner(
            'Native OS Bluetooth Wizard — Desktop App Only',
            'Direct launching of Windows Bluetooth File Transfer (fsquirt.exe), macOS Bluetooth File Exchange, or Linux bluetooth-sendto requires the desktop app. In browser mode you can share/download a .qv file and merge received peer files below.',
          ),
        );
      }

      contentArea.append(
        el(
          'div',
          { className: 'bv-two-col' },
          el(
            'section',
            { className: 'bv-cork-card' },
            el('span', { className: 'bv-panel-title', text: 'Send via Bluetooth / Nearby Share' }),
            el('p', {
              className: 'bv-label',
              text: desktopMode
                ? 'Save a .qv revision package and immediately launch your OS Bluetooth File Transfer wizard to send it without internet.'
                : 'Share a .qv revision package through your system share sheet or Bluetooth / Nearby Share, or download for transfer.',
            }),
            fingerprintEl,
            el(
              'div',
              { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
              el(
                'button',
                {
                  className: 'bv-btn bv-btn-primary',
                  attrs: { type: 'button' },
                  on: {
                    click: async () => {
                      const current = actions.getState().project;
                      const binary = await serializeQuillvibeBinary('.qv', current);
                      const filename = `${sanitizeSlug(current.title)}.qv`;
                      if (desktopMode) {
                        const savedPath = await saveQuillvibeExtensionFile('.qv', binary, current.title);
                        if (!savedPath) {
                          actions.notify('Bluetooth export cancelled.');
                          return;
                        }
                        try {
                          await navigator.clipboard?.writeText(savedPath);
                        } catch {
                          // Clipboard optional
                        }
                        const msg = await launchBluetoothShare({ filePath: savedPath, mode: 'send' });
                        actions.notify(msg);
                        return;
                      }
                      const msg = await launchBluetoothShare({
                        mode: 'send',
                        filename,
                        payloadBytes: binary,
                        title: current.title,
                      });
                      actions.notify(msg);
                    },
                  },
                },
                icon('bluetooth', 14),
                'Save & Open Bluetooth Share',
              ),
              desktopMode
                ? el(
                    'button',
                    {
                      className: 'bv-btn',
                      text: 'Open Bluetooth Transfer',
                      attrs: { type: 'button' },
                      on: {
                        click: async () => {
                          const msg = await launchBluetoothShare({ mode: 'send' });
                          actions.notify(msg);
                        },
                      },
                    },
                  )
                : null,
            ),
          ),
          el(
            'section',
            { className: 'bv-cork-card' },
            el('span', { className: 'bv-panel-title', text: 'Merge Received Bluetooth / Local File' }),
            el('p', {
              className: 'bv-label',
              text: 'Import a co-author or proofreader’s .qv or legacy .quillvibe / .bookvibe file received over Bluetooth or USB. Conflicting scene edits are preserved as snapshots.',
            }),
            el(
              'div',
              { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
              desktopMode
                ? el(
                    'button',
                    {
                      className: 'bv-btn',
                      attrs: { type: 'button' },
                      on: {
                        click: async () => {
                          const msg = await launchBluetoothShare({ mode: 'receive' });
                          actions.notify(msg);
                        },
                      },
                    },
                    icon('bluetooth', 14),
                    'Open Bluetooth Receive',
                  )
                : null,
              el(
                'button',
                {
                  className: desktopMode ? 'bv-btn bv-btn-primary' : 'bv-btn',
                  attrs: { type: 'button' },
                  on: {
                    click: async () => {
                      const opened = await openQuillvibeFile();
                      if (!opened) return;
                      await mergeIncomingRaw(
                        opened.isBinary && opened.contentBase64 ? opened.contentBase64 : opened.content,
                        opened.filename,
                        opened.filename,
                        Boolean(opened.isBinary),
                      );
                    },
                  },
                },
                icon('folder', 14),
                'Pick & Merge Peer File…',
              ),
            ),
          ),
        ),
      );
      return;
    }

    // 4. Enterprise / Self-Hosted Server & Custom Website Sync
    const urlIn = el('input', {
      className: 'bv-input',
      attrs: {
        type: 'url',
        value: serverCfg.baseUrl,
        placeholder: 'https://sync.yourcompany.com/api (or http://192.168.1.10:8080)',
      },
      on: {
        change: () => {
          serverCfg = { ...serverCfg, baseUrl: urlIn.value.trim() };
          saveEnterpriseSyncConfig(serverCfg);
        },
      },
    });

    const bookSyncIdIn = el('input', {
      className: 'bv-input',
      attrs: {
        type: 'text',
        value: serverCfg.bookSyncId || project.id,
        placeholder: 'Remote book channel ID (e.g. novel-manuscript-1)',
      },
      on: {
        change: () => {
          serverCfg = { ...serverCfg, bookSyncId: bookSyncIdIn.value.trim() || project.id };
          saveEnterpriseSyncConfig(serverCfg);
        },
      },
    });

    const headerNameIn = el('input', {
      className: 'bv-input',
      attrs: {
        type: 'text',
        value: serverCfg.headerName,
        placeholder: 'X-API-Key',
      },
      style: { display: serverCfg.authType === 'api-key' ? '' : 'none' },
      on: {
        change: () => {
          serverCfg = { ...serverCfg, headerName: headerNameIn.value.trim() || 'X-API-Key' };
          saveEnterpriseSyncConfig(serverCfg);
        },
      },
    });

    const authSel = el(
      'select',
      {
        className: 'bv-input',
        on: {
          change: () => {
            const val = authSel.value as EnterpriseSyncConfig['authType'];
            serverCfg = { ...serverCfg, authType: val };
            headerNameIn.style.display = val === 'api-key' ? '' : 'none';
            saveEnterpriseSyncConfig(serverCfg);
          },
        },
      },
      el('option', { text: 'Bearer Token (Authorization: Bearer)', attrs: { value: 'bearer', selected: serverCfg.authType === 'bearer' } }),
      el('option', { text: 'Custom API Key Header', attrs: { value: 'api-key', selected: serverCfg.authType === 'api-key' } }),
      el('option', { text: 'Open LAN / No Auth Header', attrs: { value: 'none', selected: serverCfg.authType === 'none' } }),
    );

    const tokenIn = el('input', {
      className: 'bv-input',
      attrs: {
        type: 'password',
        value: serverToken,
        placeholder: 'API key or Bearer token (session-only, never exported)',
        autocomplete: 'off',
      },
      on: {
        input: () => {
          serverToken = tokenIn.value;
          saveEnterpriseSessionToken(serverToken);
        },
      },
    });

    const autoPullSel = el(
      'select',
      {
        className: 'bv-input',
        on: {
          change: () => {
            serverCfg = { ...serverCfg, autoPullSec: Number(autoPullSel.value) || 0 };
            saveEnterpriseSyncConfig(serverCfg);
            void renderTabContent();
          },
        },
      },
      el('option', { text: 'Manual Pull & Push Only', attrs: { value: '0', selected: serverCfg.autoPullSec === 0 } }),
      el('option', { text: 'Auto-Pull Every 15 Seconds (While Open)', attrs: { value: '15', selected: serverCfg.autoPullSec === 15 } }),
      el('option', { text: 'Auto-Pull Every 60 Seconds (While Open)', attrs: { value: '60', selected: serverCfg.autoPullSec === 60 } }),
    );

    const statusTag = el('div', {
      className: 'bv-mono-tag',
      text: serverStatusMessage || 'Ready to connect over HTTPS (or private LAN HTTP).',
      style: {
        color:
          serverStatusOk === true
            ? 'var(--accent-emerald)'
            : serverStatusOk === false
              ? 'var(--accent-crimson)'
              : 'var(--text-secondary)',
      },
    });

    if (serverCfg.autoPullSec > 0 && serverCfg.baseUrl.trim()) {
      lanPollTimer = window.setInterval(() => {
        void pullBookFromEnterpriseServer(serverCfg, serverToken, actions.getState().project)
          .then(({ rawJson }) => {
            mergeIncomingRaw(rawJson, 'remote.qv', 'Enterprise Server');
          })
          .catch(() => {
            // Silent retry on background poll
          });
      }, serverCfg.autoPullSec * 1000);
    }

    contentArea.append(
      el(
        'div',
        { className: 'bv-two-col' },
        el(
          'section',
          { className: 'bv-cork-card' },
          el('span', { className: 'bv-panel-title', text: 'Connect Your Server or Website Endpoint' }),
          el('p', {
            className: 'bv-label',
            text: 'Sync teams directly against your company API, publishing house server, or personal website. Remote URLs require TLS (https://); plain http:// is blocked on public hosts.',
          }),
          el('div', { className: 'bv-field' }, el('label', { className: 'bv-label', text: 'Endpoint Base URL' }), urlIn),
          el('div', { className: 'bv-field' }, el('label', { className: 'bv-label', text: 'Book Channel / Repository ID' }), bookSyncIdIn),
          el('div', { className: 'bv-field' }, el('label', { className: 'bv-label', text: 'Authentication Scheme' }), authSel),
          headerNameIn,
          el('div', { className: 'bv-field' }, el('label', { className: 'bv-label', text: 'Access Token / Secret' }), tokenIn),
          el('div', { className: 'bv-field' }, el('label', { className: 'bv-label', text: 'Live Auto-Pull Interval' }), autoPullSel),
          statusTag,
          el(
            'div',
            { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
            el('button', {
              className: 'bv-btn',
              text: 'Test Connection',
              attrs: { type: 'button' },
              on: {
                click: async () => {
                  serverCfg = { ...serverCfg, baseUrl: urlIn.value.trim(), bookSyncId: bookSyncIdIn.value.trim() || project.id };
                  saveEnterpriseSyncConfig(serverCfg);
                  const res = await testEnterpriseServer(serverCfg, tokenIn.value);
                  serverStatusOk = res.ok;
                  serverStatusMessage = res.message;
                  statusTag.textContent = res.message;
                  statusTag.style.color = res.ok ? 'var(--accent-emerald)' : 'var(--accent-crimson)';
                },
              },
            }),
            el('button', {
              className: 'bv-btn bv-btn-primary',
              text: 'Pull & Merge Latest',
              attrs: { type: 'button' },
              on: {
                click: async () => {
                  try {
                    serverCfg = { ...serverCfg, baseUrl: urlIn.value.trim(), bookSyncId: bookSyncIdIn.value.trim() || project.id };
                    saveEnterpriseSyncConfig(serverCfg);
                    const { rawJson, sha256 } = await pullBookFromEnterpriseServer(serverCfg, tokenIn.value, project);
                    await mergeIncomingRaw(rawJson, 'enterprise.qv', 'Enterprise Sync Server');
                    serverStatusOk = true;
                    serverStatusMessage = `Pulled SHA-256 ${sha256.slice(0, 12).toUpperCase()}`;
                    statusTag.textContent = serverStatusMessage;
                    statusTag.style.color = 'var(--accent-emerald)';
                  } catch (err) {
                    const msg = err instanceof Error ? err.message : 'Server pull failed.';
                    serverStatusOk = false;
                    serverStatusMessage = msg;
                    statusTag.textContent = msg;
                    statusTag.style.color = 'var(--accent-crimson)';
                    actions.notify(msg);
                  }
                },
              },
            }),
            el('button', {
              className: 'bv-btn',
              text: 'Push My Revision',
              attrs: { type: 'button' },
              on: {
                click: async () => {
                  try {
                    serverCfg = { ...serverCfg, baseUrl: urlIn.value.trim(), bookSyncId: bookSyncIdIn.value.trim() || project.id };
                    saveEnterpriseSyncConfig(serverCfg);
                    const json = serializeExtensionFile('.qv', actions.getState().project);
                    const res = await pushBookToEnterpriseServer(serverCfg, tokenIn.value, project, json);
                    serverStatusOk = true;
                    serverStatusMessage = `Pushed revision (HTTP ${res.status}, ${res.sha256.slice(0, 12).toUpperCase()})`;
                    statusTag.textContent = serverStatusMessage;
                    statusTag.style.color = 'var(--accent-emerald)';
                    actions.notify('Pushed book revision to your sync server.');
                  } catch (err) {
                    const msg = err instanceof Error ? err.message : 'Server push failed.';
                    serverStatusOk = false;
                    serverStatusMessage = msg;
                    statusTag.textContent = msg;
                    statusTag.style.color = 'var(--accent-crimson)';
                    actions.notify(msg);
                  }
                },
              },
            }),
          ),
        ),
        el(
          'section',
          { className: 'bv-cork-card' },
          el('span', { className: 'bv-panel-title', text: 'Self-Hosted Server / Website API Contract' }),
          el('p', {
            className: 'bv-label',
            text: 'Implement these three lightweight HTTP routes on your company backend, serverless edge worker, or static-site companion server to host live collaborative writing rooms:',
          }),
          el('pre', {
            className: 'qv-code-contract',
            text: ENTERPRISE_SERVER_CONTRACT_DOC,
          }),
          el(
            'button',
            {
              className: 'bv-btn',
              attrs: { type: 'button' },
              on: {
                click: async () => {
                  try {
                    await navigator.clipboard?.writeText(ENTERPRISE_SERVER_CONTRACT_DOC);
                    actions.notify('Copied REST API sync specification to clipboard.');
                  } catch {
                    actions.notify('Select and copy the API contract above.');
                  }
                },
              },
            },
            'Copy API Specification',
          ),
        ),
      ),
    );
  };

  const tabOptions: Array<{
    id: CollabTab;
    label: string;
    icon: 'collab' | 'wifi' | 'bluetooth' | 'server';
    tooltip: (typeof TOOLTIP_CATALOG)['collabCredits'];
  }> = [
    { id: 'credits', label: 'Co-Authors & Permissions', icon: 'collab', tooltip: TOOLTIP_CATALOG.collabCredits },
    ...(isTauriRuntime()
      ? [
          { id: 'wifi' as const, label: 'Same-Wi-Fi LAN Sync', icon: 'wifi' as const, tooltip: TOOLTIP_CATALOG.collabWifi },
          { id: 'bluetooth' as const, label: 'Bluetooth & Nearby Sync', icon: 'bluetooth' as const, tooltip: TOOLTIP_CATALOG.collabBluetooth },
        ]
      : []),
    { id: 'server', label: 'Enterprise / Website Sync', icon: 'server', tooltip: TOOLTIP_CATALOG.collabServer },
  ];

  const tabSwitcher = new LiquidGlassControl<CollabTab>({
    ariaLabel: 'Collaboration method',
    surface: 'solid',
    compact: true,
    iconOnly: true,
    value: activeTab,
    options: tabOptions,
    onChange: (tab) => {
      activeTab = tab;
      void renderTabContent();
    },
  });
  activeGlass = tabSwitcher;

  const closeModal = () => {
    clearLanPolling();
    activeGlass?.destroy();
    backdrop.remove();
  };

  const modalTitle = 'Collaboration';

  const modal = el(
    'div',
    {
      className: 'bv-modal',
      attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-label': modalTitle },
    },
    el(
      'div',
      { className: 'bv-panel-head' },
      el('span', { className: 'bv-panel-title', text: modalTitle }),
      el('button', {
        className: 'bv-mini-btn',
        text: 'Close',
        attrs: { type: 'button' },
        on: { click: closeModal },
      }),
    ),
    el(
      'div',
      { className: 'bv-modal-body' },
      el('div', { className: 'qv-collab-tabbar' }, tabSwitcher.element),
      contentArea,
    ),
  );

  const backdrop = el(
    'div',
    {
      className: 'bv-modal-backdrop',
      id: 'bv-collab-modal',
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
  void renderTabContent();
}
