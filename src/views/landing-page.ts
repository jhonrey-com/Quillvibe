import type { AppActions, AppState } from '../core/app-context';
import { APP_VERSION } from '../core/version';
import { COURSE_MODULES, getCourseCompletionSummary } from '../ui/course';
import { clearNode, el, icon, quillvibeLogo } from '../ui/dom';
import { createAppThemeButton } from '../ui/theme-button';
import { openUniversalSearch } from '../ui/universal-search';

type PreviewTabId = 'editor' | 'split' | 'graph' | 'cover' | 'academy';

const PREVIEW_ITEMS: Record<
  PreviewTabId,
  { label: string; src: string; alt: string; caption: string }
> = {
  editor: {
    label: 'Manuscript',
    src: '/screenshots/editor-workspace.png',
    alt: 'Quillvibe Manuscript workspace showing Binder, writing sheet, Proofread controls, and Scene Inspector',
    caption: 'Binder tree, distraction-free writing sheet, inline proofreading marks, and Scene Inspector.',
  },
  split: {
    label: 'Split Diff',
    src: '/screenshots/editor-split-diff.png',
    alt: 'Quillvibe Split Reference drawer comparing a second scene beside active prose',
    caption: 'Resizable Split Reference drawer and Revision Diff panel inside Manuscript Draft Mode.',
  },
  graph: {
    label: 'Story Graph',
    src: '/screenshots/story-graph.png',
    alt: 'Quillvibe Story Graph with linked narrative cards and orthogonal wire routing',
    caption: 'Dual-mode orthogonal Storyboard and Force Graph synced live with Story Bible entries.',
  },
  cover: {
    label: 'Cover Studio',
    src: '/screenshots/cover-studio.png',
    alt: 'Quillvibe Book Cover Studio with vector shapes, layers, and spine inspector',
    caption: 'Front, spine, back, and flap artboard with alignment guides, Vector SVG, and Print PDF.',
  },
  academy: {
    label: 'Academy',
    src: '/screenshots/course-academy.png',
    alt: 'Quillvibe Academy full-page two-pane book writing course workspace',
    caption: 'Structured book writing modules with interactive diagrams and guided lesson checkpoints.',
  },
};

const INSTALL_CMD_WIN = 'irm https://raw.githubusercontent.com/jhonrey-com/Quillvibe/main/scripts/install.ps1 | iex';
const INSTALL_CMD_UNIX = 'curl -fsSL https://raw.githubusercontent.com/jhonrey-com/Quillvibe/main/scripts/install.sh | sh';

let activePreviewTab: PreviewTabId = 'editor';

function prefersReducedMotion(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * Quintic ease-out smooth anchor scroll that cancels immediately if the user
 * grabs the scrollbar, turns the mouse wheel, or touches the screen.
 */
function smoothScrollToTarget(scroller: HTMLElement, target: HTMLElement, headerHeight = 64): void {
  const scrollerRect = scroller.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  const destination = Math.max(
    0,
    scroller.scrollTop + (targetRect.top - scrollerRect.top) - headerHeight,
  );

  if (prefersReducedMotion()) {
    scroller.scrollTop = destination;
    return;
  }

  const start = scroller.scrollTop;
  const delta = destination - start;
  if (Math.abs(delta) < 2) {
    scroller.scrollTop = destination;
    return;
  }

  const duration = Math.min(540, Math.max(300, Math.abs(delta) * 0.28));
  let startTime = 0;
  let rafId = 0;
  let cancelled = false;

  const cancel = () => {
    cancelled = true;
    if (rafId) cancelAnimationFrame(rafId);
    scroller.removeEventListener('wheel', cancel);
    scroller.removeEventListener('touchstart', cancel);
    scroller.removeEventListener('pointerdown', cancel);
  };

  scroller.addEventListener('wheel', cancel, { passive: true, once: true });
  scroller.addEventListener('touchstart', cancel, { passive: true, once: true });
  scroller.addEventListener('pointerdown', cancel, { passive: true, once: true });

  const step = (now: number) => {
    if (cancelled) return;
    if (!startTime) startTime = now;
    const elapsed = Math.min(1, (now - startTime) / duration);
    const eased = 1 - Math.pow(1 - elapsed, 5);
    scroller.scrollTop = start + delta * eased;
    if (elapsed < 1) {
      rafId = requestAnimationFrame(step);
    } else {
      cancel();
    }
  };

  rafId = requestAnimationFrame(step);
}

/**
 * Editorial open-source landing page for Quillvibe on the web runtime.
 */
export function renderLandingPageView(
  container: HTMLElement,
  actions: AppActions,
  getState: () => AppState,
): void {
  clearNode(container);

  const courseSummary = getCourseCompletionSummary();
  const totalLessons = courseSummary.total;
  const totalModules = COURSE_MODULES.length;

  const openStudio = () => {
    actions.setState({ activeView: 'editor' }, true);
  };

  const page = el('div', { className: 'qv-landing-page' });
  const scrollToSection = (sectionId: string) => {
    const target = document.getElementById(sectionId);
    if (target) smoothScrollToTarget(page, target, 68);
  };

  const themeBtn = createAppThemeButton(actions, 16);

  const searchBtn = el(
    'button',
    {
      className: 'bv-btn qv-landing-search-btn',
      attrs: { type: 'button', 'aria-label': 'Universal Search (Ctrl+K)' },
      on: { click: () => openUniversalSearch(actions, getState) },
    },
    icon('search', 14),
    el('span', { className: 'qv-landing-search-text', text: 'Search' }),
    el('kbd', { className: 'qv-landing-kbd', text: 'Ctrl+K' }),
  );

  const scrollProgressLine = el('div', { className: 'qv-landing-scroll-progress' });

  const header = el(
    'header',
    { className: 'qv-landing-header' },
    el(
      'div',
      { className: 'qv-landing-container qv-landing-header-inner' },
      el(
        'a',
        {
          className: 'qv-landing-brand',
          attrs: { href: '/' },
          on: {
            click: (e) => {
              e.preventDefault();
              scrollToSection('qv-landing-top');
            },
          },
        },
        quillvibeLogo(22),
        el('span', { className: 'qv-landing-brand-name', text: 'Quillvibe' }),
      ),
      el(
        'nav',
        { className: 'qv-landing-nav', attrs: { 'aria-label': 'Primary Navigation' } },
        el('button', {
          className: 'qv-landing-nav-link',
          text: 'Studio',
          attrs: { type: 'button' },
          on: { click: () => scrollToSection('qv-landing-studio') },
        }),
        el('button', {
          className: 'qv-landing-nav-link',
          text: 'Formats',
          attrs: { type: 'button' },
          on: { click: () => scrollToSection('qv-landing-formats') },
        }),
        el('button', {
          className: 'qv-landing-nav-link',
          text: 'Download',
          attrs: { type: 'button' },
          on: { click: () => scrollToSection('qv-landing-download') },
        }),
        el('button', {
          className: 'qv-landing-nav-link',
          text: 'Course',
          attrs: { type: 'button' },
          on: { click: () => actions.setState({ activeView: 'course' }, true) },
        }),
        el('button', {
          className: 'qv-landing-nav-link',
          text: 'Help',
          attrs: { type: 'button' },
          on: { click: () => actions.setState({ activeView: 'help' }, true) },
        }),
      ),
      el(
        'div',
        { className: 'qv-landing-header-actions' },
        searchBtn,
        themeBtn,
        el(
          'button',
          {
            className: 'bv-btn bv-btn-primary qv-landing-open-cta',
            attrs: { type: 'button' },
            on: { click: openStudio },
          },
          'Open Studio',
        ),
      ),
    ),
    scrollProgressLine,
  );

  // Interactive Product Stage
  const previewImg = el('img', {
    className: 'qv-landing-preview-img',
    attrs: {
      src: PREVIEW_ITEMS[activePreviewTab].src,
      alt: PREVIEW_ITEMS[activePreviewTab].alt,
      width: '1280',
      height: '720',
    },
  });
  const previewCaption = el('span', {
    className: 'qv-landing-preview-caption',
    text: PREVIEW_ITEMS[activePreviewTab].caption,
  });

  const previewOrder: PreviewTabId[] = ['editor', 'split', 'graph', 'cover', 'academy'];
  let swapTimer: number | null = null;
  const showcaseButtons: HTMLButtonElement[] = previewOrder.map((tabKey) => {
    const item = PREVIEW_ITEMS[tabKey];
    const btn = el('button', {
      className: `qv-landing-tab-btn${activePreviewTab === tabKey ? ' is-active' : ''}`,
      text: item.label,
      attrs: {
        type: 'button',
        role: 'tab',
        'data-label': item.label,
        'aria-selected': String(activePreviewTab === tabKey),
      },
      on: {
        click: () => {
          if (activePreviewTab === tabKey) return;
          activePreviewTab = tabKey;
          for (let i = 0; i < showcaseButtons.length; i++) {
            const b = showcaseButtons[i];
            const k = previewOrder[i];
            const active = k === tabKey;
            b.classList.toggle('is-active', active);
            b.setAttribute('aria-selected', String(active));
          }
          previewCaption.textContent = item.caption;
          if (prefersReducedMotion()) {
            previewImg.src = item.src;
            previewImg.alt = item.alt;
            return;
          }
          if (swapTimer !== null) window.clearTimeout(swapTimer);
          previewImg.classList.add('is-swapping');
          swapTimer = window.setTimeout(() => {
            previewImg.src = item.src;
            previewImg.alt = item.alt;
            previewImg.classList.remove('is-swapping');
            swapTimer = null;
          }, 110);
        },
      },
    });
    return btn;
  });

  const showcaseEl = el(
    'figure',
    { className: 'qv-landing-showcase' },
    el(
      'div',
      { className: 'qv-landing-showcase-bar', attrs: { role: 'tablist', 'aria-label': 'Workspace Previews' } },
      el('div', { className: 'qv-landing-tab-group' }, ...showcaseButtons),
      previewCaption,
    ),
    el('div', { className: 'qv-landing-showcase-frame' }, previewImg),
  );

  const heroSection = el(
    'section',
    { className: 'qv-landing-hero', id: 'qv-landing-top' },
    el(
      'div',
      { className: 'qv-landing-container' },
      el(
        'div',
        { className: 'qv-landing-hero-copy' },
        el('h1', {
          className: 'qv-landing-hero-title',
          text: 'A writing studio built for complete books.',
        }),
        el('p', {
          className: 'qv-landing-hero-lead',
          text: 'Draft chapters, structure story bibles, mark proofs with copyediting symbols, compile trade interiors, and design print covers inside one local .qv file with zero accounts.',
        }),
        el(
          'div',
          { className: 'qv-landing-hero-cta' },
          el(
            'button',
            {
              className: 'bv-btn bv-btn-primary qv-landing-cta-lg',
              attrs: { type: 'button' },
              on: { click: openStudio },
            },
            'Start Writing in Browser',
          ),
          el(
            'button',
            {
              className: 'bv-btn qv-landing-cta-lg',
              attrs: { type: 'button' },
              on: { click: () => scrollToSection('qv-landing-download') },
            },
            `Download Desktop (v${APP_VERSION})`,
          ),
        ),
      ),
      showcaseEl,
    ),
  );

  // Split Sticky Editorial Capabilities Section (replaces generic 3-card grids)
  const capabilityRows: Array<[string, string, string]> = [
    [
      'Three Workspace Layouts',
      'Focused, Editorial & Full Studio',
      'Switch workspaces anytime from the bottom bar. Focused shows only the binder and paper sheet; Editorial opens Corkboard, Outline Ledger, Proofread, and Typeset; Full Studio unlocks Story Bible, Story Graph, and Cover Studio without hiding or deleting work.',
    ],
    [
      'Editorial Copyediting',
      '15 Proofreading Marks & Split Diff',
      'Highlight any passage in Proofread mode and right-click to place carets, deletions, transpositions, or queries. Inspect changes in Clean Preview, compare snapshots side by side in Split Diff, and lock completed chapters against accidental edits.',
    ],
    [
      'Worldbuilding & Plotting',
      'Story Bible & Dual-Mode Graph',
      'Tag characters, locations, and lore inline via [[wikilinks]] and #tags. Review relationships on an orthogonal 90-degree Storyboard or live Force Graph synced directly with active scenes.',
    ],
    [
      'Print & Cover Output',
      'Interior Trim Typeset & Cover Studio',
      'Preview US/UK trade trim dimensions (5x8, 5.5x8.5, 6x9, 8.5x11) with custom .ttf/.otf typography and drop caps. Build front, spine, back, and dust-jacket wraps with alignment guides, Vector SVG, EPUB 3, and Print PDF export.',
    ],
  ];

  const studioSection = el(
    'section',
    { className: 'qv-landing-section qv-landing-bordered', id: 'qv-landing-studio' },
    el(
      'div',
      { className: 'qv-landing-container qv-landing-split-layout' },
      el(
        'div',
        { className: 'qv-landing-split-sticky' },
        el('h2', { text: 'One workspace from first outline to finished book.' }),
        el('p', {
          text: 'Every tool operates offline on local files. Write with spellcheck off by default, insert wrapped illustrations cleanly, and switch tabs or desktop windows without leaving the application.',
        }),
        el(
          'button',
          {
            className: 'bv-btn qv-landing-inline-action',
            attrs: { type: 'button' },
            on: { click: () => actions.setState({ activeView: 'course' }, true) },
          },
          `Explore Academy (${totalModules} Modules)`,
        ),
      ),
      el(
        'div',
        { className: 'qv-landing-spec-list' },
        ...capabilityRows.map(([scope, title, body]) =>
          el(
            'div',
            { className: 'qv-landing-spec-row' },
            el('div', { className: 'qv-landing-spec-key', text: scope }),
            el(
              'div',
              { className: 'qv-landing-spec-val' },
              el('h3', { text: title }),
              el('p', { text: body }),
            ),
          ),
        ),
      ),
    ),
  );

  // Clean 1px-Ruled File Format Table
  const formats: Array<[string, string, string]> = [
    ['.qv', 'Complete Book Archive', 'Chapters, scenes, Story Bible, Story Graph, cover wrap, proofreading marks, snapshots, Author Key, and Copyright Seal.'],
    ['.qvbible', 'Story Bible Archive', 'Portable Characters, Locations, Lore, and custom categories merged cleanly across series books.'],
    ['.qvscene', 'Single Scene Package', 'Standalone scene draft bundled with revision history and copyediting markup.'],
    ['.qvstyle', 'Typeset Preset', 'Trim size, font stack, drop caps, indentation, smart punctuation, and paper theme configuration.'],
    ['.qvdesign', 'Cover Design Package', 'Front, spine, back, and dust-jacket layers, blend modes, and review pins without manuscript text.'],
  ];

  const formatsSection = el(
    'section',
    { className: 'qv-landing-section qv-landing-bordered', id: 'qv-landing-formats' },
    el(
      'div',
      { className: 'qv-landing-container' },
      el(
        'div',
        { className: 'qv-landing-section-head' },
        el('h2', { text: 'Local file formats with open exports' }),
        el('p', {
          text: 'Native Quillvibe packages support optional password encryption alongside standard .pdf, .epub, .docx, .md, .rtf, and Vector SVG exports.',
        }),
      ),
      el(
        'div',
        { className: 'qv-landing-ledger', attrs: { role: 'table', 'aria-label': 'Quillvibe file formats' } },
        ...formats.map(([ext, name, desc]) =>
          el(
            'div',
            { className: 'qv-landing-ledger-row', attrs: { role: 'row' } },
            el('code', { className: 'qv-landing-ledger-ext', text: ext, attrs: { role: 'cell' } }),
            el('strong', { className: 'qv-landing-ledger-name', text: name, attrs: { role: 'cell' } }),
            el('p', { className: 'qv-landing-ledger-desc', text: desc, attrs: { role: 'cell' } }),
          ),
        ),
      ),
    ),
  );

  // Platforms & Desktop Download
  const copyCmd = (cmd: string, label: string) => {
    void navigator.clipboard?.writeText(cmd).then(
      () => actions.notify(`Copied ${label} install command.`),
      () => actions.notify('Select and copy the command manually.'),
    );
  };

  const downloadSection = el(
    'section',
    { className: 'qv-landing-section qv-landing-bordered', id: 'qv-landing-download' },
    el(
      'div',
      { className: 'qv-landing-container' },
      el(
        'div',
        { className: 'qv-landing-section-head' },
        el('h2', { text: 'Run in your browser or install on desktop' }),
        el('p', {
          text: 'Install Quillvibe as an offline Web App on ChromeOS, iPadOS, and Android, or download native installers for Windows, macOS Universal, and Linux x64/ARM64.',
        }),
      ),
      el(
        'div',
        { className: 'qv-landing-grid-2' },
        el(
          'article',
          { className: 'qv-landing-card' },
          el('h3', { text: 'Browser & Chromebook App' }),
          el('p', {
            text: 'Run offline in Chrome, Edge, Firefox, or Safari on desktop, ChromeOS, iPadOS, and Android. Click Save to write a local .qv backup directly to your disk.',
          }),
          el(
            'div',
            { className: 'qv-landing-card-actions' },
            el('button', {
              className: 'bv-btn bv-btn-primary',
              text: 'Open Web Studio',
              attrs: { type: 'button' },
              on: { click: openStudio },
            }),
            el('button', {
              className: 'bv-btn',
              text: 'Help & FAQ',
              attrs: { type: 'button' },
              on: { click: () => actions.setState({ activeView: 'help' }, true) },
            }),
          ),
        ),
        el(
          'article',
          { className: 'qv-landing-card' },
          el('h3', { text: `Desktop Edition v${APP_VERSION}` }),
          el('p', {
            text: 'Native Tauri builds for Windows, macOS, and Linux with direct filesystem auto-save, multi-window book tabs, F11 immersive HUD, and Pro Vector Cover tools.',
          }),
          el(
            'div',
            { className: 'qv-landing-cmd-box' },
            el('div', { className: 'qv-landing-cmd-row' },
              el('code', { text: INSTALL_CMD_WIN }),
              el('button', {
                className: 'bv-mini-btn',
                text: 'Copy PS',
                attrs: { type: 'button' },
                on: { click: () => copyCmd(INSTALL_CMD_WIN, 'PowerShell') },
              }),
            ),
            el('div', { className: 'qv-landing-cmd-row' },
              el('code', { text: INSTALL_CMD_UNIX }),
              el('button', {
                className: 'bv-mini-btn',
                text: 'Copy sh',
                attrs: { type: 'button' },
                on: { click: () => copyCmd(INSTALL_CMD_UNIX, 'macOS / Linux') },
              }),
            ),
          ),
          el(
            'div',
            { className: 'qv-landing-card-actions' },
            el('a', {
              className: 'bv-btn bv-btn-primary',
              text: 'GitHub Releases',
              attrs: {
                href: 'https://github.com/jhonrey-com/Quillvibe/releases/latest',
                target: '_blank',
                rel: 'noopener noreferrer',
              },
            }),
            el('button', {
              className: 'bv-btn',
              text: 'Developer (.qvext)',
              attrs: { type: 'button' },
              on: { click: () => actions.setState({ activeView: 'developer' }, true) },
            }),
          ),
        ),
      ),
    ),
  );

  // Open Source & Academy Band
  const communitySection = el(
    'section',
    { className: 'qv-landing-section qv-landing-bordered', id: 'qv-landing-academy' },
    el(
      'div',
      { className: 'qv-landing-container qv-landing-sponsor-band' },
      el(
        'div',
        { className: 'qv-landing-sponsor-copy' },
        el('h2', { text: `MIT open source with ${totalModules} built-in writing modules` }),
        el('p', {
          text: `Follow all ${totalLessons} interactive lessons inside Quillvibe Academy or support ongoing desktop and web releases on GitHub Sponsors.`,
        }),
      ),
      el(
        'div',
        { className: 'qv-landing-sponsor-actions' },
        el('button', {
          className: 'bv-btn bv-btn-primary',
          text: 'Open Academy',
          attrs: { type: 'button' },
          on: { click: () => actions.setState({ activeView: 'course' }, true) },
        }),
        el('a', {
          className: 'bv-btn',
          text: 'Sponsor on GitHub',
          attrs: {
            href: 'https://github.com/sponsors/jhonrey-com',
            target: '_blank',
            rel: 'noopener noreferrer',
          },
        }),
        el('a', {
          className: 'bv-btn',
          text: 'Source Code',
          attrs: {
            href: 'https://github.com/jhonrey-com/Quillvibe',
            target: '_blank',
            rel: 'noopener noreferrer',
          },
        }),
      ),
    ),
  );

  // Footer
  const footer = el(
    'footer',
    { className: 'qv-landing-footer' },
    el(
      'div',
      { className: 'qv-landing-container' },
      el(
        'div',
        { className: 'qv-landing-footer-grid' },
        el(
          'div',
          { className: 'qv-landing-footer-brand' },
          el(
            'div',
            { className: 'qv-landing-footer-logo' },
            quillvibeLogo(20),
            el('strong', { text: 'Quillvibe' }),
          ),
          el('p', {
            className: 'qv-landing-footer-desc',
            text: 'Open-source book writing, Story Bible, copyediting, typesetting, and cover studio published under jhonrey.com & CXVRE Information Technology Services.',
          }),
          el('p', {
            className: 'qv-landing-footer-contact',
            text: 'Quillvibe support: quillvibe@jhonrey.com | General: contact@jhonrey.com',
          }),
        ),
        el(
          'div',
          { className: 'qv-landing-footer-col' },
          el('h4', { text: 'Workspace' }),
          el('button', { attrs: { type: 'button' }, className: 'qv-landing-footer-link', text: 'Open Web Studio', on: { click: openStudio } }),
          el('button', { attrs: { type: 'button' }, className: 'qv-landing-footer-link', text: 'Book Writing Course', on: { click: () => actions.setState({ activeView: 'course' }, true) } }),
          el('button', { attrs: { type: 'button' }, className: 'qv-landing-footer-link', text: 'Help Center & FAQ', on: { click: () => actions.setState({ activeView: 'help' }, true) } }),
          el('button', { attrs: { type: 'button' }, className: 'qv-landing-footer-link', text: 'Settings & Fonts', on: { click: () => actions.setState({ activeView: 'settings' }, true) } }),
        ),
        el(
          'div',
          { className: 'qv-landing-footer-col' },
          el('h4', { text: 'Documentation' }),
          el('button', { attrs: { type: 'button' }, className: 'qv-landing-footer-link', text: 'Developer (.qvext) Portal', on: { click: () => actions.setState({ activeView: 'developer' }, true) } }),
          el('button', { attrs: { type: 'button' }, className: 'qv-landing-footer-link', text: 'Official File Formats', on: { click: () => actions.setState({ activeView: 'extensions' }, true) } }),
          el('button', { attrs: { type: 'button' }, className: 'qv-landing-footer-link', text: 'Reference Manual', on: { click: () => actions.setState({ activeView: 'manual' }, true) } }),
          el('button', { attrs: { type: 'button' }, className: 'qv-landing-footer-link', text: 'Universal Search (Ctrl+K)', on: { click: () => openUniversalSearch(actions, getState) } }),
        ),
        el(
          'div',
          { className: 'qv-landing-footer-col' },
          el('h4', { text: 'Open Source' }),
          el('a', { text: 'jhonrey.com', attrs: { href: 'https://www.jhonrey.com/', target: '_blank', rel: 'noopener noreferrer' } }),
          el('a', { text: 'GitHub Repository', attrs: { href: 'https://github.com/jhonrey-com/Quillvibe', target: '_blank', rel: 'noopener noreferrer' } }),
          el('a', { text: 'Desktop Releases', attrs: { href: 'https://github.com/jhonrey-com/Quillvibe/releases/latest', target: '_blank', rel: 'noopener noreferrer' } }),
          el('a', { text: 'Sponsor Development', attrs: { href: 'https://github.com/sponsors/jhonrey-com', target: '_blank', rel: 'noopener noreferrer' } }),
        ),
      ),
      el(
        'div',
        { className: 'qv-landing-footer-bottom' },
        el('span', { text: '© 2026 CXVRE Information Technology Services. Published under jhonrey.com (MIT License).' }),
        el('span', { text: `v${APP_VERSION}` }),
      ),
    ),
  );

  page.append(
    header,
    el('main', { className: 'qv-landing-main' }, heroSection, studioSection, formatsSection, downloadSection, communitySection),
    footer,
  );
  container.appendChild(page);

  // GPU-composited smooth scroll progress + header elevation + subtle showcase parallax
  let scrollRafPending = false;
  const syncScrollVisuals = () => {
    scrollRafPending = false;
    const top = page.scrollTop;
    const maxScroll = Math.max(1, page.scrollHeight - page.clientHeight);
    const progress = Math.min(1, Math.max(0, top / maxScroll));
    scrollProgressLine.style.transform = `scaleX(${progress.toFixed(4)})`;
    header.classList.toggle('is-scrolled', top > 12);
    if (!prefersReducedMotion()) {
      const stageShift = Math.min(18, top * 0.045);
      showcaseEl.style.transform = `translate3d(0, ${(-stageShift).toFixed(2)}px, 0)`;
    } else {
      showcaseEl.style.transform = 'none';
    }
  };

  page.addEventListener(
    'scroll',
    () => {
      if (scrollRafPending) return;
      scrollRafPending = true;
      requestAnimationFrame(syncScrollVisuals);
    },
    { passive: true },
  );
  syncScrollVisuals();
}
