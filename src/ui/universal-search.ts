import type { AppActions, AppState } from '../core/app-context';
import { isTauriRuntime } from '../core/bridge';
import { getAllScenes } from '../core/manuscript';
import { isTierAtLeast } from '../core/settings';
import type { AppThemeId, ToolTier } from '../core/types';
import { setCoursePageSelection } from '../views/course-page';
import { HELP_FAQ_ARTICLES, setHelpPageArticle, setHelpPageSearch } from '../views/help-page';
import { CONTROL_REFERENCE_ITEMS } from './controls-catalog';
import { COURSE_MODULES } from './course';
import { clearNode, el, icon, type IconName } from './dom';
import { QUILLVIBE_ERROR_CATALOG } from './error-dialog';

type SearchScope = 'all' | 'tools' | 'course' | 'help' | 'book';
export type SearchRuntimePlatform = 'desktop-app' | 'desktop-web' | 'mobile-web';

export interface SearchEnvironment {
  platform: SearchRuntimePlatform;
  tier: ToolTier;
}

export function detectSearchEnvironment(state: AppState): SearchEnvironment {
  const desktopApp = isTauriRuntime();
  const mobileWeb = !desktopApp && typeof window !== 'undefined' && window.innerWidth <= 768;
  const platform: SearchRuntimePlatform = desktopApp
    ? 'desktop-app'
    : mobileWeb
      ? 'mobile-web'
      : 'desktop-web';
  const tier: ToolTier = platform === 'mobile-web' ? 'basic' : state.settings.toolTier;
  return { platform, tier };
}

function matchesPlatformList(
  allowed: 'both' | 'web' | 'desktop' | readonly SearchRuntimePlatform[],
  platform: SearchRuntimePlatform,
): boolean {
  if (Array.isArray(allowed)) {
    return allowed.includes(platform);
  }
  if (allowed === 'both') return true;
  if (allowed === 'desktop') return platform === 'desktop-app';
  return platform !== 'desktop-app';
}

const MODULE_PLATFORM_RULES: Partial<Record<string, 'both' | 'web' | 'desktop'>> = {
  'mod-desktop': 'desktop',
  'mod-cs-deep-2': 'desktop',
  'mod-web-browser': 'web',
  'mod-desktop-tabs': 'desktop',
  'mod-desktop-os': 'desktop',
};

const HELP_ARTICLE_MIN_TIER: Record<string, ToolTier> = {
  'start-welcome': 'basic',
  'manuscript-proofread': 'intermediate',
  'manuscript-images': 'basic',
  'corkboard-outline-bible-graph': 'intermediate',
  'typeset-cover-studio': 'intermediate',
  'cover-studio-pro-faq': 'advanced',
  'locks-linked-themes-outline': 'basic',
  'formats-keys-migrate': 'basic',
  'desktop-tabs-windows': 'basic',
  'web-vs-desktop': 'basic',
};

const ERROR_CODE_MIN_TIER: Record<string, ToolTier> = {
  'QV-401': 'advanced',
};

const CONTROL_RULES: Record<
  string,
  { minTier: ToolTier; platform: 'both' | 'web' | 'desktop' | readonly SearchRuntimePlatform[] }
> = {
  'ctrl-logo': { minTier: 'basic', platform: 'both' },
  'ctrl-binder-toggle': { minTier: 'basic', platform: 'both' },
  'ctrl-title-input': { minTier: 'basic', platform: 'both' },
  'ctrl-workspace-switcher': { minTier: 'intermediate', platform: ['desktop-app', 'desktop-web'] },
  'ctrl-library-btn': { minTier: 'basic', platform: 'both' },
  'ctrl-collab-btn': { minTier: 'advanced', platform: 'both' },
  'ctrl-open-btn': { minTier: 'basic', platform: 'both' },
  'ctrl-save-split': { minTier: 'basic', platform: 'both' },
  'ctrl-extensions-btn': { minTier: 'advanced', platform: 'both' },
  'ctrl-settings-btn': { minTier: 'basic', platform: 'both' },
  'ctrl-help-btn': { minTier: 'basic', platform: 'both' },
  'ctrl-inspector-toggle': { minTier: 'basic', platform: 'both' },
  'ctrl-window-chrome': { minTier: 'basic', platform: 'desktop' },
  'ctrl-word-ledger': { minTier: 'basic', platform: 'both' },
  'ctrl-sprint-duration': { minTier: 'basic', platform: 'both' },
  'ctrl-sprint-start': { minTier: 'basic', platform: 'both' },
  'ctrl-sprint-reset': { minTier: 'basic', platform: 'both' },
  'ctrl-editor-modes': { minTier: 'intermediate', platform: 'both' },
  'ctrl-format-buttons': { minTier: 'basic', platform: 'both' },
  'ctrl-paper-theme': { minTier: 'basic', platform: 'both' },
  'ctrl-typewriter-zen-snap': { minTier: 'intermediate', platform: 'both' },
  'ctrl-proofread-marks': { minTier: 'intermediate', platform: 'both' },
  'ctrl-corkboard-outline': { minTier: 'intermediate', platform: 'both' },
  'ctrl-bible-tools': { minTier: 'advanced', platform: 'both' },
  'ctrl-graph-toolbar': { minTier: 'advanced', platform: 'both' },
  'ctrl-graph-canvas': { minTier: 'advanced', platform: 'both' },
  'ctrl-typeset-controls': { minTier: 'intermediate', platform: 'both' },
  'ctrl-cover-studio': { minTier: 'advanced', platform: 'both' },
  'ctrl-settings-fonts': { minTier: 'basic', platform: 'both' },
  'ctrl-settings-sliders-levers': { minTier: 'basic', platform: 'both' },
  'ctrl-settings-migration': { minTier: 'basic', platform: 'both' },
  'ctrl-settings-dev': { minTier: 'basic', platform: 'both' },
};

export interface SearchResultItem {
  id: string;
  group: 'Tools & Workspaces' | 'Book Writing Course' | 'Help, FAQ & Errors' | 'Manuscript & Story Bible' | 'Manuscript';
  scope: Exclude<SearchScope, 'all'>;
  iconName: IconName;
  title: string;
  subtitle: string;
  badge: string;
  searchText: string;
  scoreBoost: number;
  run: () => void;
}

const MODAL_ID = 'qv-universal-search-modal';

function openCourseTarget(actions: AppActions, moduleId?: string, lessonId?: string): void {
  setCoursePageSelection(moduleId, lessonId);
  actions.setState({ activeView: 'course' }, true);
}

function openHelpTarget(actions: AppActions, options: { articleId?: string; query?: string }): void {
  if (options.articleId) {
    setHelpPageArticle(options.articleId);
  } else if (options.query) {
    setHelpPageSearch(options.query);
  }
  actions.setState({ activeView: 'help' }, true);
}

export function buildSearchCorpus(
  actions: AppActions,
  state: AppState,
  envOverride?: SearchEnvironment,
): SearchResultItem[] {
  const items: SearchResultItem[] = [];
  const { platform, tier: activeTier } = envOverride ?? detectSearchEnvironment(state);
  const bookGroupLabel: SearchResultItem['group'] =
    isTierAtLeast(activeTier, 'advanced') ? 'Manuscript & Story Bible' : 'Manuscript';

  // 1. Studio Tools, Views & Quick Actions filtered strictly by workspace layout & runtime platform
  const toolEntries: Array<{
    id: string;
    iconName: IconName;
    title: string;
    subtitle: string;
    badge: string;
    keywords: string;
    minTier: ToolTier;
    platforms?: 'both' | 'web' | 'desktop' | readonly SearchRuntimePlatform[];
    boost?: number;
    run: () => void;
  }> = [
    {
      id: 'tool-editor',
      iconName: 'quill',
      title: 'Manuscript Writing Sheet',
      subtitle: isTierAtLeast(activeTier, 'intermediate')
        ? 'Draft chapters, toggle Proofread marks, Split View, and Revision Diff.'
        : 'Draft chapters with rich formatting, fonts, alignment, and scene breaks.',
      badge: 'Workspace',
      keywords: isTierAtLeast(activeTier, 'intermediate')
        ? 'write draft manuscript scene proofread split diff'
        : 'write draft manuscript scene format bold italic font',
      minTier: 'basic',
      platforms: 'both',
      boost: 15,
      run: () => actions.setState({ activeView: 'editor' }, true),
    },
    {
      id: 'tool-corkboard',
      iconName: 'corkboard',
      title: 'Corkboard Scene Cards',
      subtitle: 'Arrange scenes visually and track scene word targets.',
      badge: 'Editorial',
      keywords: 'corkboard cards synopsis index arrange reorder',
      minTier: 'intermediate',
      platforms: 'both',
      boost: 12,
      run: () => actions.setState({ activeView: 'corkboard' }, true),
    },
    {
      id: 'tool-outline',
      iconName: 'outline',
      title: 'Outline Ledger',
      subtitle: 'Filter scenes by POV, status, timeline, location, or export CSV.',
      badge: 'Editorial',
      keywords: 'outline ledger table csv pacing status pov timeline',
      minTier: 'intermediate',
      platforms: 'both',
      boost: 12,
      run: () => actions.setState({ activeView: 'outline' }, true),
    },
    {
      id: 'tool-bible',
      iconName: 'bible',
      title: 'Story Bible',
      subtitle: 'Manage Characters, Locations, Lore, Portraits, and custom world shelves.',
      badge: 'Full Studio',
      keywords: 'story bible characters locations lore worldbuilding wiki',
      minTier: 'advanced',
      platforms: 'both',
      boost: 12,
      run: () => actions.setState({ activeView: 'bible' }, true),
    },
    {
      id: 'tool-graph',
      iconName: 'graph',
      title: 'Story Graph',
      subtitle: 'Spatial Storyboard & 60 FPS Force Graph synced to your book.',
      badge: 'Full Studio',
      keywords: 'story graph nodes canvas storyboard force mindmap',
      minTier: 'advanced',
      platforms: 'both',
      boost: 12,
      run: () => actions.setState({ activeView: 'graph' }, true),
    },
    {
      id: 'tool-typeset',
      iconName: 'typeset',
      title: 'Interior Typeset (Print PDF & EPUB 3)',
      subtitle: 'Configure trim size, margins, drop caps, running headers, and typography.',
      badge: 'Editorial',
      keywords: 'typeset print pdf epub trim font margin drop cap interior',
      minTier: 'intermediate',
      platforms: 'both',
      boost: 12,
      run: () => actions.setState({ activeView: 'typeset', typesetSubTab: 'interior' }, true),
    },
    {
      id: 'tool-cover',
      iconName: 'cover',
      title: 'Book Cover Studio',
      subtitle: 'Design front, spine, back, and dust-jacket wraps with PNG/SVG/PDF export.',
      badge: 'Full Studio',
      keywords: 'book cover studio spine jacket wrap vector svg png qvdesign',
      minTier: 'advanced',
      platforms: 'both',
      boost: 13,
      run: () => actions.setState({ activeView: 'typeset', typesetSubTab: 'cover' }, true),
    },
    {
      id: 'tool-publish',
      iconName: 'printer',
      title: 'Publish, Seals & Archive Export',
      subtitle: 'Export Print PDF, EPUB 3, .docx, .qv archive, ISBN, and Copyright Seals.',
      badge: 'Publishing',
      keywords: 'publish export docx pdf epub qv isbn seal copyright key',
      minTier: 'intermediate',
      platforms: 'both',
      boost: 11,
      run: () => actions.setState({ activeView: 'typeset', typesetSubTab: 'publish' }, true),
    },
    {
      id: 'tool-library',
      iconName: 'library',
      title: 'Book Library & Author Identity',
      subtitle: 'Switch books, create a new book, or configure Pen Name & Author Key.',
      badge: 'Modal',
      keywords: 'library switch book create new author key pen name signature',
      minTier: 'basic',
      platforms: 'both',
      boost: 11,
      run: () => actions.openLibraryModal(),
    },
    {
      id: 'tool-collab',
      iconName: 'collab',
      title: 'Collaborate Offline & Co-Authors',
      subtitle:
        platform === 'desktop-app'
          ? 'Manage co-author roles, proofreader permissions, and LAN / Bluetooth sync.'
          : 'Manage co-author roles, proofreader permissions, and signed collaborator packages.',
      badge: 'Full Studio',
      keywords: 'collaborate wifi bluetooth pin co-author proofreader permissions sync',
      minTier: 'advanced',
      platforms: 'both',
      boost: 10,
      run: () => actions.openCollabModal(),
    },
    {
      id: 'tool-course',
      iconName: 'course',
      title: 'Quillvibe Academy (Book Writing Course)',
      subtitle: 'Guided modules for craft, drafting, and publishing.',
      badge: 'Academy',
      keywords: 'course academy lessons learn writing dialogue pacing tutorial',
      minTier: 'basic',
      platforms: 'both',
      boost: 12,
      run: () => openCourseTarget(actions),
    },
    {
      id: 'tool-help',
      iconName: 'help',
      title: 'Help Center, FAQ & Error Codes',
      subtitle: 'Browse guides, QV error diagnostics, and file format help.',
      badge: 'Help',
      keywords: 'help faq support error code qv manual troubleshooting',
      minTier: 'basic',
      platforms: 'both',
      boost: 12,
      run: () => actions.setState({ activeView: 'help' }, true),
    },
    {
      id: 'tool-settings',
      iconName: 'settings',
      title:
        platform === 'desktop-app'
          ? 'Settings, Layouts, Fonts & Updates'
          : 'Settings, Layouts & Fonts',
      subtitle:
        platform === 'desktop-app'
          ? 'Change theme, Workspace Layout, custom fonts (.ttf/.otf/.woff2), or check updates.'
          : 'Change theme, Workspace Layout, custom fonts (.ttf/.otf/.woff2), or backup archives.',
      badge: 'Settings',
      keywords:
        platform === 'desktop-app'
          ? 'settings preferences theme dark light parchment ivory fonts updates layout'
          : 'settings preferences theme dark light parchment ivory fonts layout backup',
      minTier: 'basic',
      platforms: 'both',
      boost: 11,
      run: () => actions.setState({ activeView: 'settings' }, true),
    },
    {
      id: 'tool-extensions',
      iconName: 'extensions',
      title: 'Extensions & Official .qv* Formats',
      subtitle: 'Inspect .qv / .qvbible / .qvscene / .qvstyle / .qvdesign or load .qvext packs.',
      badge: 'Formats',
      keywords: 'extensions qvext formats qv qvbible qvscene qvstyle qvdesign',
      minTier: 'advanced',
      platforms: 'both',
      boost: 9,
      run: () => actions.setState({ activeView: 'extensions' }, true),
    },
    {
      id: 'tool-theme',
      iconName: 'palette',
      title: 'Switch Theme (System / Ivory / Parchment / Obsidian)',
      subtitle: 'Cycle through Quillvibe paper and studio color themes smoothly.',
      badge: 'Action',
      keywords: 'theme dark mode light mode ivory parchment obsidian switch cycle',
      minTier: 'basic',
      platforms: 'both',
      boost: 10,
      run: () => {
        const order: AppThemeId[] = ['system', 'ivory', 'parchment', 'obsidian'];
        const cur = actions.getState().settings.appTheme;
        const next = order[(order.indexOf(cur) + 1) % order.length];
        actions.updateSettings({ appTheme: next });
        actions.notify(`Theme: ${next}`);
      },
    },
    {
      id: 'tool-open-file',
      iconName: 'folder',
      title: 'Open .qv / .qvscene / .qvext File',
      subtitle: 'Load a saved Quillvibe file from your device (Ctrl+O).',
      badge: 'Ctrl+O',
      keywords: 'open file load import qv qvbible qvscene',
      minTier: 'basic',
      platforms: 'both',
      boost: 8,
      run: () => void actions.openAnyQuillvibeFile(),
    },
    {
      id: 'tool-landing',
      iconName: 'book',
      title: 'Overview & Landing Page',
      subtitle: 'View Quillvibe features overview, README links, and desktop downloads.',
      badge: 'Home',
      keywords: 'landing home overview download windows mac linux readme open source',
      minTier: 'basic',
      platforms: 'web',
      boost: 8,
      run: () => actions.setState({ activeView: 'landing' }, true),
    },
    {
      id: 'tool-new-window',
      iconName: 'window-new',
      title: 'Open Book Tab in New Desktop Window',
      subtitle: 'Open a fresh desktop window to edit series books side by side.',
      badge: 'Desktop',
      keywords: 'new window tab detach combine merge windows desktop',
      minTier: 'basic',
      platforms: 'desktop',
      boost: 8,
      run: () => void actions.openNewWindow(),
    },
  ];

  for (const t of toolEntries) {
    if (!isTierAtLeast(activeTier, t.minTier)) continue;
    if (!matchesPlatformList(t.platforms ?? 'both', platform)) continue;
    items.push({
      id: t.id,
      group: 'Tools & Workspaces',
      scope: 'tools',
      iconName: t.iconName,
      title: t.title,
      subtitle: t.subtitle,
      badge: t.badge,
      searchText: `${t.title} ${t.subtitle} ${t.keywords}`.toLowerCase(),
      scoreBoost: t.boost ?? 10,
      run: t.run,
    });
  }

  // 2. Book Writing Course Modules & Lessons filtered strictly by workspace layout & platform
  for (const mod of COURSE_MODULES) {
    const modPlat = mod.platform ?? MODULE_PLATFORM_RULES[mod.id] ?? 'both';
    if (!matchesPlatformList(modPlat, platform)) continue;
    for (const lesson of mod.lessons) {
      if (!isTierAtLeast(activeTier, lesson.minTier)) continue;
      items.push({
        id: `course-${lesson.id}`,
        group: 'Book Writing Course',
        scope: 'course',
        iconName: 'course',
        title: lesson.title,
        subtitle: `Module ${mod.number}: ${mod.title} — ${lesson.instruction}`,
        badge: `${lesson.durationMin}m`,
        searchText: `${mod.title} ${lesson.title} ${lesson.instruction} ${lesson.objective} ${lesson.proTip} ${lesson.minTier}`.toLowerCase(),
        scoreBoost: 7,
        run: () => openCourseTarget(actions, mod.id, lesson.id),
      });
    }
  }

  // 3. Help Articles, Error Codes & Controls filtered by active workspace layout & platform
  for (const art of HELP_FAQ_ARTICLES) {
    const reqTier = HELP_ARTICLE_MIN_TIER[art.id] ?? 'basic';
    if (!isTierAtLeast(activeTier, reqTier)) continue;
    if (!matchesPlatformList(art.platform, platform)) continue;
    items.push({
      id: `help-${art.id}`,
      group: 'Help, FAQ & Errors',
      scope: 'help',
      iconName: 'help',
      title: art.title,
      subtitle: art.summary,
      badge: art.category,
      searchText: `${art.title} ${art.category} ${art.summary} ${art.keywords} ${art.details.join(' ')}`.toLowerCase(),
      scoreBoost: 8,
      run: () => openHelpTarget(actions, { articleId: art.id }),
    });
  }

  for (const err of QUILLVIBE_ERROR_CATALOG) {
    const reqTier = ERROR_CODE_MIN_TIER[err.code] ?? 'basic';
    if (!isTierAtLeast(activeTier, reqTier)) continue;
    if (!matchesPlatformList(err.platform, platform)) continue;
    items.push({
      id: `err-${err.code}`,
      group: 'Help, FAQ & Errors',
      scope: 'help',
      iconName: 'shield',
      title: `${err.code}: ${err.title}`,
      subtitle: err.fix,
      badge: err.category,
      searchText: `${err.code} ${err.title} ${err.category} ${err.cause} ${err.fix}`.toLowerCase(),
      scoreBoost: 9,
      run: () => openHelpTarget(actions, { query: err.code }),
    });
  }

  for (const ctrl of CONTROL_REFERENCE_ITEMS) {
    const rule = CONTROL_RULES[ctrl.id] ?? { minTier: 'basic' as ToolTier, platform: 'both' as const };
    if (!isTierAtLeast(activeTier, rule.minTier)) continue;
    if (!matchesPlatformList(rule.platform, platform)) continue;
    items.push({
      id: `ctrl-${ctrl.id}`,
      group: 'Help, FAQ & Errors',
      scope: 'help',
      iconName: 'settings',
      title: ctrl.name,
      subtitle: `${ctrl.location} — ${ctrl.summary}`,
      badge: ctrl.controlType,
      searchText: `${ctrl.name} ${ctrl.category} ${ctrl.location} ${ctrl.summary} ${ctrl.keywords}`.toLowerCase(),
      scoreBoost: 5,
      run: () => openHelpTarget(actions, { query: ctrl.name }),
    });
  }

  // 4. Current Book Chapters, Scenes & Story Bible Entries
  const scenes = getAllScenes(state.project);
  for (const ref of scenes) {
    const snippet = ref.scene.synopsis?.trim() || ref.scene.content.slice(0, 110).replace(/\s+/g, ' ').trim();
    items.push({
      id: `scene-${ref.scene.id}`,
      group: bookGroupLabel,
      scope: 'book',
      iconName: 'draft-sheet',
      title: ref.scene.title || 'Untitled Scene',
      subtitle: `${ref.chapter.title} — ${snippet || 'Empty scene draft'}`,
      badge: ref.scene.status.toUpperCase(),
      searchText: `${ref.part.title} ${ref.chapter.title} ${ref.scene.title} ${ref.scene.synopsis} ${ref.scene.pov} ${ref.scene.location} ${ref.scene.content.slice(0, 1500)}`.toLowerCase(),
      scoreBoost: 9,
      run: () => actions.selectScene(ref.scene.id, true),
    });
  }

  if (isTierAtLeast(activeTier, 'advanced')) {
    for (const ch of state.project.bible.characters) {
      items.push({
        id: `bible-char-${ch.id}`,
        group: bookGroupLabel,
        scope: 'book',
        iconName: 'bible',
        title: ch.name,
        subtitle: `${ch.role || 'Character'} — ${ch.motivation || ch.notes || ''}`.trim(),
        badge: 'Character',
        searchText: `${ch.name} ${ch.aliases} ${ch.role} ${ch.motivation} ${ch.appearance} ${ch.notes}`.toLowerCase(),
        scoreBoost: 8,
        run: () => actions.openBibleEntry('characters', ch.id),
      });
    }

    for (const loc of state.project.bible.locations) {
      items.push({
        id: `bible-loc-${loc.id}`,
        group: bookGroupLabel,
        scope: 'book',
        iconName: 'bible',
        title: loc.name,
        subtitle: `${loc.region || 'Location'} — ${loc.atmosphere || loc.notes || ''}`.trim(),
        badge: 'Location',
        searchText: `${loc.name} ${loc.region} ${loc.atmosphere} ${loc.notes}`.toLowerCase(),
        scoreBoost: 8,
        run: () => actions.openBibleEntry('locations', loc.id),
      });
    }

    for (const lore of state.project.bible.lore) {
      items.push({
        id: `bible-lore-${lore.id}`,
        group: bookGroupLabel,
        scope: 'book',
        iconName: 'bible',
        title: lore.name,
        subtitle: `${lore.category || 'Lore'} — ${lore.summary || lore.notes || ''}`.trim(),
        badge: 'Lore',
        searchText: `${lore.name} ${lore.category} ${lore.summary} ${lore.notes}`.toLowerCase(),
        scoreBoost: 8,
        run: () => actions.openBibleEntry('lore', lore.id),
      });
    }

    for (const custom of state.project.bible.customEntries ?? []) {
      items.push({
        id: `bible-custom-${custom.id}`,
        group: bookGroupLabel,
        scope: 'book',
        iconName: 'bible',
        title: custom.name,
        subtitle: custom.subtitle || custom.summary || custom.notes || 'Story Bible Entry',
        badge: 'Bible',
        searchText: `${custom.name} ${custom.subtitle} ${custom.summary} ${custom.notes}`.toLowerCase(),
        scoreBoost: 8,
        run: () => actions.openBibleEntry(custom.categoryId, custom.id),
      });
    }
  }

  return items;
}

function scoreMatch(item: SearchResultItem, query: string): number {
  if (!query) return item.scoreBoost;
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return item.scoreBoost;

  const titleLower = item.title.toLowerCase();
  if (!terms.every((t) => item.searchText.includes(t))) {
    return -1;
  }

  let score = item.scoreBoost;
  if (titleLower === query.toLowerCase()) score += 45;
  else if (titleLower.startsWith(query.toLowerCase())) score += 28;
  for (const term of terms) {
    if (titleLower.includes(term)) score += 14;
  }
  return score;
}

export function openUniversalSearch(actions: AppActions, getState: () => AppState): void {
  const existing = document.getElementById(MODAL_ID);
  if (existing) {
    existing.remove();
    return;
  }

  const curState = getState();
  const env = detectSearchEnvironment(curState);
  const corpus = buildSearchCorpus(actions, curState, env);
  let activeScope: SearchScope = 'all';
  let query = '';
  let activeIndex = 0;
  let visibleResults: SearchResultItem[] = [];

  const backdrop = el('div', {
    className: 'bv-modal-backdrop qv-usearch-backdrop',
    id: MODAL_ID,
    attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Universal Search' },
  });

  const closeModal = () => {
    window.removeEventListener('keydown', onModalKey, true);
    backdrop.remove();
  };

  backdrop.addEventListener('pointerdown', (e) => {
    if (e.target === backdrop) closeModal();
  });
  backdrop.addEventListener('bv-close-modal', closeModal);

  const searchPlaceholder =
    env.tier === 'advanced'
      ? 'Search tools, courses, FAQs, error codes, scenes, or Story Bible…'
      : env.tier === 'intermediate'
        ? 'Search Editorial tools, courses, FAQs, error codes, or scenes…'
        : 'Search Focused tools, courses, FAQs, error codes, or scenes…';

  const searchInput = el('input', {
    className: 'qv-usearch-input',
    attrs: {
      type: 'search',
      autocomplete: 'off',
      autocorrect: 'off',
      autocapitalize: 'off',
      spellcheck: 'false',
      placeholder: searchPlaceholder,
      'aria-label': 'Search within active Quillvibe workspace',
    },
  });

  const scopeBar = el('div', { className: 'qv-usearch-scopes' });
  const resultsEl = el('div', { className: 'qv-usearch-results', attrs: { role: 'listbox' } });
  const footerHint = el('div', {
    className: 'qv-usearch-footer',
    text: '↑↓ Select | Enter Open | Esc Close',
  });

  const renderScopes = () => {
    clearNode(scopeBar);
    const scopes: Array<{ id: SearchScope; label: string }> = [
      { id: 'all', label: 'All' },
      { id: 'tools', label: 'Tools' },
      { id: 'course', label: 'Courses' },
      { id: 'help', label: 'Help & FAQ' },
      { id: 'book', label: 'Current Book' },
    ];
    for (const s of scopes) {
      scopeBar.appendChild(
        el('button', {
          className: `bv-mini-btn${activeScope === s.id ? ' is-active' : ''}`,
          text: s.label,
          attrs: { type: 'button' },
          on: {
            click: () => {
              activeScope = s.id;
              activeIndex = 0;
              renderResults();
              renderScopes();
              searchInput.focus();
            },
          },
        }),
      );
    }
  };

  const executeItem = (item: SearchResultItem) => {
    closeModal();
    item.run();
  };

  const renderResults = () => {
    clearNode(resultsEl);
    const trimmed = query.trim();
    const scored: Array<{ item: SearchResultItem; score: number }> = [];
    for (const item of corpus) {
      if (activeScope !== 'all' && item.scope !== activeScope) continue;
      const sc = scoreMatch(item, trimmed);
      if (sc >= 0) scored.push({ item, score: sc });
    }
    scored.sort((a, b) => b.score - a.score);
    visibleResults = scored.slice(0, trimmed ? 36 : 16).map((s) => s.item);

    if (visibleResults.length === 0) {
      resultsEl.appendChild(
        el(
          'div',
          { className: 'qv-usearch-empty' },
          el('strong', { text: `No matches for “${trimmed}”` }),
          el('p', {
            className: 'bv-label',
            text:
              env.tier === 'advanced'
                ? 'Try a scene title, Cover Studio, QV-102, .qvdesign, or Story Bible name.'
                : env.tier === 'intermediate'
                  ? 'Try a scene title, Corkboard, Typeset, QV-102, or Settings.'
                  : 'Try a scene title, Font, QV-102, Settings, or Course lesson.',
          }),
        ),
      );
      return;
    }

    if (activeIndex >= visibleResults.length) {
      activeIndex = 0;
    }

    let lastGroup = '';
    visibleResults.forEach((item, idx) => {
      if (item.group !== lastGroup) {
        lastGroup = item.group;
        resultsEl.appendChild(
          el('div', { className: 'qv-usearch-group-label', text: lastGroup }),
        );
      }

      const row = el(
        'button',
        {
          className: `qv-usearch-row${idx === activeIndex ? ' is-selected' : ''}`,
          attrs: {
            type: 'button',
            role: 'option',
            'aria-selected': String(idx === activeIndex),
          },
          on: {
            mouseenter: () => {
              activeIndex = idx;
              const rows = resultsEl.querySelectorAll('.qv-usearch-row');
              rows.forEach((r, rIdx) => r.classList.toggle('is-selected', rIdx === idx));
            },
            click: () => executeItem(item),
          },
        },
        el('span', { className: 'qv-usearch-row-icon' }, icon(item.iconName, 15)),
        el(
          'div',
          { className: 'qv-usearch-row-copy' },
          el('div', { className: 'qv-usearch-row-title', text: item.title }),
          el('div', { className: 'qv-usearch-row-sub', text: item.subtitle }),
        ),
        el('span', { className: 'bv-mono-tag qv-usearch-row-badge', text: item.badge }),
      );
      resultsEl.appendChild(row);
    });
  };

  function onModalKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      closeModal();
      return;
    }
    if (visibleResults.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      activeIndex = (activeIndex + 1) % visibleResults.length;
      renderResults();
      resultsEl.querySelector('.qv-usearch-row.is-selected')?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeIndex = (activeIndex - 1 + visibleResults.length) % visibleResults.length;
      renderResults();
      resultsEl.querySelector('.qv-usearch-row.is-selected')?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
      const target = visibleResults[activeIndex];
      if (target) {
        e.preventDefault();
        executeItem(target);
      }
    }
  }

  searchInput.addEventListener('input', () => {
    query = searchInput.value;
    activeIndex = 0;
    renderResults();
  });

  const panel = el(
    'div',
    { className: 'qv-usearch-dialog' },
    el(
      'div',
      { className: 'qv-usearch-input-wrap' },
      icon('search', 16),
      searchInput,
      el('button', {
        className: 'bv-mini-btn',
        text: 'Esc',
        attrs: { type: 'button', 'aria-label': 'Close Search' },
        on: { click: closeModal },
      }),
    ),
    scopeBar,
    resultsEl,
    footerHint,
  );

  backdrop.appendChild(panel);
  document.body.appendChild(backdrop);
  window.addEventListener('keydown', onModalKey, true);
  renderScopes();
  renderResults();
  requestAnimationFrame(() => searchInput.focus());
}
