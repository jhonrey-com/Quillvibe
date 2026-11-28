import type { AppActions } from '../core/app-context';
import {
  closeDesktopWindow,
  isTauriRuntime,
  minimizeDesktopWindow,
  startDesktopWindowDrag,
  toggleMaximizeDesktopWindow,
} from '../core/bridge';
import {
  createEmptyBookProject,
  getActiveBookFromLibrary,
  switchActiveBook,
  upsertBookInLibrary,
} from '../core/library';
import { getProjectWordCount } from '../core/manuscript';
import { syncBrowserPath } from '../core/router';
import { isLocalDevMockEnabled } from '../core/sample-book';
import type { AppThemeId, StudioViewId, ToolTier } from '../core/types';
import { el, icon, quillvibeLogo, svgEl } from './dom';

const SPLASH_SEEN_KEY = 'quillvibe.splashSeen.v2';
const LEGACY_SPLASH_KEY = 'bookvibe.splashSeen.v1';
const TOURS_SEEN_KEY = 'quillvibe.toursSeen.v2';
const PREVIEW_BOOK_ID = 'proj-salt-cartographer';

export type SplashEnvironment = 'desktop-app' | 'desktop-web' | 'mobile-web';

export function detectSplashEnvironment(): SplashEnvironment {
  if (isTauriRuntime()) return 'desktop-app';
  if (typeof window !== 'undefined' && window.innerWidth <= 768) return 'mobile-web';
  return 'desktop-web';
}

interface TourStep {
  selector: string;
  title: string;
  body: string;
}

const SECTION_TOURS: Record<StudioViewId, TourStep[]> = {
  landing: [],
  editor: [
    {
      selector: '.bv-paper-float-nav',
      title: 'Draft, Proofread & Tiers',
      body: 'Start in calm Draft mode, right-click the page for quick formatting or proofread marks, and scale tools anytime in Settings.',
    },
    {
      selector: '.bv-scene-heading',
      title: 'Clean Writing Sheet',
      body: 'Ivory Light sheet is set by default. Rename chapters/scenes inline or drag the vertical <-> borders to resize side panels.',
    },
    {
      selector: '.bv-save-split',
      title: 'Export Local .qv Archive',
      body: 'Export protected .qv archives, Print PDF, EPUB 3, or Markdown anytime with zero accounts.',
    },
  ],
  corkboard: [
    {
      selector: '.bv-main-stage',
      title: 'Visual Corkboard',
      body: 'Drag scene cards to reorder chapters, or right-click any card to jump to drafting or change revision status.',
    },
  ],
  outline: [
    {
      selector: '.bv-main-stage',
      title: 'Outline Ledger',
      body: 'Filter scenes live by title, POV, location, or status.',
    },
  ],
  bible: [
    {
      selector: '.bv-main-stage',
      title: 'Story Bible Codex',
      body: 'Manage characters, places, lore, and custom categories with portraits and custom traits.',
    },
  ],
  graph: [
    {
      selector: '.bv-graph-canvas-wrap',
      title: 'Story Graph Canvas',
      body: 'Drag nodes freely, pull port dots to link scenes, or right-click the canvas for layouts.',
    },
  ],
  typeset: [
    {
      selector: '.bv-main-stage',
      title: 'Interior Typeset & Pro Cover Studio',
      body: 'Design multi-layer covers with shapes, gradients, snap-to-grid, and trade trim layouts.',
    },
  ],
  course: [
    {
      selector: '.bv-main-stage',
      title: 'Quillvibe Academy Course',
      body: 'Work through 23 guided modules, 71 hands-on lessons across Website and Desktop editions, visual studio guides, and live tutorials.',
    },
  ],
  help: [],
  developer: [],
  settings: [],
  manual: [],
  extensions: [],
};

let activeTourOverlay: {
  outline: HTMLElement;
  card: HTMLElement;
  viewId: StudioViewId;
  stepIdx: number;
} | null = null;

function readSeenTours(): Set<StudioViewId> {
  if (typeof window === 'undefined' || !window.localStorage) return new Set();
  try {
    const raw = window.localStorage.getItem(TOURS_SEEN_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? new Set(parsed as StudioViewId[]) : new Set();
  } catch {
    return new Set();
  }
}

function writeSeenTours(set: Set<StudioViewId>): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(TOURS_SEEN_KEY, JSON.stringify(Array.from(set)));
  } catch {
    // Ignore storage limits
  }
}

function markSectionSeen(viewId: StudioViewId): void {
  const seen = readSeenTours();
  seen.add(viewId);
  writeSeenTours(seen);
}

function markAllSectionsSeen(): void {
  writeSeenTours(new Set(['editor', 'corkboard', 'outline', 'bible', 'graph', 'typeset']));
}

export function destroyActiveTour(): void {
  if (!activeTourOverlay) return;
  activeTourOverlay.outline.remove();
  activeTourOverlay.card.remove();
  activeTourOverlay = null;
}

function positionTourStep(): void {
  if (!activeTourOverlay) return;
  const { viewId, stepIdx, outline, card } = activeTourOverlay;
  const steps = SECTION_TOURS[viewId] ?? [];
  const step = steps[stepIdx];
  if (!step) return;

  const target = document.querySelector(step.selector) as HTMLElement | null;
  if (target) {
    const r = target.getBoundingClientRect();
    const pad = 4;
    const x = Math.max(4, Math.round(r.left - pad));
    const y = Math.max(4, Math.round(r.top - pad));
    const w = Math.max(24, Math.min(window.innerWidth - x - 4, Math.round(r.width + pad * 2)));
    const h = Math.max(20, Math.min(window.innerHeight - y - 4, Math.round(r.height + pad * 2)));
    outline.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    outline.style.width = `${w}px`;
    outline.style.height = `${h}px`;
    outline.style.opacity = '1';
  } else {
    outline.style.opacity = '0';
  }

  const titleEl = card.querySelector('.bv-tour-title') as HTMLElement;
  const bodyEl = card.querySelector('.bv-tour-body') as HTMLElement;
  const metaEl = card.querySelector('.bv-tour-step-meta') as HTMLElement;
  const nextBtn = card.querySelector('.bv-tour-next') as HTMLButtonElement;
  if (titleEl) titleEl.textContent = step.title;
  if (bodyEl) bodyEl.textContent = step.body;
  if (metaEl) metaEl.textContent = `${stepIdx + 1} / ${steps.length}`;
  if (nextBtn) nextBtn.textContent = stepIdx + 1 >= steps.length ? 'Done' : 'Next';
}

export function maybeStartSectionTour(
  viewId: StudioViewId,
  actions: AppActions,
  force = false,
): void {
  const state = actions.getState();
  if (!force) {
    if (!state.settings.showOnboardingHints) return;
    if (state.project.id !== PREVIEW_BOOK_ID) return;
  }

  const seen = readSeenTours();
  if (!force && seen.has(viewId)) return;

  const steps = SECTION_TOURS[viewId];
  if (!steps || steps.length === 0) return;

  destroyActiveTour();

  const outline = el('div', { className: 'bv-tour-outline' });

  const skipSectionBtn = el('button', {
    className: 'bv-mini-btn',
    text: 'Skip',
    attrs: { type: 'button' },
    on: {
      click: () => {
        markSectionSeen(viewId);
        destroyActiveTour();
      },
    },
  });

  const skipAllBtn = el('button', {
    className: 'bv-mini-btn',
    text: 'Skip All',
    attrs: { type: 'button' },
    on: {
      click: () => {
        markSectionSeen(viewId);
        actions.updateSettings({ showOnboardingHints: false });
        destroyActiveTour();
      },
    },
  });

  const nextBtn = el('button', {
    className: 'bv-btn bv-btn-primary bv-tour-next',
    text: 'Next',
    attrs: { type: 'button' },
    on: {
      click: () => {
        if (!activeTourOverlay) return;
        const nextIdx = activeTourOverlay.stepIdx + 1;
        if (nextIdx >= steps.length) {
          markSectionSeen(viewId);
          destroyActiveTour();
        } else {
          activeTourOverlay.stepIdx = nextIdx;
          positionTourStep();
        }
      },
    },
  });

  const card = el(
    'aside',
    { className: 'bv-tour-card', attrs: { role: 'status', 'aria-live': 'polite' } },
    el(
      'div',
      { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' } },
      el('strong', { className: 'bv-tour-title', style: { fontSize: '13px' } }),
      el('span', { className: 'bv-mono-tag bv-tour-step-meta', style: { color: 'var(--accent-amber)' } }),
    ),
    el('p', { className: 'bv-label bv-tour-body', style: { margin: '2px 0 8px' } }),
    el(
      'div',
      { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' } },
      el('div', { style: { display: 'flex', gap: '6px' } }, skipAllBtn, skipSectionBtn),
      nextBtn,
    ),
  );

  activeTourOverlay = { outline, card, viewId, stepIdx: 0 };
  document.body.append(outline, card);
  requestAnimationFrame(() => positionTourStep());
}

export function replayFullWalkthrough(actions: AppActions): void {
  writeSeenTours(new Set());
  actions.updateSettings({ showOnboardingHints: true });
  maybeStartSectionTour(actions.getState().activeView, actions, true);
}

export function maybeRunFirstLaunchSplash(actions: AppActions, forceShow = false): void {
  const alreadyShown =
    !forceShow &&
    typeof window !== 'undefined' &&
    window.localStorage &&
    (window.localStorage.getItem(SPLASH_SEEN_KEY) === '1' ||
      window.localStorage.getItem(LEGACY_SPLASH_KEY) === '1');

  const activeBookId = actions.getState().project.id;
  const isPreview = isLocalDevMockEnabled() && activeBookId === PREVIEW_BOOK_ID;

  if (alreadyShown) {
    requestAnimationFrame(() => maybeStartSectionTour(actions.getState().activeView, actions));
    return;
  }

  const env = detectSplashEnvironment();
  let chosenTier: ToolTier = actions.getState().settings.toolTier;
  let chosenTheme: AppThemeId = actions.getState().settings.appTheme;
  let finished = false;
  const reducedAtOpen =
    actions.getState().settings.reducedMotionOverride === 'reduce' ||
    (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

  const focusActiveProseSurface = () => {
    requestAnimationFrame(() => {
      const prose = document.querySelector('.bv-prose-rich, .bv-prose-textarea') as HTMLElement | null;
      prose?.focus();
    });
  };

  const finishWithMode = (
    mode: 'course' | 'help' | 'blank' | 'preview' | 'open' | 'import-doc' | 'book' | 'skip',
    bookId?: string,
  ) => {
    if (finished) return;
    finished = true;
    try {
      window.localStorage.setItem(SPLASH_SEEN_KEY, '1');
    } catch {
      // Ignore storage error
    }

    actions.updateSettings({ toolTier: chosenTier, appTheme: chosenTheme });
    if (mode !== 'course' && mode !== 'help') {
      syncBrowserPath('/write', true);
    }

    const reduced =
      actions.getState().settings.reducedMotionOverride === 'reduce' ||
      (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

    const applyChoice = () => {
      splash.remove();
      if (mode === 'blank') {
        markAllSectionsSeen();
        const fresh = createEmptyBookProject('Untitled Book', 'Author');
        const lib = upsertBookInLibrary(actions.getState().library, fresh);
        actions.replaceLibrary(lib);
        focusActiveProseSurface();
      } else if (mode === 'book' && bookId) {
        markSectionSeen(actions.getState().activeView);
        const switched = switchActiveBook(actions.getState().library, bookId);
        actions.replaceLibrary(switched);
        actions.notify(`Opened “${getActiveBookFromLibrary(switched).title}”`);
      } else if (mode === 'open') {
        markSectionSeen(actions.getState().activeView);
        actions.setState({}, true);
        void actions.openAnyQuillvibeFile();
      } else if (mode === 'import-doc') {
        markSectionSeen(actions.getState().activeView);
        actions.setState({}, true);
        void actions.importExternalDocument();
      } else if (mode === 'course') {
        markAllSectionsSeen();
        actions.openCoursePage();
      } else if (mode === 'help') {
        markAllSectionsSeen();
        actions.openHelpPage();
      } else if (mode === 'preview') {
        actions.setState({}, true);
        maybeStartSectionTour(actions.getState().activeView, actions, true);
      } else {
        actions.setState({}, true);
        markSectionSeen(actions.getState().activeView);
        focusActiveProseSurface();
      }
    };

    if (reduced) {
      applyChoice();
      return;
    }

    const emblem = splash.querySelector('.bv-splash-emblem') as HTMLElement | null;
    const targetMark = document.querySelector('.bv-logo-mark') as HTMLElement | null;
    if (emblem && targetMark) {
      const from = emblem.getBoundingClientRect();
      const to = targetMark.getBoundingClientRect();
      const dx = to.left + to.width / 2 - (from.left + from.width / 2);
      const dy = to.top + to.height / 2 - (from.top + from.height / 2);
      const scale = Math.max(0.28, to.width / Math.max(1, from.width));
      emblem.style.transform = `translate3d(${dx}px, ${dy}px, 0) scale(${scale})`;
    }
    splash.classList.add('is-morphing-out');
    window.setTimeout(applyChoice, 240);
  };

  const themeToggleRow = el(
    'div',
    { className: 'qv-splash-theme-row' },
    ...(['system', 'ivory', 'parchment', 'obsidian'] as AppThemeId[]).map((th) => {
      const btn = el('button', {
        className: `bv-mini-btn${chosenTheme === th ? ' is-active' : ''}`,
        text:
          th === 'system'
            ? 'Match Device'
            : th === 'ivory'
              ? 'Ivory Light'
              : th === 'parchment'
                ? 'Parchment'
                : 'Obsidian Dark',
        attrs: { type: 'button' },
        on: {
          click: () => {
            chosenTheme = th;
            actions.updateSettings({ appTheme: th });
            Array.from(themeToggleRow.children).forEach((c, idx) => {
              c.classList.toggle(
                'is-active',
                idx === (['system', 'ivory', 'parchment', 'obsidian'] as AppThemeId[]).indexOf(th),
              );
            });
          },
        },
      });
      return btn;
    }),
  );

  const tierRow = el('div', { className: 'qv-tier-card-grid' });
  const tierCards: Array<{ id: ToolTier; title: string; desc: string }> = [
    { id: 'basic', title: 'Focused', desc: 'Single drafting sheet with binder and core formatting.' },
    { id: 'intermediate', title: 'Editorial', desc: 'Corkboard, Outline, Proofread, Typeset.' },
    { id: 'advanced', title: 'Full Studio', desc: 'Story Bible, Graph, Cover Studio, Permissions.' },
  ];
  const renderTierButtons = () => {
    tierRow.replaceChildren();
    for (const tc of tierCards) {
      tierRow.appendChild(
        el(
          'button',
          {
            className: `qv-tier-card${chosenTier === tc.id ? ' is-active' : ''}`,
            attrs: { type: 'button' },
            on: {
              click: () => {
                chosenTier = tc.id;
                renderTierButtons();
              },
            },
          },
          el('strong', { text: tc.title, style: { fontSize: '12.5px' } }),
          el('span', { className: 'bv-label', text: tc.desc }),
        ),
      );
    }
  };
  renderTierButtons();

  const recentBooks = actions.getState().library.books.slice(0, 4);
  const recentListEl = el(
    'div',
    { className: 'qv-welcome-recent-list' },
    ...recentBooks.map((book) =>
      el(
        'button',
        {
          className: 'qv-welcome-recent-item',
          attrs: { type: 'button' },
          on: { click: () => finishWithMode('book', book.id) },
        },
        el(
          'div',
          { style: { minWidth: '0', display: 'flex', flexDirection: 'column', gap: '1px' } },
          el('span', {
            text: book.title || 'Untitled Book',
            style: { fontSize: '13px', fontWeight: '600', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
          }),
          el('span', {
            className: 'bv-label',
            text: book.author || 'Author',
            style: { fontSize: '11px' },
          }),
        ),
        el('span', {
          className: 'qv-welcome-link-sub',
          text: `${getProjectWordCount(book).toLocaleString()}w`,
        }),
      ),
    ),
  );

  const startActionsEl = el(
    'div',
    { className: 'qv-welcome-action-list' },
    el(
      'button',
      {
        className: 'qv-welcome-link',
        attrs: { type: 'button' },
        on: { click: () => finishWithMode('blank') },
      },
      icon('file', 15),
      el('span', { text: 'New Blank Book…' }),
      el('span', { className: 'qv-welcome-link-sub', text: 'Fresh manuscript' }),
    ),
    el(
      'button',
      {
        className: 'qv-welcome-link',
        attrs: { type: 'button' },
        on: { click: () => finishWithMode('open') },
      },
      icon('folder', 15),
      el('span', { text: 'Open Quillvibe File…' }),
      el('span', { className: 'qv-welcome-link-sub', text: '.qv / .qv*' }),
    ),
    el(
      'button',
      {
        className: 'qv-welcome-link',
        attrs: { type: 'button' },
        on: { click: () => finishWithMode('import-doc') },
      },
      icon('download', 15),
      el('span', { text: 'Import Manuscript (.docx / .md)…' }),
      el('span', { className: 'qv-welcome-link-sub', text: '.docx / .md / .html' }),
    ),
    el(
      'button',
      {
        className: 'qv-welcome-link',
        attrs: { type: 'button' },
        on: { click: () => finishWithMode(isPreview ? 'preview' : 'skip') },
      },
      icon('quill', 15),
      el('span', {
        text: isPreview ? 'Explore Sample Book' : 'Start Writing Now',
      }),
      el('span', {
        className: 'qv-welcome-link-sub',
        text: isPreview ? 'Guided sample' : 'Open clean draft page',
      }),
    ),
  );

  const courseCardBtn = el(
    'button',
    {
      className: 'qv-welcome-course-card',
      attrs: { type: 'button' },
      on: { click: () => finishWithMode('course') },
    },
    el('span', { style: { color: 'var(--accent-ivory)', flexShrink: '0', marginTop: '2px' } }, icon('course', 18)),
    el(
      'div',
      { style: { display: 'flex', flexDirection: 'column', gap: '3px', minWidth: '0' } },
      el('strong', { text: 'Take Complete Book Course (/course)', style: { fontSize: '14px' } }),
      el('span', {
        className: 'bv-label',
        text: 'Step-by-step lessons for Manuscript drafting, Story Bible, Cover Studio & Publishing.',
      }),
    ),
  );

  const helpCardBtn = el(
    'button',
    {
      className: 'qv-welcome-course-card',
      attrs: { type: 'button' },
      on: { click: () => finishWithMode('help') },
    },
    el('span', { style: { color: 'var(--accent-amber)', flexShrink: '0', marginTop: '2px' } }, icon('help', 18)),
    el(
      'div',
      { style: { display: 'flex', flexDirection: 'column', gap: '3px', minWidth: '0' } },
      el('strong', { text: 'Open Help Center & FAQ (/help)', style: { fontSize: '14px' } }),
      el('span', {
        className: 'bv-label',
        text: 'Quick workspace setup answers, file formats, shortcuts, and offline backup guides.',
      }),
    ),
  );

  const subtitle = 'Offline book writing, worldbuilding, and print/EPUB studio.';

  const desktopTitlebar = isTauriRuntime()
    ? el(
        'div',
        {
          className: 'qv-splash-win-bar',
          on: {
            mousedown: (e) => {
              if ((e.target as HTMLElement).closest('button')) return;
              void startDesktopWindowDrag();
            },
            dblclick: (e) => {
              if ((e.target as HTMLElement).closest('button')) return;
              void toggleMaximizeDesktopWindow();
            },
          },
        },
        el(
          'div',
          { className: 'qv-splash-win-meta' },
          quillvibeLogo(14),
          el('span', { text: 'Quillvibe' }),
        ),
        el(
          'div',
          { className: 'bv-win-controls' },
          el(
            'button',
            {
              className: 'bv-win-btn',
              attrs: { type: 'button', 'aria-label': 'Minimize window' },
              on: { click: () => void minimizeDesktopWindow() },
            },
            (() => {
              const s = svgEl('svg', { width: 12, height: 12, viewBox: '0 0 12 12', fill: 'none' });
              s.appendChild(svgEl('line', { x1: 2, y1: 6.5, x2: 10, y2: 6.5, stroke: 'currentColor', 'stroke-width': 1.4 }));
              return s;
            })(),
          ),
          el(
            'button',
            {
              className: 'bv-win-btn',
              attrs: { type: 'button', 'aria-label': 'Maximize or restore window' },
              on: { click: () => void toggleMaximizeDesktopWindow() },
            },
            (() => {
              const s = svgEl('svg', { width: 12, height: 12, viewBox: '0 0 12 12', fill: 'none' });
              s.appendChild(svgEl('rect', { x: 2.25, y: 2.25, width: 7.5, height: 7.5, rx: 1, stroke: 'currentColor', 'stroke-width': 1.3 }));
              return s;
            })(),
          ),
          el(
            'button',
            {
              className: 'bv-win-btn bv-win-btn-close',
              attrs: { type: 'button', 'aria-label': 'Close window' },
              on: { click: () => void closeDesktopWindow() },
            },
            (() => {
              const s = svgEl('svg', { width: 12, height: 12, viewBox: '0 0 12 12', fill: 'none' });
              s.appendChild(
                svgEl('path', { d: 'M2.5 2.5L9.5 9.5M9.5 2.5L2.5 9.5', stroke: 'currentColor', 'stroke-width': 1.4, 'stroke-linecap': 'round' }),
              );
              return s;
            })(),
          ),
        ),
      )
    : null;

  const frame = el(
    'div',
    { className: 'qv-welcome-frame' },
    ...(desktopTitlebar ? [desktopTitlebar] : []),
    el(
      'div',
      { className: 'qv-welcome-head' },
      el(
        'div',
        { className: 'qv-welcome-brand' },
        el('div', { className: 'bv-splash-emblem' }, quillvibeLogo(env === 'mobile-web' ? 42 : 48)),
        el(
          'div',
          {},
          el('h1', { className: 'qv-welcome-title', text: 'Quillvibe' }),
          el('p', { className: 'qv-welcome-subtitle', text: subtitle }),
        ),
      ),
      themeToggleRow,
    ),
    el(
      'div',
      { className: 'qv-welcome-columns' },
      el(
        'div',
        { className: 'qv-welcome-col' },
        el('div', {}, el('h2', { className: 'qv-welcome-section-title', text: 'Start' }), startActionsEl),
        el('div', {}, el('h2', { className: 'qv-welcome-section-title', text: 'Recent Books' }), recentListEl),
      ),
      el(
        'div',
        { className: 'qv-welcome-col' },
        el('div', {}, el('h2', { className: 'qv-welcome-section-title', text: 'Walkthroughs & Guidance' }), courseCardBtn, helpCardBtn),
        ...(env !== 'mobile-web'
          ? [
              el(
                'div',
                {},
                el('h2', { className: 'qv-welcome-section-title', text: 'Workspace Layout' }),
                tierRow,
              ),
            ]
          : []),
      ),
    ),
    el(
      'div',
      { className: 'qv-welcome-foot' },
      el('span', {
        className: 'bv-label',
        text: 'Start with a clean book, learn as you go, or open /course and /help anytime.',
      }),
      el(
        'div',
        { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
        el('button', {
          className: 'bv-btn',
          text: 'Open Editor',
          attrs: { type: 'button' },
          on: { click: () => finishWithMode('skip') },
        }),
        el('button', {
          className: 'bv-btn bv-btn-primary',
          text: isPreview ? 'Open Sample Book' : 'Start Clean Book',
          attrs: { type: 'button' },
          on: { click: () => finishWithMode(isPreview ? 'preview' : 'blank') },
        }),
      ),
    ),
  );

  const splash = el(
    'div',
    { className: `bv-splash-overlay qv-splash-${env}`, id: 'bv-splash-overlay' },
    frame,
  );

  if (!reducedAtOpen && !forceShow) {
    frame.classList.add('is-waiting-logo-intro');
    const logoIntro = el(
      'div',
      {
        className: 'qv-splash-intro-stage',
        attrs: { role: 'status', 'aria-label': 'Quillvibe Studio launching' },
      },
      el('div', { className: 'qv-splash-intro-emblem' }, quillvibeLogo(env === 'mobile-web' ? 62 : 76)),
      el('div', { className: 'qv-splash-intro-wordmark', text: 'Quillvibe' }),
      el('div', { className: 'qv-splash-intro-sub', text: 'Local-first book studio' }),
    );
    splash.appendChild(logoIntro);

    let revealed = false;
    const revealStartPage = () => {
      if (revealed) return;
      revealed = true;
      logoIntro.classList.add('is-fading-out');
      frame.classList.remove('is-waiting-logo-intro');
      frame.classList.add('is-entering');
      window.setTimeout(() => logoIntro.remove(), 260);
    };

    logoIntro.addEventListener('click', revealStartPage);
    window.setTimeout(revealStartPage, 950);
  }

  document.body.appendChild(splash);
}
