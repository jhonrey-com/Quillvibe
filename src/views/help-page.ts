import type { AppActions } from '../core/app-context';
import { isTauriRuntime } from '../core/bridge';
import { QUILLVIBE_EXTENSIONS } from '../core/extensions';
import { CONTROL_REFERENCE_ITEMS } from '../ui/controls-catalog';
import { clearNode, el, icon, preserveScrollPositions, type IconName } from '../ui/dom';
import { createAppThemeButton } from '../ui/theme-button';
import { QUILLVIBE_ERROR_CATALOG } from '../ui/error-dialog';

export interface HelpFaqArticle {
  id: string;
  category:
  | 'Getting Started'
  | 'Workspaces & Studios'
  | 'Images & Covers'
  | 'File Formats & Migration'
  | 'Desktop Tabs & Windows'
  | 'Website vs Desktop';
  platform: 'both' | 'web' | 'desktop';
  title: string;
  summary: string;
  details: string[];
  keywords: string;
  screenshot?: { src: string; caption: string };
}

export const HELP_FAQ_ARTICLES: readonly HelpFaqArticle[] = [
  {
    id: 'start-welcome',
    category: 'Getting Started',
    platform: 'both',
    title: 'Welcome Screen, Themes & Workspace Layouts',
    summary: 'Open a blank book, read the starter guide, match your device theme, or pick Focused, Editorial, or Full Studio layout.',
    details: [
      'Visit / for the Quillvibe overview landing page, /start to launch the Welcome workbench, or /write to jump directly into your active scene.',
      'Themes include Match Device (System), Ivory Light, Warm Parchment, and Obsidian Dark. All four update scrollbars, panels, and paper cleanly.',
      'Workspace Layouts control which tools appear without deleting any book data: Focused (single drafting sheet), Editorial (adds Corkboard, Outline, Proofread, Typeset), and Full Studio (adds Story Bible, Story Graph, Book Cover Studio, Collaboration).',
      'On small screens and phones, sidebars collapse automatically so opening the left Binder closes the right Inspector and vice versa.',
    ],
    keywords: 'start welcome theme dark light system device layout focused editorial full studio mobile',
    screenshot: {
      src: '/screenshots/editor-workspace.png',
      caption: 'Quillvibe Manuscript workspace showing Binder, Paper Sheet, centered navigation bar, and Inspector.',
    },
  },
  {
    id: 'manuscript-proofread',
    category: 'Workspaces & Studios',
    platform: 'both',
    title: 'Manuscript Editor, Right-Click Proofread Marks & Undo/Redo',
    summary: 'Draft freely with spellcheck off by default, capture snapshots, undo/redo with Ctrl+Z / Ctrl+Y, and apply 15 copyediting symbols.',
    details: [
      'Spellcheck underlines are off by default so writers can draft without interruption. Turn them on anytime in Settings -> Workspace & Editor.',
      'Use Ctrl+Z and Ctrl+Y across Manuscript, Corkboard, Outline, Story Bible, Story Graph, Typeset, and Cover Studio.',
      'In Editorial or Full Studio layout, switch to Proofread mode to highlight any passage and right-click to apply 15 standard copyediting marks (delete, insert caret, transpose, stet, query, and more) with Clean Preview and automatic snapshot backups.',
    ],
    keywords: 'manuscript draft editor spellcheck undo redo ctrl+z proofread marks copyedit snapshot',
  },
  {
    id: 'manuscript-images',
    category: 'Images & Covers',
    platform: 'both',
    title: 'Adding Images Inside Your Book (Snap-to-Grid, Text Wrap & Background Remover)',
    summary: 'Drag and drop photos or illustrations directly onto your scene page, wrap prose around them, snap to grid/guides, or remove backgrounds offline.',
    details: [
      'Drag any PNG, JPEG, or WebP image directly onto the Manuscript paper sheet, or click Insert Image in the editor bar.',
      'Choose how text flows around the image: Inline, Wrap Left, Wrap Right, Top & Bottom, or Behind Text.',
      'Drag images to reposition or pull corner handles to resize with Snap-to-Grid and magnetic Snap-to-Elements alignment guides.',
      'Click Remove Background to strip solid or light backgrounds locally on your device, tune the tolerance slider, or click Restore Original anytime.',
    ],
    keywords: 'image photo illustration drag drop resize move snap grid text wrap reflow background remover mobile',
  },
  {
    id: 'corkboard-outline-bible-graph',
    category: 'Workspaces & Studios',
    platform: 'both',
    title: 'Corkboard, Outline, Story Bible & Story Graph',
    summary: 'Reorder scenes as index cards, filter pacing, organize characters/locations/lore, and wire exact node connections.',
    details: [
      'Corkboard displays every scene as a draggable synopsis card with word-target progress bars.',
      'Outline provides a filterable table of scenes by status, POV, location, and word count.',
      'Story Bible stores characters, locations, lore, portraits, and custom categories with automatic scene mention detection.',
      'Story Graph connects character and plot cards with crisp left/right edge curves that track nodes as you drag them.',
    ],
    keywords: 'corkboard outline story bible characters locations lore story graph nodes wiring',
    screenshot: {
      src: '/screenshots/story-graph.png',
      caption: 'Dual-mode Story Graph with Spatial Storyboard groups, 90-degree elbow connectors, and Force Graph physics.',
    },
  },
  {
    id: 'typeset-cover-studio',
    category: 'Images & Covers',
    platform: 'both',
    title: 'Book Cover Studio, Interior Typeset & Real Print PDF / EPUB 3',
    summary: 'Design front, spine, back, and dust-jacket flaps, install custom fonts, and export trim-sized Print PDF, PNG 1x/2x/3x, JPEG, Vector SVG, and EPUB 3 books.',
    details: [
      'Install your own .ttf, .otf, .woff, or .woff2 fonts in Settings -> Typefaces & Fonts.',
      'Book Cover Studio supports 100-step undo/redo, 10% to 500% zoom, Space+Drag panning, 8-point scaling and rotation handles, Shift+Click / marquee multi-select, Ctrl+G layer grouping, double-click on-canvas text editing, smart snapping guides, and exports to PNG (1x/2x/3x or transparent), JPEG, and Vector SVG.',
      'Desktop App Exclusive Pro Vector Cover Studio adds Freehand Brush & Vector Pen path drawing, 7 blend modes (Multiply, Screen, Overlay, Soft Light, Darken, Lighten), direct HTTPS Image URL pasting, Draft Variants with Side-by-Side Comparison, numbered Review Pins, and .qvdesign design file exchange.',
      'Interior Typeset previews trim sizes (5x8, 5.5x8.5, 6x9, A5, Royal, Letter), margins, drop caps, running headers, and exports real Print PDF (.pdf), EPUB 3 (.epub), and standard .docx documents.',
    ],
    keywords: 'cover studio typeset pdf epub docx print trim size font drop cap spine wrap svg jpeg png 3x transparent vector draw blend mode url qvdesign compare variant',
    screenshot: {
      src: '/screenshots/cover-studio.png',
      caption: 'Book Cover Studio with layered shapes, corner resize handles, and inspector properties.',
    },
  },
  {
    id: 'cover-studio-pro-faq',
    category: 'Images & Covers',
    platform: 'desktop',
    title: 'Desktop Pro Cover Studio: Vector Paths, URL Paste, Draft Compare & .qvdesign',
    summary: 'Guide to desktop vector drawing tools, layer blending, pasting image URLs, comparing cover drafts side-by-side, and sharing .qvdesign packages.',
    details: [
      'Draw Tab: Use Freehand Brush for smooth drawn strokes or Vector Pen for multi-point polygons/lines. Adjust Stroke Color, Stroke Width, Close Path Fill, Opacity, and Blend Mode in the Properties panel.',
      'Paste Image URL: In Uploads, paste an https:// image link to embed pixels locally for offline exports. Note: some external websites block direct browser cross-origin reads (CORS); if warned, download the image file first and upload it normally.',
      'Drafts & Side-by-Side Comparison: Save multiple cover directions as named drafts, inspect two variants side-by-side to judge title legibility and palette balance, and click Promote Winner cleanly.',
      'Collaboration (.qvdesign): Place numbered review pins directly on the cover canvas and export an editable .qvdesign file to share artwork without exposing unpublished manuscript chapters.',
    ],
    keywords: 'cover draw brush vector pen blend multiply screen overlay paste url cors variant compare promote review pin qvdesign',
  },
  {
    id: 'locks-linked-themes-outline',
    category: 'Workspaces & Studios',
    platform: 'both',
    title: 'Chapter Locking, Linked Paper/App Theme, Outline Ledger & Universal Search',
    summary: 'Protect finalized chapters, link app and paper themes together, edit scenes inline in Outline Ledger, and jump anywhere with Ctrl+K.',
    details: [
      'Universal Search (Ctrl+K / Cmd+K): Search every Quillvibe studio view, Academy course lesson, Help/FAQ topic, QV error code, and scenes or Story Bible entries inside your active book.',
      'Lock Part or Chapter: Click the Lock icon on any Part or Chapter in the Manuscript Binder to make finalized proofread scenes read-only until unlocked.',
      'Linked App & Paper Theme: Enable "Link Manuscript Paper Theme & Application Theme" on /settings so changing your Studio theme (Ivory, Parchment, Obsidian) updates paper automatically—and vice versa.',
      'Outline Ledger & Story Graph: Filter, sort, collapse chapters, edit scene POV/location/timeline/status inline, or export CSV in Outline Ledger.',
    ],
    keywords: 'lock chapter part universal search ctrl+k link theme paper settings manual outline ledger pacing csv story graph',
  },
  {
    id: 'formats-keys-migrate',
    category: 'File Formats & Migration',
    platform: 'both',
    title: 'Protected .qv / .qvdesign Files, .docx Export, Author Keys & Migration',
    summary: 'Save encrypted .qv / .qvdesign archives, export complete .docx manuscripts, bind Author Keys and Copyright Seals, or migrate books cleanly.',
    details: [
      'Official Quillvibe formats: .qv (whole book workspace), .qvbible (story bible), .qvscene (single scene), .qvstyle (typeset preset), and .qvdesign (editable cover studio design package).',
      'Older .quillvibe, .qvibe, .qvbook, and legacy archives can still be imported anytime via Settings -> Publishing, .docx & Backups -> Import Legacy Archive.',
      'Complete .docx Export: Pick .docx in the top-right Export selector or click "Export Word-Compatible (.docx)" in Settings to generate a formatted Title Page, Chapter Headings, bold/italic runs, quotes, and scene breaks.',
      'Origin Author & Device Keys (QVK- / QVD-) record where a manuscript originated; Work Copyright Seals (QVC-) record ownership and territory rights.',
    ],
    keywords: 'qv qvbible qvscene qvstyle qvdesign docx password lock author key copyright seal migrate export rtf zip json legacy',
  },
  {
    id: 'desktop-tabs-windows',
    category: 'Desktop Tabs & Windows',
    platform: 'desktop',
    title: 'Desktop Stacked Book Tabs, Unlimited Windows & Live Multi-Window Sync',
    summary: 'Keep series books stacked in tabs, drag tabs to reorder or combine windows, and sync edits safely across open copies.',
    details: [
      'Click + on the top desktop tab bar or press Ctrl+Shift+N to open an empty New Tab book picker showing recent local books.',
      'Drag tabs left/right to reorder, drag a tab downward out of the bar to open it in a new window, or drag a tab over another Quillvibe window to combine them.',
      'Use the tab bar menu -> Combine All Windows Here to merge all open desktop windows into one tabbed window.',
      'Double-clicking a .qv, .qvscene, .qvbible, .qvstyle, or .qvdesign file while Quillvibe is already running opens it cleanly in a new tab inside your existing window.',
    ],
    keywords: 'tabs windows drag drop combine merge sync new tab empty tab double click single instance',
  },
  {
    id: 'web-vs-desktop',
    category: 'Website vs Desktop',
    platform: 'both',
    title: 'Website Version vs. Installed Desktop App (Windows, Mac & Linux)',
    summary: 'Compare what runs in your browser at quillvibe.jhonrey.com versus the free Windows, Mac, and Linux desktop installers.',
    details: [
      'Website version (https://quillvibe.jhonrey.com): Runs immediately with no download or OS installer prompts. Click Save periodically to download a .qv backup to your device.',
      'Desktop app (Windows .msi/.exe, macOS Universal .dmg, Linux .AppImage/.deb/.rpm): Adds automatic saving straight to disk, stacked book tabs, unlimited multi-window editing, F11 Immersive Fullscreen HUD with clock/alarm, local Wi-Fi PIN sync, Bluetooth transfer, and double-click file opening.',
      'Because Quillvibe is a new open-source project without a paid commercial app-store certificate, Windows/Mac/Linux may display an unrecognized publisher warning on install. You can either allow it or use the browser version instead.',
      'Free Book Writing Course (/course): Available on both website and desktop with 14 modules, 43 lessons, screenshots, and interactive checks.',
    ],
    keywords: 'website desktop difference installer warning smartscreen windows mac linux course academy',
  },
];

type HelpCategoryId =
  | 'All'
  | HelpFaqArticle['category']
  | 'Common Errors & Codes'
  | 'Controls & Shortcuts'
  | 'Official Formats';

let helpSearchQuery = '';
let helpCategoryFilter: HelpCategoryId = 'All';
let helpPlatformFilter: 'all' | 'web' | 'desktop' = 'all';
const expandedArticleIds = new Set<string>(['start-welcome']);
const expandedErrorCodes = new Set<string>();
const expandedControlIds = new Set<string>();

export function setHelpPageSearch(query?: string): void {
  if (query !== undefined) {
    helpSearchQuery = query.trim();
    if (/^qv-\d+/i.test(helpSearchQuery)) {
      helpCategoryFilter = 'Common Errors & Codes';
      expandedErrorCodes.add(helpSearchQuery.toUpperCase());
    }
  }
}

export function setHelpPageArticle(articleId: string): void {
  const art = HELP_FAQ_ARTICLES.find((a) => a.id === articleId);
  if (!art) return;
  helpSearchQuery = '';
  helpCategoryFilter = art.category;
  expandedArticleIds.add(art.id);
}

/**
 * Calm two-pane Knowledge Base & FAQ workspace with collapsible accordions and category filtering.
 */
export function renderHelpPageView(container: HTMLElement, actions: AppActions): void {
  const restoreScroll = preserveScrollPositions(container, ['.qv-help-page']);
  clearNode(container);

  const q = helpSearchQuery.trim().toLowerCase();
  const matchesQuery = (haystack: string) => {
    if (!q) return true;
    const terms = q.split(/\s+/).filter(Boolean);
    const lower = haystack.toLowerCase();
    return terms.every((t) => lower.includes(t));
  };
  const matchesPlatform = (p: 'both' | 'web' | 'desktop') =>
    helpPlatformFilter === 'all' || p === 'both' || p === helpPlatformFilter;

  const matchingArticlesAll = HELP_FAQ_ARTICLES.filter(
    (a) =>
      matchesPlatform(a.platform) &&
      matchesQuery(`${a.title} ${a.category} ${a.summary} ${a.details.join(' ')} ${a.keywords}`),
  );
  const matchingErrorsAll = QUILLVIBE_ERROR_CATALOG.filter(
    (e) =>
      matchesPlatform(e.platform) &&
      matchesQuery(`${e.code} ${e.title} ${e.category} ${e.cause} ${e.fix}`),
  );
  const matchingControlsAll = CONTROL_REFERENCE_ITEMS.filter((c) =>
    matchesQuery(`${c.name} ${c.category} ${c.controlType} ${c.location} ${c.summary} ${c.howToUse} ${c.keywords}`),
  );

  const filteredArticles = matchingArticlesAll.filter(
    (a) => helpCategoryFilter === 'All' || helpCategoryFilter === a.category,
  );
  const filteredErrors =
    helpCategoryFilter === 'All' || helpCategoryFilter === 'Common Errors & Codes'
      ? matchingErrorsAll
      : [];
  const filteredControls =
    helpCategoryFilter === 'Controls & Shortcuts' || (helpCategoryFilter === 'All' && q.length >= 2)
      ? matchingControlsAll
      : [];
  const showFormats =
    helpCategoryFilter === 'Official Formats' || (helpCategoryFilter === 'All' && q.length === 0);

  const categoryItems: Array<{ id: HelpCategoryId; label: string; count: number }> = [
    {
      id: 'All',
      label: 'All Help & FAQ',
      count: matchingArticlesAll.length + matchingErrorsAll.length,
    },
    ...(
      [
        'Getting Started',
        'Workspaces & Studios',
        'Images & Covers',
        'File Formats & Migration',
        'Desktop Tabs & Windows',
        'Website vs Desktop',
      ] as const
    ).map((cat) => ({
      id: cat,
      label: cat,
      count: matchingArticlesAll.filter((a) => a.category === cat).length,
    })),
    {
      id: 'Common Errors & Codes',
      label: 'Error Codes (QV-*)',
      count: matchingErrorsAll.length,
    },
    {
      id: 'Controls & Shortcuts',
      label: 'Controls & Icons',
      count: matchingControlsAll.length,
    },
    {
      id: 'Official Formats',
      label: 'File Formats (.qv*)',
      count: QUILLVIBE_EXTENSIONS.length,
    },
  ];

  const helpCategoryIcon = (id: HelpCategoryId): IconName => {
    switch (id) {
      case 'Getting Started':
        return 'quill';
      case 'Workspaces & Studios':
        return 'layers';
      case 'Images & Covers':
        return 'image';
      case 'File Formats & Migration':
        return 'folder';
      case 'Desktop Tabs & Windows':
        return 'window-new';
      case 'Website vs Desktop':
        return 'server';
      case 'Common Errors & Codes':
        return 'shield';
      case 'Controls & Shortcuts':
        return 'settings';
      case 'Official Formats':
        return 'archive-format';
      default:
        return 'help';
    }
  };

  // Category Rail
  const categoryRail = el(
    'aside',
    { className: 'qv-help-rail', attrs: { 'aria-label': 'Help Topics' } },
    el(
      'div',
      { className: 'qv-help-rail-head' },
      el('strong', { text: 'Help', style: { fontSize: '14.5px' } }),
    ),
    el(
      'div',
      { className: 'qv-help-platform-pills' },
      ...([
        { id: 'all', label: 'All' },
        { id: 'web', label: 'Web' },
        { id: 'desktop', label: 'Desktop' },
      ] as const).map((pf) =>
        el('button', {
          className: `bv-mini-btn${helpPlatformFilter === pf.id ? ' is-active' : ''}`,
          text: pf.label,
          attrs: { type: 'button' },
          on: {
            click: () => {
              helpPlatformFilter = pf.id;
              renderHelpPageView(container, actions);
            },
          },
        }),
      ),
    ),
    el(
      'nav',
      { className: 'qv-help-cat-list', attrs: { 'aria-label': 'Help Categories' } },
      ...categoryItems.map((item) =>
        el(
          'button',
          {
            className: `qv-help-cat-btn${helpCategoryFilter === item.id ? ' is-active' : ''}`,
            attrs: { type: 'button' },
            on: {
              click: () => {
                helpCategoryFilter = item.id;
                renderHelpPageView(container, actions);
              },
            },
          },
          el(
            'span',
            { className: 'qv-help-cat-left' },
            icon(helpCategoryIcon(item.id), 14),
            el('span', { className: 'qv-help-cat-label', text: item.label }),
          ),
          el('span', { className: 'bv-mono-tag', text: String(item.count) }),
        ),
      ),
    ),
  );

  // Search Input & Top Header
  const searchInput = el('input', {
    className: 'bv-input qv-help-search-main',
    attrs: {
      type: 'search',
      placeholder: 'Search guides, error codes (QV-102), text wrap, .qv formats, shortcuts…',
      'aria-label': 'Search Help and FAQ',
      value: helpSearchQuery,
    },
    on: {
      input: () => {
        helpSearchQuery = searchInput.value;
        renderHelpPageView(container, actions);
        const restored = container.querySelector<HTMLInputElement>('.qv-help-search-main');
        if (restored) {
          restored.focus();
          restored.setSelectionRange(restored.value.length, restored.value.length);
        }
      },
    },
  });

  const mainColumn = el('div', { className: 'qv-help-main-col' });

  const headerCard = el(
    'header',
    { className: 'qv-help-hero' },
    el(
      'div',
      { className: 'qv-help-hero-top' },
      el(
        'div',
        {},
        el('h1', { className: 'qv-help-title', text: 'Help' }),
        el('p', {
          className: 'qv-help-subtitle',
          text: 'Guides, error diagnostics, shortcuts, and file formats.',
        }),
      ),
      el(
        'div',
        { className: 'qv-help-hero-actions' },
        el(
          'button',
          {
            className: 'bv-btn bv-btn-primary',
            attrs: { type: 'button' },
            on: { click: () => actions.openCoursePage() },
          },
          icon('course', 14),
          'Academy Course',
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
    el(
      'div',
      { className: 'qv-help-search-row' },
      searchInput,
      ...(helpSearchQuery || helpCategoryFilter !== 'All' || helpPlatformFilter !== 'all'
        ? [
          el('button', {
            className: 'bv-btn',
            text: 'Reset',
            attrs: { type: 'button' },
            on: {
              click: () => {
                helpSearchQuery = '';
                helpCategoryFilter = 'All';
                helpPlatformFilter = 'all';
                renderHelpPageView(container, actions);
              },
            },
          }),
        ]
        : []),
    ),
  );

  mainColumn.appendChild(headerCard);

  const totalHits =
    filteredArticles.length +
    filteredErrors.length +
    filteredControls.length +
    (showFormats ? QUILLVIBE_EXTENSIONS.length : 0);

  if (totalHits === 0) {
    mainColumn.appendChild(
      el(
        'section',
        { className: 'qv-help-empty' },
        el('strong', { text: `No matches found for “${helpSearchQuery}”` }),
        el('p', {
          className: 'bv-label',
          text: 'Try searching a shorter keyword (images, tabs, pdf, .qv, lock), an error code like QV-102, or email quillvibe@jhonrey.com.',
        }),
      ),
    );
  }

  // Collapsible FAQ Accordions (toggles cleanly in-place without re-rendering the page)
  if (filteredArticles.length > 0) {
    const faqList = el('div', { className: 'qv-faq-accordion-list' });
    for (const art of filteredArticles) {
      const buildArticleBody = () => {
        const list = el('ul', { className: 'qv-help-detail-list' });
        for (const line of art.details) {
          list.appendChild(el('li', { text: line }));
        }
        const runtimeSrc =
          isTauriRuntime() && art.screenshot
            ? art.screenshot.src === '/screenshots/editor-workspace.png'
              ? '/screenshots/desktop-editor.png'
              : art.screenshot.src === '/screenshots/story-graph.png'
                ? '/screenshots/desktop-story-graph.png'
                : art.screenshot.src === '/screenshots/cover-studio.png'
                  ? '/screenshots/desktop-cover-pro.png'
                  : art.screenshot.src
            : art.screenshot?.src;
        const figure =
          art.screenshot && runtimeSrc
            ? el(
              'figure',
              { className: 'qv-help-figure' },
              el('img', {
                attrs: {
                  src: runtimeSrc,
                  alt: art.screenshot.caption,
                  loading: 'lazy',
                },
              }),
              el('figcaption', { text: art.screenshot.caption }),
            )
            : null;
        return el('div', { className: 'qv-faq-accordion-body' }, list, figure);
      };

      const isOpen = Boolean(q) || expandedArticleIds.has(art.id);
      const chevronEl = el('span', {
        className: 'qv-faq-chevron',
        text: isOpen ? '−' : '+',
      });
      let bodyEl: HTMLElement | null = isOpen ? buildArticleBody() : null;
      const itemCard = el('article', {
        className: `qv-faq-accordion${isOpen ? ' is-open' : ''}`,
        id: `help-${art.id}`,
      });
      const headerBtn = el(
        'button',
        {
          className: `qv-faq-accordion-trigger${isOpen ? ' is-open' : ''}`,
          attrs: { type: 'button', 'aria-expanded': String(isOpen) },
          on: {
            click: () => {
              const nextOpen = !itemCard.classList.contains('is-open');
              if (nextOpen) {
                expandedArticleIds.add(art.id);
                if (!bodyEl) {
                  bodyEl = buildArticleBody();
                  itemCard.appendChild(bodyEl);
                }
              } else {
                expandedArticleIds.delete(art.id);
                if (bodyEl) {
                  bodyEl.remove();
                  bodyEl = null;
                }
              }
              itemCard.classList.toggle('is-open', nextOpen);
              headerBtn.classList.toggle('is-open', nextOpen);
              headerBtn.setAttribute('aria-expanded', String(nextOpen));
              chevronEl.textContent = nextOpen ? '−' : '+';
            },
          },
        },
        el(
          'div',
          { className: 'qv-faq-trigger-copy' },
          el(
            'div',
            { className: 'qv-faq-trigger-meta' },
            el('span', { className: 'qv-help-meta-cat', text: art.category }),
            el('span', {
              className: 'bv-mono-tag',
              text: art.platform === 'both' ? 'Web & Desktop' : art.platform === 'desktop' ? 'Desktop App' : 'Website',
            }),
          ),
          el('h2', { className: 'qv-faq-trigger-title', text: art.title }),
          el('p', { className: 'qv-faq-trigger-summary', text: art.summary }),
        ),
        chevronEl,
      );

      itemCard.append(headerBtn, ...(bodyEl ? [bodyEl] : []));
      faqList.appendChild(itemCard);
    }

    mainColumn.appendChild(
      el(
        'section',
        { className: 'qv-help-section' },
        el(
          'div',
          { className: 'qv-help-section-head' },
          el('h2', { className: 'qv-help-group-title', text: `Guides & Frequently Asked Questions (${filteredArticles.length})` }),
        ),
        faqList,
      ),
    );
  }

  // Collapsible Error Reference List (in-place toggle)
  if (filteredErrors.length > 0) {
    const errList = el('div', { className: 'qv-faq-accordion-list' });
    for (const err of filteredErrors) {
      const buildErrBody = () =>
        el(
          'div',
          { className: 'qv-faq-accordion-body' },
          el('p', { className: 'qv-faq-err-line', text: `Why it happens: ${err.cause}` }),
          el('p', { className: 'qv-faq-err-fix', text: `How to fix: ${err.fix}` }),
        );

      const isOpen = Boolean(q) || expandedErrorCodes.has(err.code);
      const chevronEl = el('span', { className: 'qv-faq-chevron', text: isOpen ? '−' : '+' });
      let bodyEl: HTMLElement | null = isOpen ? buildErrBody() : null;
      const errCard = el('div', {
        className: `qv-faq-accordion${isOpen ? ' is-open' : ''}`,
        id: `err-${err.code.toLowerCase()}`,
      });
      const trigger = el(
        'button',
        {
          className: `qv-faq-accordion-trigger${isOpen ? ' is-open' : ''}`,
          attrs: { type: 'button', 'aria-expanded': String(isOpen) },
          on: {
            click: () => {
              const nextOpen = !errCard.classList.contains('is-open');
              if (nextOpen) {
                expandedErrorCodes.add(err.code);
                if (!bodyEl) {
                  bodyEl = buildErrBody();
                  errCard.appendChild(bodyEl);
                }
              } else {
                expandedErrorCodes.delete(err.code);
                if (bodyEl) {
                  bodyEl.remove();
                  bodyEl = null;
                }
              }
              errCard.classList.toggle('is-open', nextOpen);
              trigger.classList.toggle('is-open', nextOpen);
              trigger.setAttribute('aria-expanded', String(nextOpen));
              chevronEl.textContent = nextOpen ? '−' : '+';
            },
          },
        },
        el(
          'div',
          { className: 'qv-faq-trigger-copy' },
          el(
            'div',
            { className: 'qv-faq-trigger-meta' },
            el('span', { className: 'qv-error-code-pill', text: err.code }),
            el('span', {
              className: 'bv-mono-tag',
              text: `${err.category} (${err.platform === 'both' ? 'Web & Desktop' : err.platform})`,
            }),
          ),
          el('h3', { className: 'qv-faq-trigger-title', text: err.title }),
        ),
        chevronEl,
      );

      errCard.append(trigger, ...(bodyEl ? [bodyEl] : []));
      errList.appendChild(errCard);
    }

    mainColumn.appendChild(
      el(
        'section',
        { className: 'qv-help-section' },
        el('h2', { className: 'qv-help-group-title', text: `Error Codes & Diagnostics (${filteredErrors.length})` }),
        errList,
      ),
    );
  }

  // Controls Reference (in-place toggle)
  if (filteredControls.length > 0) {
    const ctrlList = el('div', { className: 'qv-faq-accordion-list' });
    for (const item of filteredControls) {
      const buildCtrlBody = () =>
        el(
          'div',
          { className: 'qv-faq-accordion-body' },
          el('p', { className: 'qv-faq-err-fix', text: item.howToUse }),
        );

      const isOpen = Boolean(q) || expandedControlIds.has(item.id);
      const chevronEl = el('span', { className: 'qv-faq-chevron', text: isOpen ? '−' : '+' });
      let bodyEl: HTMLElement | null = isOpen ? buildCtrlBody() : null;
      const ctrlCard = el('div', {
        className: `qv-faq-accordion${isOpen ? ' is-open' : ''}`,
      });
      const trigger = el(
        'button',
        {
          className: `qv-faq-accordion-trigger${isOpen ? ' is-open' : ''}`,
          attrs: { type: 'button', 'aria-expanded': String(isOpen) },
          on: {
            click: () => {
              const nextOpen = !ctrlCard.classList.contains('is-open');
              if (nextOpen) {
                expandedControlIds.add(item.id);
                if (!bodyEl) {
                  bodyEl = buildCtrlBody();
                  ctrlCard.appendChild(bodyEl);
                }
              } else {
                expandedControlIds.delete(item.id);
                if (bodyEl) {
                  bodyEl.remove();
                  bodyEl = null;
                }
              }
              ctrlCard.classList.toggle('is-open', nextOpen);
              trigger.classList.toggle('is-open', nextOpen);
              trigger.setAttribute('aria-expanded', String(nextOpen));
              chevronEl.textContent = nextOpen ? '−' : '+';
            },
          },
        },
        el(
          'div',
          { className: 'qv-faq-trigger-copy' },
          el(
            'div',
            { className: 'qv-faq-trigger-meta' },
            el('span', { className: 'bv-control-type-pill', text: item.controlType }),
            el('span', { className: 'bv-mono-tag', text: `${item.category} (${item.location})` }),
          ),
          el('h3', { className: 'qv-faq-trigger-title', text: item.name }),
          el('p', { className: 'qv-faq-trigger-summary', text: item.summary }),
        ),
        chevronEl,
      );

      ctrlCard.append(trigger, ...(bodyEl ? [bodyEl] : []));
      ctrlList.appendChild(ctrlCard);
    }

    mainColumn.appendChild(
      el(
        'section',
        { className: 'qv-help-section' },
        el('h2', { className: 'qv-help-group-title', text: `Controls, Sliders & Buttons (${filteredControls.length})` }),
        ctrlList,
      ),
    );
  }

  // Official File Formats Reference Table
  if (showFormats) {
    const extTable = el('div', { className: 'qv-help-format-list' });
    for (const item of QUILLVIBE_EXTENSIONS) {
      extTable.appendChild(
        el(
          'div',
          { className: 'qv-help-format-row' },
          el('code', { className: 'qv-help-format-ext', text: item.extension }),
          el(
            'div',
            { className: 'qv-help-format-meta' },
            el('strong', { text: item.name }),
            el('span', { className: 'bv-label', text: item.purpose }),
          ),
        ),
      );
    }
    mainColumn.appendChild(
      el(
        'section',
        { className: 'qv-help-section' },
        el('h2', { className: 'qv-help-group-title', text: 'Official Quillvibe File Formats' }),
        extTable,
      ),
    );
  }

  // Calm Support Footer
  mainColumn.appendChild(
    el(
      'footer',
      { className: 'qv-help-footer' },
      el('strong', { text: 'Need direct help or spotted an issue?' }),
      el('p', {
        className: 'bv-label',
        text: 'Send bug reports (with any QV-xxx code), suggestions, or security inquiries directly to quillvibe@jhonrey.com.',
        style: { margin: '4px 0 0' },
      }),
    ),
  );

  container.appendChild(
    el(
      'div',
      { className: 'qv-help-page' },
      el('div', { className: 'qv-help-layout' }, categoryRail, mainColumn),
    ),
  );
  restoreScroll();
}
