import type { AppActions, AppState } from '../core/app-context';
import type { AppThemeId } from '../core/types';
import { APP_VERSION } from '../core/version';
import { COURSE_MODULES, getCourseCompletionSummary } from '../ui/course';
import { clearNode, createMorphThemeIcon, el, icon, quillvibeLogo } from '../ui/dom';
import { openUniversalSearch } from '../ui/universal-search';

type PreviewTabId = 'editor' | 'split' | 'graph' | 'cover' | 'academy';

const PREVIEW_ITEMS: Record<
  PreviewTabId,
  { label: string; src: string; alt: string; caption: string }
> = {
  editor: {
    label: 'Draft & Proofread',
    src: '/screenshots/editor-workspace.png',
    alt: 'Quillvibe Manuscript workspace showing Binder, Paper Sheet, Proofread/Split Ref controls, and Scene Inspector',
    caption: 'Unified Draft sheet with Binder navigation, inline Proofread marks, and Scene Inspector.',
  },
  split: {
    label: 'Split Ref & Diff',
    src: '/screenshots/editor-split-diff.png',
    alt: 'Quillvibe Manuscript Split Reference resizable drawer comparing a second scene beside active prose',
    caption: 'Resizable Split Reference & Revision Diff drawer docked inside Manuscript Draft Mode.',
  },
  graph: {
    label: 'Story Bible & Graph',
    src: '/screenshots/story-graph.png',
    alt: 'Quillvibe Story Graph with linked narrative cards, live wire routing, and auto-synced scenes',
    caption: 'Dual-mode Storyboard & 60 FPS Force Graph synced automatically with your Story Bible.',
  },
  cover: {
    label: 'Book Cover Studio',
    src: '/screenshots/cover-studio.png',
    alt: 'Quillvibe Book Cover Studio with layered shapes and design inspector',
    caption: 'Front, spine, back, and dust-jacket flaps with alignment guides, Vector SVG, and Print PDF.',
  },
  academy: {
    label: 'Free Academy Course',
    src: '/screenshots/course-academy.png',
    alt: 'Quillvibe Academy full-page two-pane book writing course and live interactive guide',
    caption: '23 structured modules & 71 guided lessons with visual diagrams and live practice cursor.',
  },
};

const INSTALL_CMD_WIN = 'irm https://raw.githubusercontent.com/jhonrey-com/Quillvibe/main/scripts/install.ps1 | iex';
const INSTALL_CMD_UNIX = 'curl -fsSL https://raw.githubusercontent.com/jhonrey-com/Quillvibe/main/scripts/install.sh | sh';

let activePreviewTab: PreviewTabId = 'editor';

/**
 * Editorial open-source landing page served at https://quillvibe.jhonrey.com/ on the web runtime.
 * Grounded strictly in the published README specification with classic author typography.
 */
export function renderLandingPageView(
  container: HTMLElement,
  actions: AppActions,
  getState: () => AppState,
): void {
  clearNode(container);

  const curState = getState();
  const courseSummary = getCourseCompletionSummary();
  const totalLessons = courseSummary.total;
  const totalModules = COURSE_MODULES.length;

  const openStudio = () => {
    let seen = false;
    try {
      seen = window.localStorage.getItem('quillvibe.splashSeen.v2') === '1';
    } catch {
      seen = true;
    }
    if (!seen) {
      actions.setState({ activeView: 'editor' }, true);
      return;
    }
    actions.setState({ activeView: 'editor' }, true);
  };

  // Header
  const themeBtn = el(
    'button',
    {
      className: 'bv-btn bv-btn-icon',
      attrs: {
        type: 'button',
        'aria-label': `Switch Theme (${curState.settings.appTheme})`,
        title: 'Switch Theme: Match Device, Ivory, Parchment, Obsidian',
      },
      on: {
        click: () => {
          const order: AppThemeId[] = ['system', 'ivory', 'parchment', 'obsidian'];
          const now = getState().settings.appTheme;
          const next = order[(order.indexOf(now) + 1) % order.length];
          actions.updateSettings({ appTheme: next });
        },
      },
    },
    createMorphThemeIcon(curState.settings.appTheme, 17),
  );

  const searchBtn = el(
    'button',
    {
      className: 'bv-btn qv-landing-search-btn',
      attrs: { type: 'button', 'aria-label': 'Universal Search (Ctrl+K)' },
      on: { click: () => openUniversalSearch(actions, getState) },
    },
    icon('search', 14),
    el('span', { className: 'qv-landing-search-text', text: 'Search…' }),
    el('kbd', { className: 'qv-landing-kbd', text: 'Ctrl+K' }),
  );

  const scrollToSection = (sectionId: string) => {
    const target = document.getElementById(sectionId);
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

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
        quillvibeLogo(24),
        el('span', { className: 'qv-landing-brand-name', text: 'Quillvibe' }),
      ),
      el(
        'nav',
        { className: 'qv-landing-nav', attrs: { 'aria-label': 'Primary Navigation' } },
        el('button', {
          className: 'qv-landing-nav-link',
          text: 'Why Quillvibe',
          attrs: { type: 'button' },
          on: { click: () => scrollToSection('qv-landing-why') },
        }),
        el('button', {
          className: 'qv-landing-nav-link',
          text: 'Layouts',
          attrs: { type: 'button' },
          on: { click: () => scrollToSection('qv-landing-layouts') },
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
          text: 'Academy',
          attrs: { type: 'button' },
          on: { click: () => actions.setState({ activeView: 'course' }, true) },
        }),
        el('button', {
          className: 'qv-landing-nav-link',
          text: 'Help & FAQ',
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
          icon('quill', 14),
          'Open Studio',
        ),
      ),
    ),
  );

  // Showcase Preview Block
  const previewImg = el('img', {
    className: 'qv-landing-preview-img',
    attrs: {
      src: PREVIEW_ITEMS[activePreviewTab].src,
      alt: PREVIEW_ITEMS[activePreviewTab].alt,
    },
  });
  const previewCaption = el('span', {
    className: 'qv-landing-preview-caption',
    text: PREVIEW_ITEMS[activePreviewTab].caption,
  });

  const previewOrder: PreviewTabId[] = ['editor', 'split', 'graph', 'cover', 'academy'];
  const showcaseButtons: HTMLButtonElement[] = previewOrder.map((tabKey) => {
    const item = PREVIEW_ITEMS[tabKey];
    const btn = el('button', {
      className: `qv-landing-tab-btn${activePreviewTab === tabKey ? ' is-active' : ''}`,
      text: item.label,
      attrs: {
        type: 'button',
        role: 'tab',
        'aria-selected': String(activePreviewTab === tabKey),
      },
      on: {
        click: () => {
          activePreviewTab = tabKey;
          for (let i = 0; i < showcaseButtons.length; i++) {
            const b = showcaseButtons[i];
            const k = previewOrder[i];
            const active = k === tabKey;
            b.classList.toggle('is-active', active);
            b.setAttribute('aria-selected', String(active));
          }
          previewImg.src = item.src;
          previewImg.alt = item.alt;
          previewCaption.textContent = item.caption;
        },
      },
    });
    return btn;
  });

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
          text: 'Write chapters, build your world, mark proofs, design your cover, and export for print in a single book file.',
        }),
        el('p', {
          className: 'qv-landing-hero-lead',
          text: 'Quillvibe is a free, open-source book writing application built for long-form authors. Open a blank book or follow the built-in quick guide straight in your browser with no account required, save your work in protected .qv archives, or install the desktop edition for Windows, macOS, and Linux.',
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
            icon('quill', 15),
            'Start Writing in Browser',
          ),
          el(
            'button',
            {
              className: 'bv-btn qv-landing-cta-lg',
              attrs: { type: 'button' },
              on: { click: () => actions.setState({ activeView: 'course' }, true) },
            },
            icon('course', 15),
            `Read the Free Course (${totalModules} Modules)`,
          ),
          el(
            'button',
            {
              className: 'bv-btn qv-landing-cta-lg',
              attrs: { type: 'button' },
              on: { click: () => scrollToSection('qv-landing-download') },
            },
            icon('download', 15),
            'Desktop Releases',
          ),
        ),
      ),
      el(
        'div',
        { className: 'qv-landing-showcase' },
        el(
          'div',
          { className: 'qv-landing-showcase-bar', attrs: { role: 'tablist', 'aria-label': 'Workspace Previews' } },
          ...showcaseButtons,
          previewCaption,
        ),
        el('div', { className: 'qv-landing-showcase-frame' }, previewImg),
      ),
    ),
  );

  // Section 1: Why Keep Everything in One Place
  const whyCards: Array<[string, string]> = [
    [
      'No account & spellcheck off by default',
      'Open a blank book immediately without creating an account. Spellcheck red underlines stay off while drafting (toggleable in Settings) and Undo/Redo (Ctrl+Z / Ctrl+Y) works across every studio.',
    ],
    [
      '15 traditional proofreading marks',
      'Right-click any highlighted passage in Proofread mode to insert carets, deletions, transpositions, or queries. Toggle Clean Preview anytime, keep revision snapshots, and lock settled chapters against accidental edits.',
    ],
    [
      'Inline illustrations, text wrap & background removal',
      'Drag PNG, JPEG, or WebP artwork right onto your scene page, wrap prose around images (Wrap Left, Right, Top & Bottom, Inline, Behind), align magnetically, or strip solid backgrounds offline.',
    ],
  ];

  const whySection = el(
    'section',
    { className: 'qv-landing-section qv-landing-bordered', id: 'qv-landing-why' },
    el(
      'div',
      { className: 'qv-landing-container' },
      el(
        'div',
        { className: 'qv-landing-section-head' },
        el('h2', { text: 'Why keep an entire book in one workspace' }),
        el('p', {
          text: 'Most writers split a single book across five separate apps: word processors for chapters, spreadsheets for timelines, note wikis for characters, image editors for covers, and converters for eBooks. Quillvibe keeps every stage in one local .qv project file.',
        }),
      ),
      el(
        'div',
        { className: 'qv-landing-grid-3' },
        ...whyCards.map(([title, body]) =>
          el(
            'article',
            { className: 'qv-landing-col' },
            el('h3', { text: title }),
            el('p', { text: body }),
          ),
        ),
      ),
    ),
  );

  // Section 2: Three Workspace Layouts (from README section 3)
  const layoutCards: Array<[string, string]> = [
    [
      'Focused',
      'Shows only your Manuscript Binder, Ivory / Parchment / Obsidian paper sheet, formatting tools, and clean exports (.qv, .pdf, .epub, .docx, .md) for distraction-free drafting.',
    ],
    [
      'Editorial',
      'Adds Corkboard scene cards with word targets, sortable Outline Ledger tables with CSV export, 15 proofreading marks, and Print PDF / EPUB 3 trade trim typesetting.',
    ],
    [
      'Full Studio',
      'Adds Story Bible (Characters, Locations, Lore, custom shelves), Dual-Mode Story Graph with Auto-Sync Book, Book Cover Studio (front, spine, back & flaps), Collaboration, and .qvext add-ons.',
    ],
  ];

  const layoutsSection = el(
    'section',
    { className: 'qv-landing-section qv-landing-bordered', id: 'qv-landing-layouts' },
    el(
      'div',
      { className: 'qv-landing-container' },
      el(
        'div',
        { className: 'qv-landing-section-head' },
        el('h2', { text: 'Three Workspace Layouts that adapt without deleting work' }),
        el('p', {
          text: 'Switch between Focused, Editorial, and Full Studio in one click from the status bar. Changing layouts only shows or hides surrounding panels; your Story Bible, notes, and cover layers stay intact.',
        }),
      ),
      el(
        'div',
        { className: 'qv-landing-grid-3' },
        ...layoutCards.map(([title, body]) =>
          el(
            'article',
            { className: 'qv-landing-col' },
            el('h3', { text: title }),
            el('p', { text: body }),
          ),
        ),
      ),
    ),
  );

  // Section 3: Native Protected File Formats (from README section 6)
  const formats: Array<[string, string, string]> = [
    ['.qv', 'Complete Book Workspace', 'Saves manuscript chapters, Story Bible, Story Graph, cover design, proofread marks, snapshots, Author Key & Copyright Seal.'],
    ['.qvbible', 'Story Bible Notes', 'Extracts and merges Characters, Locations, Lore, and custom categories cleanly between series books.'],
    ['.qvscene', 'Single Scene Draft', 'Shares or backs up a single scene complete with revision snapshots and copyediting markup.'],
    ['.qvstyle', 'Typeset & Paper Preset', 'Captures trim size, custom typography, drop caps, smart quotes, margins, and paper theme for consistent editions.'],
    ['.qvdesign', 'Cover Design Package', 'Stores Book Cover Studio layers, vector paths, blend modes, drafts, and review pins without exposing manuscript prose.'],
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
        el('h2', { text: 'Protected formats, Author Keys & open exports' }),
        el('p', {
          text: 'Native Quillvibe files support optional password encryption while exporting standard .pdf, .epub, .docx, .md, .rtf, and Vector SVG anytime. Older .quillvibe and .bookvibe files import cleanly too.',
        }),
      ),
      el(
        'div',
        { className: 'qv-landing-format-grid' },
        ...formats.map(([ext, name, desc]) =>
          el(
            'div',
            { className: 'qv-landing-format-item' },
            el('code', { className: 'qv-landing-format-code', text: ext }),
            el(
              'div',
              { className: 'qv-landing-format-body' },
              el('strong', { text: name }),
              el('p', { text: desc }),
            ),
          ),
        ),
      ),
    ),
  );

  // Section 4: Browser vs Desktop App + Releases + Academy
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
        el('h2', { text: 'Write in your browser, install on Chromebook, Windows, macOS & Linux' }),
        el('p', {
          text: 'Install Quillvibe as an offline Web App on Chromebook (ChromeOS), Android, and iPadOS, or download native installers for Windows, macOS Universal, and Linux (x64 & ARM64) with direct disk auto-save, stacked book tabs, F11 focus mode, Pro Vector Cover tools, and local Wi-Fi/Bluetooth sharing.',
        }),
      ),
      el(
        'div',
        { className: 'qv-landing-grid-2' },
        el(
          'article',
          { className: 'qv-landing-card' },
          el('h3', { text: 'Browser & Chromebook App (Offline PWA)' }),
          el('p', {
            text: 'Run or install Quillvibe in Chrome, Edge, Firefox, or Safari on Chromebook (ChromeOS), Android, iPadOS, and any other desktop or tablet OS. Click Save to download a local .qv backup when finishing a session.',
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
              text: 'Browse Help & FAQ',
              attrs: { type: 'button' },
              on: { click: () => actions.setState({ activeView: 'help' }, true) },
            }),
          ),
        ),
        el(
          'article',
          { className: 'qv-landing-card' },
          el('h3', { text: `Desktop App for Windows, macOS & Linux x64/ARM64 (v${APP_VERSION})` }),
          el('p', {
            text: 'Adds automatic local saving, stacked book tabs, F11 fullscreen clock and sprint bar, OS file-association double-click launch, Pro Vector Cover tools, and in-app updates.',
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
              text: 'Download on GitHub Releases',
              attrs: {
                href: 'https://github.com/jhonrey-com/Quillvibe/releases/latest',
                target: '_blank',
                rel: 'noopener noreferrer',
              },
            }),
            el('button', {
              className: 'bv-btn',
              text: 'Developer (.qvext) Portal',
              attrs: { type: 'button' },
              on: { click: () => actions.setState({ activeView: 'developer' }, true) },
            }),
          ),
        ),
      ),
    ),
  );

  // Section 5: Academy + MIT Open Source & Sponsors
  const communitySection = el(
    'section',
    { className: 'qv-landing-section qv-landing-bordered', id: 'qv-landing-academy' },
    el(
      'div',
      { className: 'qv-landing-container' },
      el(
        'div',
        { className: 'qv-landing-sponsor-box' },
        el(
          'div',
          { className: 'qv-landing-sponsor-copy' },
          el('h2', { text: `Free Academy (${totalModules} modules, ${totalLessons} lessons), supported by sponsors` }),
          el('p', {
            text: 'All writing workspaces, proofreading marks, Story Bible, Cover Studio, and print/eBook exports are available under the MIT License with zero paywalls. Learn step by step inside the built-in course or support releases on GitHub Sponsors.',
          }),
        ),
        el(
          'div',
          { className: 'qv-landing-sponsor-actions' },
          el('button', {
            className: 'bv-btn bv-btn-primary',
            text: 'Explore Quillvibe Academy',
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
            text: 'View GitHub Source',
            attrs: {
              href: 'https://github.com/jhonrey-com/Quillvibe',
              target: '_blank',
              rel: 'noopener noreferrer',
            },
          }),
        ),
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
            text: 'Open-source book writing, Story Bible, proofreading, typesetting, and cover studio published under jhonrey.com & CXVRE Information Technology Services.',
          }),
          el('p', {
            className: 'qv-landing-footer-contact',
            text: 'Support & inquiries: quillvibe@jhonrey.com | support@quillvibe.app',
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
          el('a', { text: 'GitHub Repository', attrs: { href: 'https://github.com/jhonrey-com/Quillvibe', target: '_blank', rel: 'noopener noreferrer' } }),
          el('a', { text: 'Desktop Releases', attrs: { href: 'https://github.com/jhonrey-com/Quillvibe/releases/latest', target: '_blank', rel: 'noopener noreferrer' } }),
          el('a', { text: 'Security Policy', attrs: { href: 'https://github.com/jhonrey-com/Quillvibe/blob/main/SECURITY.md', target: '_blank', rel: 'noopener noreferrer' } }),
          el('a', { text: 'Sponsor Development', attrs: { href: 'https://github.com/sponsors/jhonrey-com', target: '_blank', rel: 'noopener noreferrer' } }),
        ),
      ),
      el(
        'div',
        { className: 'qv-landing-footer-bottom' },
        el('span', { text: '© 2026 CXVRE Information Technology Services. Published under jhonrey.com (MIT License)' }),
        el('span', { text: `v${APP_VERSION}` }),
      ),
    ),
  );

  // Notice: button signature for footer col links uses el('button', opts), let's fix those with proper ElementOptions in case of type checking below!
  void header;
  const page = el(
    'div',
    { className: 'qv-landing-page' },
    header,
    el('main', { className: 'qv-landing-main' }, heroSection, whySection, layoutsSection, formatsSection, downloadSection, communitySection),
    footer,
  );
  container.appendChild(page);
}
