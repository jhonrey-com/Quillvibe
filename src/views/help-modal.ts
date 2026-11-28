import type { AppActions } from '../core/app-context';
import { QUILLVIBE_EXTENSIONS } from '../core/extensions';
import {
  CONTROL_CATEGORIES,
  CONTROL_REFERENCE_ITEMS,
  type ControlCategory,
} from '../ui/controls-catalog';
import {
  COURSE_MODULES,
  getCourseCompletionSummary,
  openInteractiveCourseDrawer,
  readCompletedCourseLessons,
} from '../ui/course';
import { clearNode, el, icon, preserveScrollPositions, type IconName } from '../ui/dom';
import { createAppThemeButton } from '../ui/theme-button';
import { ICON_DIRECTORY, type IconDirectoryEntry } from '../ui/icon-directory';

export type HelpTab = 'controls' | 'course' | 'tour' | 'icons' | 'guides' | 'reference';

let currentManualTab: HelpTab = 'course';

export function setManualPageTab(tab: HelpTab): void {
  currentManualTab = tab;
}

const HELP_TABS: Array<{ id: HelpTab; label: string }> = [
  { id: 'course', label: 'Course' },
  { id: 'controls', label: 'Controls' },
  { id: 'icons', label: 'Icons' },
  { id: 'guides', label: 'Guides' },
  { id: 'tour', label: 'Walkthrough' },
  { id: 'reference', label: 'Formats' },
];

const SHORTCUT_LIST: Array<{ keys: string; action: string }> = [
  { keys: 'Ctrl / Cmd + Z / Y', action: 'Undo or redo edits across Manuscript, Corkboard, Outline, Bible, Graph, Typeset, and Cover Studio' },
  { keys: 'Ctrl / Cmd + S', action: 'Capture a Revision Snapshot in Manuscript view, or export default file elsewhere' },
  { keys: 'Ctrl / Cmd + O', action: 'Open any .qv, .qv* or .qvext file (use Settings -> Publishing & Archive for legacy .quillvibe / .bookvibe imports)' },
  { keys: 'Ctrl / Cmd + B / I', action: 'Wrap selected draft prose in **bold** or *italic* Markdown' },
  { keys: 'Ctrl / Cmd + Shift + F', action: 'Toggle Zen Focus Mode (hides binder and inspector sidebars)' },
  { keys: 'Right-Click Anywhere', action: 'Open contextual formatting, 15 proofread marks, layer tools, or scene actions' },
  { keys: 'F1', action: 'Open or focus the Quillvibe Help manual' },
  { keys: 'Esc', action: 'Close open dialogs, context menus, walkthroughs, or leave Zen Focus Mode' },
  { keys: 'Mouse Wheel (Story Graph)', action: 'Zoom smoothly toward or away from graph nodes around cursor' },
  { keys: 'Drag Node Port ● (Graph)', action: 'Draw a live relationship line directly onto another graph card' },
];

export function showHelpModal(actions: AppActions, initialTab: HelpTab = 'course'): void {
  currentManualTab = initialTab;
  actions.openHelpModal(initialTab);
}

export function renderManualPageView(container: HTMLElement, actions: AppActions): void {
  const restoreScroll = preserveScrollPositions(container, ['.qv-manual-page', '.qv-manual-page-content']);
  clearNode(container);

  let activeTab: HelpTab = currentManualTab;
  let globalSearchQuery = '';
  let controlCatFilter: 'All' | ControlCategory = 'All';
  let locationFilter: 'All' | IconDirectoryEntry['location'] = 'All';

  const globalSearchIn = el('input', {
    className: 'bv-input bv-help-search-input',
    attrs: {
      type: 'search',
      placeholder: 'Search any slider, lever, button, dropdown (e.g. 15m, reset, sprint, barcode, font, lock, docx, qvdesign)…',
      'aria-label': 'Search all Quillvibe help topics, controls, icons, and shortcuts',
      value: globalSearchQuery,
    },
    on: {
      input: () => {
        globalSearchQuery = globalSearchIn.value.trim().toLowerCase();
        renderBody();
      },
    },
  });

  const clearSearchBtn = el('button', {
    className: 'bv-mini-btn',
    text: 'Clear',
    attrs: { type: 'button' },
    on: {
      click: () => {
        globalSearchQuery = '';
        globalSearchIn.value = '';
        renderBody();
      },
    },
  });

  const searchBar = el(
    'div',
    { className: 'bv-help-search-row' },
    globalSearchIn,
    clearSearchBtn,
  );

  const tabBar = el('div', { className: 'bv-modal-tab-strip', attrs: { role: 'tablist' } });
  const bodyWrap = el('div', { className: 'qv-manual-page-content' });

  const closeModal = () => {
    actions.returnToWriting();
  };

const MANUAL_TAB_ICONS: Record<HelpTab, IconName> = {
  course: 'course',
  controls: 'settings',
  icons: 'palette',
  guides: 'book',
  tour: 'target',
  reference: 'archive-format',
};

const renderTabs = () => {
    tabBar.textContent = '';
    for (const tab of HELP_TABS) {
      tabBar.appendChild(
        el(
          'button',
          {
            className: `bv-fmt-btn${activeTab === tab.id ? ' is-active' : ''}`,
            attrs: { type: 'button', role: 'tab', 'aria-selected': String(activeTab === tab.id) },
            on: {
              click: () => {
                activeTab = tab.id;
                currentManualTab = tab.id;
                globalSearchQuery = '';
                globalSearchIn.value = '';
                renderTabs();
                renderBody();
              },
            },
          },
          icon(MANUAL_TAB_ICONS[tab.id], 13),
          el('span', { text: tab.label }),
        ),
      );
    }
  };

  const renderSearchResults = (query: string) => {
    const matchedControls = CONTROL_REFERENCE_ITEMS.filter((item) =>
      `${item.name} ${item.category} ${item.controlType} ${item.location} ${item.summary} ${item.howToUse} ${item.keywords}`
        .toLowerCase()
        .includes(query),
    );
    const matchedIcons = ICON_DIRECTORY.filter((entry) =>
      `${entry.name} ${entry.icon} ${entry.location} ${entry.meaning} ${entry.shortcut ?? ''}`
        .toLowerCase()
        .includes(query),
    );
    const matchedShortcuts = SHORTCUT_LIST.filter((s) =>
      `${s.keys} ${s.action}`.toLowerCase().includes(query),
    );
    const matchedFormats = QUILLVIBE_EXTENSIONS.filter((ext) =>
      `${ext.extension} ${ext.name} ${ext.shortLabel} ${ext.purpose} ${ext.mimeType}`.toLowerCase().includes(query),
    );

    const total = matchedControls.length + matchedIcons.length + matchedShortcuts.length + matchedFormats.length;
    bodyWrap.appendChild(
      el('div', {
        className: 'bv-mono-tag',
        text: `${total} matching result(s) for “${globalSearchIn.value.trim()}” across Controls, Icons, Shortcuts & Formats`,
        style: { color: 'var(--accent-amber)' },
      }),
    );

    if (total === 0) {
      bodyWrap.appendChild(
        el(
          'section',
          { className: 'bv-cork-card' },
          el('strong', { text: 'No exact match found' }),
          el('p', {
            className: 'bv-label',
            text: 'Try searching terms like sprint, 15m, reset, slider, lever, font, cover, barcode, graph, inspector, or click Clear above.',
          }),
        ),
      );
      return;
    }

    if (matchedControls.length > 0) {
      const grid = el('div', { className: 'bv-help-control-grid' });
      for (const item of matchedControls) {
        grid.appendChild(
          el(
            'div',
            { className: 'bv-help-control-card' },
            el(
              'div',
              { className: 'bv-help-control-head' },
              el('strong', { text: item.name, style: { fontSize: '12.5px' } }),
              el('span', { className: 'bv-control-type-pill', text: item.controlType }),
            ),
            el('div', { className: 'bv-mono-tag', text: `${item.category} (${item.location})` }),
            el('p', { className: 'bv-label', text: item.summary, style: { margin: '2px 0 0', color: 'var(--text-primary)' } }),
            el('p', { className: 'bv-label', text: item.howToUse, style: { margin: '2px 0 0' } }),
          ),
        );
      }
      bodyWrap.append(
        el('span', { className: 'bv-panel-title', text: `Controls, Sliders & Levers (${matchedControls.length})` }),
        grid,
      );
    }

    if (matchedIcons.length > 0) {
      const grid = el('div', { className: 'bv-help-icon-grid' });
      for (const entry of matchedIcons) {
        grid.appendChild(
          el(
            'div',
            { className: 'bv-help-icon-card' },
            el('div', { className: 'bv-help-icon-badge' }, icon(entry.icon, 18)),
            el(
              'div',
              { style: { minWidth: '0', flex: '1' } },
              el('strong', { text: entry.name, style: { fontSize: '12.5px' } }),
              el('div', { className: 'bv-mono-tag', text: entry.location }),
              el('p', { className: 'bv-label', text: entry.meaning, style: { margin: '4px 0 0' } }),
            ),
          ),
        );
      }
      bodyWrap.append(
        el('span', { className: 'bv-panel-title', text: `Matching Icons (${matchedIcons.length})` }),
        grid,
      );
    }

    if (matchedFormats.length > 0) {
      const fmtWrap = el('div', { className: 'bv-snap-list' });
      for (const item of matchedFormats) {
        fmtWrap.appendChild(
          el(
            'div',
            { className: 'bv-list-card', style: { flexDirection: 'column', alignItems: 'flex-start', gap: '4px' } },
            el('div', { style: { display: 'flex', gap: '8px', alignItems: 'center' } },
              el('strong', { text: item.extension, style: { fontFamily: 'var(--font-mono)', fontSize: '13px', color: 'var(--accent-ivory)' } }),
              el('span', { text: item.name, style: { fontWeight: '600', fontSize: '12.5px' } }),
            ),
            el('span', { className: 'bv-label', text: item.purpose }),
          ),
        );
      }
      bodyWrap.append(
        el('span', { className: 'bv-panel-title', text: `File Formats (${matchedFormats.length})` }),
        fmtWrap,
      );
    }

    if (matchedShortcuts.length > 0) {
      const wrap = el('div', { className: 'bv-snap-list' });
      for (const row of matchedShortcuts) {
        wrap.appendChild(
          el(
            'div',
            { className: 'bv-list-card' },
            el('span', { text: row.action, style: { fontSize: '12.5px' } }),
            el('span', { className: 'bv-kbd-chip', text: row.keys }),
          ),
        );
      }
      bodyWrap.append(
        el('span', { className: 'bv-panel-title', text: `Shortcuts (${matchedShortcuts.length})` }),
        wrap,
      );
    }
  };

  const renderBody = () => {
    bodyWrap.textContent = '';

    if (globalSearchQuery.length > 0) {
      renderSearchResults(globalSearchQuery);
      return;
    }

    const state = actions.getState();

    if (activeTab === 'controls') {
      const catRow = el('div', { style: { display: 'flex', gap: '5px', flexWrap: 'wrap' } });
      const cats: Array<'All' | ControlCategory> = ['All', ...CONTROL_CATEGORIES];
      const grid = el('div', { className: 'bv-help-control-grid' });

      const renderCats = () => {
        catRow.textContent = '';
        for (const cat of cats) {
          catRow.appendChild(
            el('button', {
              className: `bv-mini-btn${controlCatFilter === cat ? ' is-active' : ''}`,
              text: cat,
              attrs: { type: 'button' },
              on: {
                click: () => {
                  controlCatFilter = cat;
                  renderCats();
                  renderControlCards();
                },
              },
            }),
          );
        }
      };

      const renderControlCards = () => {
        grid.textContent = '';
        const items = CONTROL_REFERENCE_ITEMS.filter(
          (item) => controlCatFilter === 'All' || item.category === controlCatFilter,
        );
        for (const item of items) {
          grid.appendChild(
            el(
              'div',
              { className: 'bv-help-control-card' },
              el(
                'div',
                { className: 'bv-help-control-head' },
                el('strong', { text: item.name, style: { fontSize: '12.5px' } }),
                el('span', { className: 'bv-control-type-pill', text: item.controlType }),
              ),
              el('div', { className: 'bv-mono-tag', text: `${item.category} (${item.location})` }),
              el('p', {
                className: 'bv-label',
                text: item.summary,
                style: { margin: '2px 0 0', color: 'var(--text-primary)', lineHeight: '1.45' },
              }),
              el('p', {
                className: 'bv-label',
                text: item.howToUse,
                style: { margin: '2px 0 0', lineHeight: '1.45' },
              }),
            ),
          );
        }
      };

      renderCats();
      renderControlCards();
      bodyWrap.append(catRow, grid);
      return;
    }

    if (activeTab === 'tour') {
      const tourChk = el('input', {
        className: 'bv-lever',
        attrs: { type: 'checkbox', role: 'switch', checked: state.settings.showOnboardingHints },
        on: {
          change: () => actions.updateSettings({ showOnboardingHints: tourChk.checked }),
        },
      });

      bodyWrap.append(
        el(
          'section',
          { className: 'bv-cork-card' },
          el('span', { className: 'bv-panel-title', text: 'Quillvibe First-Visit Walkthroughs' }),
          el('p', {
            className: 'bv-label',
            text: 'Each workspace opens with a short pointer guide on your first visit. You can replay every guide from the beginning or pause hints at any time.',
          }),
          el(
            'div',
            { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px', marginTop: '6px' } },
            el(
              'label',
              { className: 'bv-check-row' },
              tourChk,
              el('span', { text: 'Show animated tour on first entry to each section' }),
            ),
            el(
              'button',
              {
                className: 'bv-btn bv-btn-primary',
                attrs: { type: 'button' },
                on: {
                  click: () => {
                    closeModal();
                    actions.replayWalkthrough();
                  },
                },
              },
              icon('help', 14),
              'Replay Section Walkthrough',
            ),
          ),
        ),
        el(
          'div',
          { className: 'bv-two-col' },
          el(
            'section',
            { className: 'bv-cork-card' },
            el('span', { className: 'bv-panel-title', text: 'Quick Jump Across Studio Views' }),
            el(
              'div',
              { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '8px' } },
              ...[
                { view: 'editor' as const, label: 'Manuscript', ic: 'quill' as const },
                { view: 'corkboard' as const, label: 'Corkboard', ic: 'corkboard' as const },
                { view: 'outline' as const, label: 'Outline', ic: 'outline' as const },
                { view: 'bible' as const, label: 'Story Bible', ic: 'bible' as const },
                { view: 'graph' as const, label: 'Story Graph', ic: 'graph' as const },
                { view: 'typeset' as const, label: 'Typeset & Cover', ic: 'typeset' as const },
              ].map((item) =>
                el(
                  'button',
                  {
                    className: 'bv-btn',
                    style: { justifyContent: 'flex-start' },
                    attrs: { type: 'button' },
                    on: {
                      click: () => {
                        closeModal();
                        actions.setState({ activeView: item.view }, true);
                      },
                    },
                  },
                  icon(item.ic, 14),
                  item.label,
                ),
              ),
            ),
          ),
          el(
            'section',
            { className: 'bv-cork-card' },
            el('span', { className: 'bv-panel-title', text: 'Desktop App & Browser Workspace' }),
            el('p', {
              className: 'bv-label',
              text: 'Quillvibe runs on Windows, macOS, and Linux desktop installers, or directly in your browser at https://quillvibe.jhonrey.com/ without logins. Support email: quillvibe@jhonrey.com. Export protected .qv files locally in browser mode to keep backups on disk.',
            }),
            el(
              'div',
              { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '6px' } },
              el(
                'button',
                {
                  className: 'bv-btn',
                  attrs: { type: 'button' },
                  on: {
                    click: () => {
                      closeModal();
                      actions.openSettingsModal('fonts');
                    },
                  },
                },
                icon('settings', 14),
                'Open Settings & Fonts',
              ),
              el(
                'button',
                {
                  className: 'bv-btn',
                  attrs: { type: 'button' },
                  on: {
                    click: () => {
                      closeModal();
                      actions.openSettingsModal('publishing');
                    },
                  },
                },
                icon('folder', 14),
                'Import .docx / .html / .md',
              ),
            ),
          ),
        ),
      );
      return;
    }

    if (activeTab === 'icons') {
      const locRow = el('div', { style: { display: 'flex', gap: '5px', flexWrap: 'wrap' } });
      const locations: Array<'All' | IconDirectoryEntry['location']> = [
        'All',
        'Topbar',
        'Workspace Switcher',
        'Editor Modes',
        'Editor Tools',
        'Publishing & Sync',
      ];
      const grid = el('div', { className: 'bv-help-icon-grid' });

      const renderLocPills = () => {
        locRow.textContent = '';
        for (const loc of locations) {
          locRow.appendChild(
            el('button', {
              className: `bv-mini-btn${locationFilter === loc ? ' is-active' : ''}`,
              text: loc,
              attrs: { type: 'button' },
              on: {
                click: () => {
                  locationFilter = loc;
                  renderLocPills();
                  renderIconGrid();
                },
              },
            }),
          );
        }
      };

      const renderIconGrid = () => {
        grid.textContent = '';
        const filtered = ICON_DIRECTORY.filter(
          (entry) => locationFilter === 'All' || entry.location === locationFilter,
        );

        for (const entry of filtered) {
          grid.appendChild(
            el(
              'div',
              { className: 'bv-help-icon-card' },
              el('div', { className: 'bv-help-icon-badge' }, icon(entry.icon, 18)),
              el(
                'div',
                { style: { minWidth: '0', flex: '1' } },
                el(
                  'div',
                  { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' } },
                  el('strong', { text: entry.name, style: { fontSize: '12.5px' } }),
                  el('span', { className: 'bv-mono-tag', text: entry.location }),
                ),
                el('p', {
                  className: 'bv-label',
                  text: entry.meaning,
                  style: { margin: '4px 0 0', lineHeight: '1.45' },
                }),
                entry.shortcut
                  ? el('div', {
                    className: 'bv-mono-tag',
                    text: `Shortcut: ${entry.shortcut}`,
                    style: { marginTop: '4px', color: 'var(--accent-amber)' },
                  })
                  : null,
              ),
            ),
          );
        }
      };

      renderLocPills();
      renderIconGrid();
      bodyWrap.append(locRow, grid);
      return;
    }

    if (activeTab === 'guides') {
      const guides = [
        {
          tier: 'Basic Workflow',
          title: 'Notes, Sprint Timer (15m / Start / Reset) & Markdown Builder',
          steps: [
            'Write fast notes or standalone chapters in Manuscript Draft mode on Ivory, Parchment, or Obsidian paper.',
            'Use the bottom-right Sprint Bar to pick 15m, 25m, or 45m, click Start to track countdown and net words (+0w), or click Reset to restore your session clock.',
            'Press Ctrl+B, Ctrl+I, H2, blockquote, or * * * scene-break buttons to write clean Markdown inline.',
            'Choose .md or .qvscene in the top-right Save format dropdown so one click exports plain Markdown or a portable single scene.',
          ],
        },
        {
          tier: 'Intermediate Workflow',
          title: 'Story Bible, Proofread Markup & Live Story Graph',
          steps: [
            'Build structured character, place, and lore cards in Story Bible. Add custom tabs (Magic Systems, Factions), drag portraits onto cards, and add arbitrary key/value traits.',
            'Switch Editor mode to Proofread to apply 15 copyediting marks (delete strikethrough, caret insert, substitute, transpose, stet, inline margin comments). Toggle Clean Preview to read accepted prose without overwriting draft text.',
            'Open Story Graph to map character bonds and plot threads. Drag cards to see connecting lines follow smoothly, drag hover port dots onto target cards to link them, and switch Compact / Standard / Detailed views.',
          ],
        },
        {
          tier: 'Professional Publishing',
          title: 'Protected QVBX Files, Forever Author Keys, Team Roles & Enterprise Releases',
          steps: [
            'Install personal .ttf, .otf, .woff, or .woff2 fonts in Settings > Typefaces, then apply them to the Draft canvas, Interior Typeset spread, and Cover Studio.',
            'Flip switches for Drop Caps, Smart Quotes, Running Headers, and ISBN Barcode Box cleanly in Typeset and Cover Studio.',
            'Each pen name gets one permanent Author & Origin Device Key, paired with a separate Work Copyright Seal (QVC-). Co-authors require a signed device token generated on their own device.',
            'Export protected .qv archives with an optional password, configure Commercial & Enterprise publishing fields in Settings > Publishing & Archive, and import legacy .quillvibe or .bookvibe archives there.',
          ],
        },
        {
          tier: 'Desktop App Features',
          title: 'Features Available in the Standalone Desktop Installer',
          steps: [
            'Immersive Fullscreen Mode (F11) with a movable, collapsible bar and top-edge screen hover menu.',
            'Multi-Window Editing: open two books or chapters side by side in separate OS windows from Book Library.',
            'Offline Same-Wi-Fi LAN Sync and OS Bluetooth / Nearby Share file handoffs without touching any remote cloud server.',
            'Native OS File Associations: double-click .qv, .qvbible, .qvscene, or .qvstyle files in Explorer or Finder to open directly in Quillvibe.',
          ],
        },
      ];

      for (const g of guides) {
        const list = el('ol', { style: { margin: '8px 0 0', paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '6px' } });
        for (const step of g.steps) {
          list.appendChild(el('li', { text: step, style: { color: 'var(--text-secondary)', fontSize: '12.5px', lineHeight: '1.5' } }));
        }
        bodyWrap.appendChild(
          el(
            'section',
            { className: 'bv-cork-card' },
            el('div', { className: 'bv-mono-tag', text: g.tier, style: { color: 'var(--accent-amber)' } }),
            el('strong', { text: g.title, style: { fontSize: '14px' } }),
            list,
          ),
        );
      }
      return;
    }

    if (activeTab === 'course') {
      const progress = getCourseCompletionSummary();
      const done = readCompletedCourseLessons();

      bodyWrap.appendChild(
        el(
          'section',
          { className: 'bv-cork-card', style: { marginBottom: '12px' } },
          el(
            'div',
            { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' } },
            el(
              'div',
              {},
              el('span', { className: 'bv-mono-tag', text: `COURSE PROGRESS: ${progress.completed}/${progress.total} LESSONS (${progress.pct}%)` }),
              el('h3', { text: 'Complete Guide: Writing & Publishing a Book in Quillvibe', style: { margin: '4px 0 2px', fontSize: '15px' } }),
              el('p', { className: 'bv-label', text: 'Follow each module hands-on inside your live workspace. Click Launch Interactive Coach to keep the checklist floating beside you as you practice.', style: { margin: '0' } }),
            ),
            el(
              'div',
              { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
              el(
                'button',
                {
                  className: 'bv-btn bv-btn-primary',
                  attrs: { type: 'button' },
                  on: {
                    click: () => {
                      actions.openCoursePage();
                    },
                  },
                },
                icon('course', 14),
                'Open Full Course Page',
              ),
              el(
                'button',
                {
                  className: 'bv-btn',
                  attrs: { type: 'button' },
                  on: {
                    click: () => {
                      actions.openHelpPage();
                    },
                  },
                },
                icon('help', 14),
                'Open Help & FAQ Page',
              ),
              el(
                'button',
                {
                  className: 'bv-btn',
                  attrs: { type: 'button' },
                  on: {
                    click: () => {
                      closeModal();
                      openInteractiveCourseDrawer(actions, 0);
                    },
                  },
                },
                'Practice Coach Drawer',
              ),
            ),
          ),
        ),
      );

      for (const mod of COURSE_MODULES) {
        const lessonsEl = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '8px' } });
        for (const lesson of mod.lessons) {
          const isDone = done.has(lesson.id);
          lessonsEl.appendChild(
            el(
              'div',
              { className: 'bv-list-card' },
              el(
                'div',
                { style: { flex: '1', minWidth: '0' } },
                el('strong', { text: `${isDone ? '✓ ' : ''}${lesson.title}`, style: { fontSize: '12.5px' } }),
                el('div', { className: 'bv-label', text: lesson.instruction }),
              ),
              el(
                'button',
                {
                  className: 'bv-mini-btn',
                  text: 'Practice',
                  attrs: { type: 'button' },
                  on: {
                    click: () => {
                      closeModal();
                      openInteractiveCourseDrawer(actions, mod.number - 1);
                    },
                  },
                },
              ),
            ),
          );
        }
        bodyWrap.appendChild(
          el(
            'section',
            { className: 'bv-cork-card' },
            el('div', { className: 'bv-mono-tag', text: `MODULE ${mod.number}`, style: { color: 'var(--accent-amber)' } }),
            el('strong', { text: mod.title, style: { fontSize: '14px' } }),
            el('p', { className: 'bv-label', text: mod.summary, style: { margin: '2px 0 4px' } }),
            lessonsEl,
          ),
        );
      }
      return;
    }

    // Reference tab
    const fmtGrid = el('div', { className: 'bv-two-col' });
    for (const item of QUILLVIBE_EXTENSIONS) {
      fmtGrid.appendChild(
        el(
          'div',
          { className: 'bv-list-card', style: { flexDirection: 'column', alignItems: 'flex-start', gap: '4px' } },
          el(
            'div',
            { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' } },
            el('strong', { text: item.extension, style: { fontFamily: 'var(--font-mono)', color: 'var(--accent-ivory)' } }),
            el('span', { className: 'bv-mono-tag', text: item.mimeType }),
          ),
          el('div', { text: item.name, style: { fontWeight: '600', fontSize: '12.5px' } }),
          el('div', { className: 'bv-label', text: item.purpose }),
        ),
      );
    }

    const kbdWrap = el('div', { className: 'bv-snap-list' });
    for (const row of SHORTCUT_LIST) {
      kbdWrap.appendChild(
        el(
          'div',
          { className: 'bv-list-card' },
          el('span', { text: row.action, style: { fontSize: '12.5px' } }),
          el('span', { className: 'bv-kbd-chip', text: row.keys }),
        ),
      );
    }

    bodyWrap.append(
      el('section', { className: 'bv-cork-card' }, el('span', { className: 'bv-panel-title', text: 'Quillvibe File Extensions (Protected QVBX Format)' }), fmtGrid),
      el('section', { className: 'bv-cork-card' }, el('span', { className: 'bv-panel-title', text: 'Keyboard & Canvas Shortcuts' }), kbdWrap),
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
      el('h1', { text: 'Manual', style: { margin: '0', fontSize: '20px', fontWeight: '600' } }),
    ),
    el(
      'div',
      { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' } },
      el(
        'button',
        {
          className: 'bv-btn',
          attrs: { type: 'button' },
          on: { click: () => actions.openCoursePage() },
        },
        icon('course', 14),
        el('span', { text: 'Course' }),
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
          className: 'bv-btn bv-btn-icon',
          tooltip: { title: 'Settings', short: 'Open Settings.' },
          attrs: { type: 'button', 'aria-label': 'Settings' },
          on: { click: () => actions.openSettingsModal('editor') },
        },
        icon('settings', 15),
      ),
      createAppThemeButton(actions),
    ),
  );

  const pageShell = el(
    'div',
    { className: 'qv-manual-page' },
    header,
    el('div', { className: 'qv-manual-toolbar' }, searchBar, tabBar),
    bodyWrap,
  );

  container.appendChild(pageShell);
  renderTabs();
  renderBody();
  restoreScroll();
}
