import './styles/main.css';

import { AlarmController, playRingtonePreview } from './core/alarm';
import type { AppActions, AppState, ExtensionsModalTab } from './core/app-context';
import {
  closeDesktopWindow,
  closeDesktopWindowByLabel,
  exportBookAsDocx,
  exportBookAsEpub,
  exportBookAsHtml,
  exportBookAsMarkdown,
  exportBookAsPdf,
  exportBookAsPlainText,
  exportCoverPngDownload,
  focusDesktopWindow,
  getDesktopWindowLabel,
  getStartupOpenedFile,
  importLegacyBookFile,
  isDesktopWindowMaximized,
  isTauriRuntime,
  listenDesktopOpenFile,
  loadDefaultExportFormat,
  loadPersistedLibrary,
  loadPersistedProject,
  minimizeDesktopWindow,
  openBookInNewDesktopWindow,
  openQuillvibeFile,
  persistLibrary,
  persistProject,
  readPickedBrowserFile,
  saveDefaultExportFormat,
  saveQuillvibeExtensionFile,
  setDesktopFullscreen,
  setDesktopWindowTitle,
  startDesktopWindowDrag,
  toggleMaximizeDesktopWindow,
} from './core/bridge';
import { QuillvibeCodecError } from './core/codec';
import { getActiveSessionPermissions } from './core/collab';
import { renderCoverToPngDataUrl, renderFullWrapToPngDataUrl } from './core/cover';
import {
  applySmartTypography,
  computeBookPagination,
  EXPORT_FORMAT_OPTIONS,
  TRIM_SPECS,
} from './core/export';
import {
  applyOpenedExtensionFile,
  extractAnyImportableExtensionFromFilename,
  extractExtensionFromFilename,
  isLegacyImportExtension,
  parseQuillvibeInput,
  safeJsonParse,
  serializeExtensionFile,
  serializeQuillvibeBinary,
} from './core/extensions';
import { ProjectHistoryStack } from './core/history';
import { TabDragController } from './core/tab-drag-controller';
import { TabManager } from './core/tab-manager';
import { loadCustomFonts } from './core/fonts';
import { COLLABORATOR_ROLE_LABELS } from './core/collab';
import { resolveEffectiveFontCss } from './core/fonts';
import { ensureAuthorIdentity, stripPrivateAuthorSecrets } from './core/identity';
import {
  addBookToLibrary,
  createEmptyBookProject,
  createInitialLibrary,
  getActiveBookFromLibrary,
  normalizeProjectDefaults,
  sortLibraryBooksByLatest,
  switchActiveBook,
  upsertBookInLibrary,
} from './core/library';
import {
  countCharacters,
  countWords,
  estimateReadingMinutes,
  estimateStandardPages,
  findSceneContext,
  getAllScenes,
  getChapterWordCount,
  getProjectWordCount,
  updateSceneInProject,
} from './core/manuscript';
import { importAnyExternalDocumentFile } from './core/migrate';
import { realignMarksAfterEdit } from './core/proofread';
import {
  readInitialBrowserRoute,
  routeForState,
  syncBrowserPath,
} from './core/router';
import {
  createStarterBookProject,
  isLocalDevMockEnabled,
} from './core/sample-book';
import {
  DEFAULT_SETTINGS,
  applySettingsToDocument,
  formatAppWindowTitle,
  formatWorkspaceLayoutName,
  loadSettings,
  mapAppThemeToPaperTheme,
  mapPaperThemeToAppTheme,
  saveSettings,
} from './core/settings';
import { createSnapshotForScene } from './core/snapshots';
import {
  COURSE_TAB_ID,
  EMPTY_TAB_PREFIX,
  EXTENSIONS_TAB_ID,
  HELP_TAB_ID,
  MANUAL_TAB_ID,
  SETTINGS_TAB_ID,
  WorkspaceWindowSync,
  createEmptyTabId,
  isEmptyTabId,
  isNonBookTabId,
  isSpecialPageTabId,
} from './core/window-sync';
import type {
  AppThemeId,
  BookLibraryState,
  BookProject,
  ExportFormatId,
  OpenedFileResult,
  QuillvibeExtension,
  QuillvibeSettings,
  StudioViewId,
  ToolTier,
} from './core/types';
import { attachContextMenu, hideContextMenu } from './ui/context-menu';
import { openInteractiveCourseDrawer } from './ui/course';
import { clearNode, createMorphThemeIcon, el, icon, quillvibeLogo, svgEl } from './ui/dom';
import { installGlobalErrorHandlers, showErrorDialog } from './ui/error-dialog';
import { mountImmersiveHud, type ImmersiveHudHandle } from './ui/immersive-hud';
import { LiquidGlassControl, mountGlobalControlGlass } from './ui/liquid-glass';
import {
  destroyActiveTour,
  maybeRunFirstLaunchSplash,
  maybeStartSectionTour,
  replayFullWalkthrough,
} from './ui/onboarding';
import { createVerticalResizer } from './ui/resizer';
import { attachTooltip, hideTooltip, updateTooltip, type TooltipSpec } from './ui/tooltip';
import { TOOLTIP_CATALOG } from './ui/tooltips-catalog';
import { openUniversalSearch } from './ui/universal-search';
import { renderBibleView } from './views/bible';
import { renderBinder } from './views/binder';
import { showCollabModal } from './views/collab-modal';
import { renderCorkboardView } from './views/corkboard';
import { renderCoursePageView, setCoursePageSelection } from './views/course-page';
import { renderDeveloperPageView } from './views/developer-page';
import { renderEditorView } from './views/editor';
import { renderExtensionsPageView, setExtensionsPageOptions } from './views/extensions-modal';
import { renderGraphView } from './views/graph';
import { renderHelpPageView, setHelpPageSearch } from './views/help-page';
import { renderInspector } from './views/inspector';
import { renderLandingPageView } from './views/landing-page';
import { showLibraryModal } from './views/library-modal';
import { renderNewTabView } from './views/new-tab';
import { renderOutlineView } from './views/outline';
import { renderManualPageView, setManualPageTab } from './views/help-modal';
import { renderSettingsPageView, setSettingsPageTab } from './views/settings-modal';
import { renderTypesetView } from './views/typeset';
import { hasCoverHistory, performCoverRedo, performCoverUndo } from './views/cover';

const starter = isLocalDevMockEnabled()
  ? createStarterBookProject()
  : createEmptyBookProject('Untitled Book', 'Author');
const initialLibrary = createInitialLibrary(starter);

const projectHistory = new ProjectHistoryStack<BookProject>(45);
let isApplyingHistory = false;
let activeExportLoaderEl: HTMLElement | null = null;

function setExportLoading(label: string | null): void {
  if (!label) {
    activeExportLoaderEl?.remove();
    activeExportLoaderEl = null;
    return;
  }
  if (!activeExportLoaderEl) {
    activeExportLoaderEl = el(
      'div',
      {
        className: 'qv-export-loader',
        id: 'qv-export-loader',
        attrs: { role: 'status', 'aria-live': 'polite' },
      },
      el('span', { className: 'qv-export-spinner' }),
      el('span', { className: 'qv-export-loader-text', text: label }),
    );
    document.body.appendChild(activeExportLoaderEl);
  } else {
    const txt = activeExportLoaderEl.querySelector('.qv-export-loader-text');
    if (txt) txt.textContent = label;
  }
}

async function runWithExportLoading<T>(label: string, task: () => Promise<T>): Promise<T> {
  setExportLoading(label);
  await new Promise<void>((r) => requestAnimationFrame(() => r()));
  try {
    return await task();
  } finally {
    setExportLoading(null);
  }
}

const COMPACT_SIDEBAR_BREAKPOINT = 1180;
const isWideDesktop = typeof window === 'undefined' || window.innerWidth > COMPACT_SIDEBAR_BREAKPOINT;
const isMediumOrLarger = typeof window === 'undefined' || window.innerWidth > 960;

const state: AppState = {
  library: initialLibrary,
  project: starter,
  settings: loadSettings(),
  activeView: 'editor',
  activeSceneId: getAllScenes(starter)[0]?.scene.id ?? '',
  defaultExportFormat: typeof window !== 'undefined' ? loadDefaultExportFormat() : '.qv',
  editorSubMode: 'draft',
  splitTargetKind: 'character',
  splitTargetId: starter.bible.characters[0]?.id ?? '',
  diffSnapshotId: '',
  typewriterMode: false,
  zenMode: false,
  showBinder: isMediumOrLarger,
  showInspector: isWideDesktop,
  proofreadPreviewClean: false,
  activeProofreadMarkId: '',
  bibleCategory: 'characters',
  activeBibleId: starter.bible.characters[0]?.id ?? '',
  activeGraphNodeId: starter.storyGraph?.nodes[0]?.id ?? '',
  typesetSubTab: 'interior',
  sprintRunning: false,
  sprintDurationMin: 25,
  sprintRemainingSec: 25 * 60,
  sprintStartWords: getProjectWordCount(starter),
  immersiveMode: false,
  openBookTabIds: [starter.id],
  activeTabId: starter.id,
  saveStatusLabel: 'Saved',
};

let persistTimer: number | null = null;
let sprintInterval: number | null = null;
let toastTimer: number | null = null;
let immersiveHud: ImmersiveHudHandle | null = null;
let alarmController: AlarmController | null = null;
let immersiveBtnEl: HTMLButtonElement | null = null;
let desktopTabBarEl: HTMLElement | null = null;
let desktopTabBarMounted = false;
let desktopTabStripEl: HTMLElement | null = null;
let desktopTabAddBtnEl: HTMLButtonElement | null = null;
let desktopTabStripShellEl: HTMLElement | null = null;
let topbarLogoEl: HTMLElement | null = null;
let topbarWinControlsEl: HTMLElement | null = null;
let topbarNewWinBtnEl: HTMLButtonElement | null = null;
let themeSwitchBtnEl: HTMLButtonElement | null = null;
let themeMorphSvgEl: SVGSVGElement | null = null;
let windowSync: WorkspaceWindowSync | null = null;
let currentWindowLabel = 'main';
let isApplyingRemoteSync = false;
let pendingFocusTabIdAfterRender: string | null = null;
const alertedSharedBookIds = new Set<string>();
const LAST_OPENED_BOOK_STORAGE_KEY = 'quillvibe.lastOpenedBookId.v1';
const DETACH_HANDOFF_STORAGE_KEY = 'quillvibe.detachHandoff.v1';
let lastOpenedBookId = starter.id;
let lastTabBarRenderSig = '';
let pendingDetachHandoffEditorState: {
  sceneId: string;
  scrollTop: number;
  selectionStart: number;
  selectionEnd: number;
} | null = null;

interface DetachHandoffPayload {
  project: BookProject;
  activeView: StudioViewId;
  activeSceneId: string;
  editorSubMode: AppState['editorSubMode'];
  typesetSubTab: AppState['typesetSubTab'];
  showBinder?: boolean;
  showInspector?: boolean;
  scrollTop: number;
  selectionStart: number;
  selectionEnd: number;
  createdAt: number;
}

function saveDetachHandoff(bookId: string, payload: DetachHandoffPayload): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    const raw = window.localStorage.getItem(DETACH_HANDOFF_STORAGE_KEY);
    const map: Record<string, DetachHandoffPayload> = raw ? (JSON.parse(raw) as Record<string, DetachHandoffPayload>) : {};
    const now = Date.now();
    for (const k of Object.keys(map)) {
      if (!map[k] || now - map[k].createdAt > 15_000) delete map[k];
    }
    map[bookId] = payload;
    window.localStorage.setItem(DETACH_HANDOFF_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Ignore storage errors
  }
}

function consumeDetachHandoff(bookId: string): DetachHandoffPayload | null {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  try {
    const raw = window.localStorage.getItem(DETACH_HANDOFF_STORAGE_KEY);
    if (!raw) return null;
    const map = JSON.parse(raw) as Record<string, DetachHandoffPayload>;
    const entry = map?.[bookId] ?? null;
    if (entry) {
      delete map[bookId];
      window.localStorage.setItem(DETACH_HANDOFF_STORAGE_KEY, JSON.stringify(map));
    }
    if (!entry || Date.now() - entry.createdAt > 15_000) return null;
    return entry;
  } catch {
    return null;
  }
}

function rememberLastBook(bookId: string): void {
  if (!bookId || isNonBookTabId(bookId)) return;
  lastOpenedBookId = bookId;
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem(LAST_OPENED_BOOK_STORAGE_KEY, bookId);
    } catch {
      // Ignore storage errors
    }
  }
}

const tabManager = new TabManager([starter.id], starter.id);

function syncTabsFromManager(persistOrder = false): void {
  state.openBookTabIds = tabManager.getTabIds();
  state.activeTabId = tabManager.getActiveTabId();
  if (persistOrder && isTauriRuntime()) {
    tabManager.savePersistedOrder(currentWindowLabel);
  }
}

function setTabOrderAndActive(
  nextIds: string[],
  nextActiveId?: string,
  persistOrder = false,
): void {
  tabManager.setOrder(nextIds, { persist: false });
  if (nextActiveId !== undefined) {
    if (!tabManager.hasTab(nextActiveId)) {
      tabManager.openTab(nextActiveId, { activate: true });
    } else {
      tabManager.setActiveTabId(nextActiveId);
    }
  }
  syncTabsFromManager(persistOrder);
}

function resolveSpecialPageView(tabId: string): StudioViewId {
  if (tabId === COURSE_TAB_ID) return 'course';
  if (tabId === HELP_TAB_ID) return 'help';
  if (tabId === SETTINGS_TAB_ID) return 'settings';
  if (tabId === MANUAL_TAB_ID) return 'manual';
  if (tabId === EXTENSIONS_TAB_ID) return 'extensions';
  return 'editor';
}

function activateDesktopTab(tabId: string): void {
  if (tabId === COURSE_TAB_ID) {
    tabManager.openTab(COURSE_TAB_ID, { activate: true });
    syncTabsFromManager(true);
    state.activeView = 'course';
    windowSync?.publishPresence();
    renderDesktopTabBar();
    renderActiveView();
  } else if (tabId === HELP_TAB_ID) {
    tabManager.openTab(HELP_TAB_ID, { activate: true });
    syncTabsFromManager(true);
    state.activeView = 'help';
    windowSync?.publishPresence();
    renderDesktopTabBar();
    renderActiveView();
  } else if (tabId === SETTINGS_TAB_ID) {
    tabManager.openTab(SETTINGS_TAB_ID, { activate: true });
    syncTabsFromManager(true);
    state.activeView = 'settings';
    windowSync?.publishPresence();
    renderDesktopTabBar();
    renderActiveView();
  } else if (tabId === MANUAL_TAB_ID) {
    tabManager.openTab(MANUAL_TAB_ID, { activate: true });
    syncTabsFromManager(true);
    state.activeView = 'manual';
    windowSync?.publishPresence();
    renderDesktopTabBar();
    renderActiveView();
  } else if (tabId === EXTENSIONS_TAB_ID) {
    tabManager.openTab(EXTENSIONS_TAB_ID, { activate: true });
    syncTabsFromManager(true);
    state.activeView = 'extensions';
    windowSync?.publishPresence();
    renderDesktopTabBar();
    renderActiveView();
  } else if (isEmptyTabId(tabId)) {
    tabManager.openTab(tabId, { activate: true });
    syncTabsFromManager(true);
    state.activeView = 'editor';
    windowSync?.publishPresence();
    renderDesktopTabBar();
    renderActiveView();
  } else {
    state.activeView =
      state.activeView === 'course' ||
      state.activeView === 'help' ||
      state.activeView === 'developer' ||
      state.activeView === 'settings' ||
      state.activeView === 'manual' ||
      state.activeView === 'extensions'
        ? 'editor'
        : state.activeView;
    actions.switchBook(tabId);
  }
}

function renderTabDropIndicator(insertionIndex: number | null): void {
  if (!desktopTabBarEl) return;
  const tabStrip = desktopTabBarEl.querySelector<HTMLElement>('.qv-tab-strip');
  if (!tabStrip) return;
  const existing = tabStrip.querySelector<HTMLElement>('.qv-tab-drop-indicator');
  if (insertionIndex === null) {
    existing?.remove();
    return;
  }
  const tabs = Array.from(tabStrip.querySelectorAll<HTMLElement>('.qv-book-tab'));
  const clampedIdx = Math.max(0, Math.min(tabs.length, insertionIndex));
  const stripRect = tabStrip.getBoundingClientRect();
  let leftPx = 4;
  if (tabs.length > 0) {
    if (clampedIdx < tabs.length) {
      const r = tabs[clampedIdx].getBoundingClientRect();
      leftPx = r.left - stripRect.left + tabStrip.scrollLeft - 1;
    } else {
      const last = tabs[tabs.length - 1].getBoundingClientRect();
      leftPx = last.right - stripRect.left + tabStrip.scrollLeft + 2;
    }
  }
  const indicator = existing ?? el('div', { className: 'qv-tab-drop-indicator', attrs: { 'aria-hidden': 'true' } });
  indicator.style.left = `${Math.max(2, Math.round(leftPx))}px`;
  if (!existing) tabStrip.appendChild(indicator);
}

function captureTabHandoffPayload(tabId: string): DetachHandoffPayload | null {
  if (isEmptyTabId(tabId) || isNonBookTabId(tabId)) return null;
  const targetBook =
    state.project.id === tabId
      ? state.project
      : state.library.books.find((b) => b.id === tabId);
  if (!targetBook) return null;
  const isCurrent = state.project.id === tabId;
  const proseEl = isCurrent ? mainStageEl?.querySelector<HTMLTextAreaElement>('.bv-prose-textarea') : null;
  return {
    project: targetBook,
    activeView: isCurrent ? state.activeView : 'editor',
    activeSceneId: isCurrent ? state.activeSceneId : getAllScenes(targetBook)[0]?.scene.id ?? '',
    editorSubMode: isCurrent ? state.editorSubMode : 'draft',
    typesetSubTab: isCurrent ? state.typesetSubTab : 'interior',
    showBinder: isCurrent ? state.showBinder : true,
    showInspector: isCurrent ? state.showInspector : true,
    scrollTop: proseEl?.scrollTop ?? 0,
    selectionStart: proseEl?.selectionStart ?? 0,
    selectionEnd: proseEl?.selectionEnd ?? 0,
    createdAt: Date.now(),
  };
}

function prepareDetachPersistence(tabId: string): void {
  if (persistTimer !== null) {
    window.clearTimeout(persistTimer);
    persistTimer = null;
  }
  const handoff = captureTabHandoffPayload(tabId);
  if (handoff) {
    const syncedLib = upsertBookInLibrary(state.library, state.project);
    state.library = syncedLib;
    saveDetachHandoff(tabId, handoff);
    const libForDisk: BookLibraryState = {
      ...syncedLib,
      books: syncedLib.books.map(stripPrivateAuthorSecrets),
    };
    void persistLibrary(JSON.stringify(libForDisk));
  }
}

const tabDragController = new TabDragController({
  getWindowLabel: () => currentWindowLabel,
  getTabIds: () => tabManager.getTabIds(),
  getActiveTabId: () => tabManager.getActiveTabId(),
  immediateMergeOnTargetHover: false,
  getTargetWindowStripMetrics: (targetWindowLabel) => {
    const rec = windowSync?.getWindowPresenceByLabel(targetWindowLabel);
    if (!rec) return null;
    return {
      tabWidthPx: rec.tabWidthPx,
      tabCount: rec.tabCount,
      stripLeftOffsetPx: rec.stripLeftOffsetPx,
    };
  },
  onHoverTargetWindow: (targetWindowLabel, insertionIndex, tabTitle) => {
    windowSync?.sendTabHoverPreview(targetWindowLabel, insertionIndex, tabTitle);
  },
  onLeaveTargetWindow: (targetWindowLabel) => {
    windowSync?.sendTabHoverClear(targetWindowLabel);
  },
  onLiveDetachSpawn: async (tabId, tabTitle, screenX, screenY) => {
    const isEmpty = isEmptyTabId(tabId);
    prepareDetachPersistence(tabId);
    const res = await openBookInNewDesktopWindow(
      isEmpty ? EMPTY_TAB_PREFIX : tabId,
      isEmpty ? 'Quillvibe - New Tab' : `Quillvibe - ${tabTitle}`,
      { maximized: false, focused: false, posX: screenX, posY: screenY },
    );
    return res.ok && res.label ? res.label : null;
  },
  onLiveDetachCancel: (windowLabel) => {
    void closeDesktopWindowByLabel(windowLabel);
  },
  onLiveDetachCommit: (windowLabel, tabId) => {
    actions.closeBookTab(tabId);
    void focusDesktopWindow(windowLabel);
  },
  onOrderChange: (nextIds) => {
    tabManager.setOrder(nextIds, { persist: false });
    syncTabsFromManager(false);
    windowSync?.publishPresence();
  },
  onActivateTab: (tabId) => activateDesktopTab(tabId),
  onFinishInStrip: (orderChanged) => {
    if (orderChanged && isTauriRuntime()) {
      tabManager.savePersistedOrder(currentWindowLabel);
    }
    renderDesktopTabBar();
  },
  onCancel: (restoredIds) => {
    tabManager.setOrder(restoredIds, { persist: false });
    syncTabsFromManager(false);
    renderDesktopTabBar();
  },
  onDetachToNewWindow: (tabId, tabTitle, screenX, screenY) => {
    const isEmpty = isEmptyTabId(tabId);
    const prevOrder = tabManager.getTabIds();
    const prevActiveId = tabManager.getActiveTabId();

    prepareDetachPersistence(tabId);

    // Immediately remove tab from the source window so it never duplicates across strips
    actions.closeBookTab(tabId);

    void openBookInNewDesktopWindow(
      isEmpty ? EMPTY_TAB_PREFIX : tabId,
      isEmpty ? 'Quillvibe - New Tab' : `Quillvibe - ${tabTitle}`,
      { maximized: false, focused: true, posX: screenX, posY: screenY },
    ).then((res) => {
      if (!res.ok) {
        setTabOrderAndActive(prevOrder, prevActiveId, true);
        renderDesktopTabBar();
        if (!isNonBookTabId(prevActiveId) && state.project.id !== prevActiveId) {
          actions.switchBook(prevActiveId);
        }
        actions.notify(res.error || 'Could not open detached desktop window.');
      }
    });
  },
  onMergeIntoWindow: (targetWindowLabel, tabId, insertionIndex) => {
    if (persistTimer !== null) {
      window.clearTimeout(persistTimer);
      persistTimer = null;
    }
    windowSync?.sendTabHoverClear(targetWindowLabel);
    const handoff = captureTabHandoffPayload(tabId);
    if (handoff) {
      saveDetachHandoff(tabId, handoff);
    }
    if (state.project.id === tabId) {
      state.library = upsertBookInLibrary(state.library, state.project);
      windowSync?.broadcastBookUpdated(state.project.id, state.project);
    }
    windowSync?.sendTabDropIntoWindow(targetWindowLabel, tabId, insertionIndex);
    void focusDesktopWindow(targetWindowLabel);
    if (tabManager.getTabIds().length > 1) {
      actions.closeBookTab(tabId);
    } else {
      const serializedBook = serializeExtensionFile('.qv', state.project);
      const libForDisk: BookLibraryState = {
        ...state.library,
        books: state.library.books.map(stripPrivateAuthorSecrets),
      };
      void Promise.all([
        persistProject(serializedBook),
        persistLibrary(JSON.stringify(libForDisk)),
      ]).finally(() => {
        window.setTimeout(() => {
          void closeDesktopWindowByLabel(currentWindowLabel);
        }, 45);
      });
    }
  },
});

function isSmallMobileViewport(): boolean {
  return typeof window !== 'undefined' && window.innerWidth <= 768;
}

function getEffectiveTier(): ToolTier {
  return isSmallMobileViewport() ? 'basic' : state.settings.toolTier;
}

let headerNavGlass: LiquidGlassControl<StudioViewId> | null = null;
let headerNavHostEl: HTMLDivElement;
let mobileBottomNavEl: HTMLElement;
let tierPillBtnEl: HTMLButtonElement | null = null;
let savedDrawerStateBeforeTypeset: { binder: boolean; inspector: boolean } | null = null;
let lastRenderedTier: ToolTier = state.settings.toolTier;
let shellEl: HTMLDivElement;
let binderEl: HTMLElement;
let mainStageEl: HTMLElement;
let inspectorEl: HTMLElement;
let workspaceGridEl: HTMLElement;
let drawerBackdropEl: HTMLDivElement;
let binderToggleBtn: HTMLButtonElement;
let inspectorToggleBtn: HTMLButtonElement;
let exportFormatSelectEl: HTMLSelectElement;
let bookTitleInputEl: HTMLInputElement;
let saveStatusEl: HTMLSpanElement;
let wordStatsEl: HTMLSpanElement;
let sprintStatusEl: HTMLSpanElement;
let sprintToggleBtnEl: HTMLButtonElement;

function syncWindowAndDocumentTitle(): void {
  const title = state.activeView === 'landing'
    ? 'Quillvibe'
    : isEmptyTabId(state.activeTabId)
    ? isTauriRuntime()
      ? 'Quillvibe - New Tab'
      : 'New Tab — Quillvibe'
    : state.activeTabId === COURSE_TAB_ID || state.activeView === 'course'
      ? isTauriRuntime()
        ? 'Quillvibe - Book Writing Course'
        : 'Free Book Writing & Publishing Course — Quillvibe Academy'
      : state.activeTabId === HELP_TAB_ID || state.activeView === 'help'
        ? isTauriRuntime()
          ? 'Quillvibe - Help & FAQ'
          : 'Quillvibe Help Center, FAQ & Error Guide'
        : state.activeView === 'developer'
          ? 'Quillvibe Developer Portal — Build .qvext Extension Add-ons'
          : state.activeTabId === SETTINGS_TAB_ID || state.activeView === 'settings'
            ? isTauriRuntime()
              ? 'Quillvibe - Settings, Layouts & Themes'
              : 'Settings, Layouts & Themes — Quillvibe'
            : state.activeTabId === MANUAL_TAB_ID || state.activeView === 'manual'
              ? isTauriRuntime()
                ? 'Quillvibe - Help, Course & Manual'
                : 'Help, Course & Manual — Quillvibe'
              : formatAppWindowTitle(
              state.settings,
              state.project,
              state.activeView,
              state.typesetSubTab,
              isTauriRuntime(),
            );
  if (typeof document !== 'undefined') {
    document.title = title;
    if (!isTauriRuntime()) {
      const isCourse = state.activeView === 'course';
      const isHelp = state.activeView === 'help';
      const isDev = state.activeView === 'developer';
      const metaDesc = document.querySelector<HTMLMetaElement>('meta[name="description"]');
      if (metaDesc) {
        metaDesc.content = isCourse
          ? 'Take the free 10-module, 28-lesson Quillvibe Book Writing & Publishing Course online. Learn drafting, story bibles, proofreading marks, interior print typesetting, book cover design, and EPUB 3 / PDF publishing.'
          : isHelp
            ? 'Complete Quillvibe Help Center, FAQ, and QV-xxx error code guide for writers across web and desktop.'
            : isDev
              ? 'Official developer portal for building, validating, and testing sandboxed .qvext extension add-ons for Quillvibe.'
              : 'Quillvibe is a free, open-source book writing studio and free 10-module Book Writing & Publishing Course. Draft manuscripts, organize story bibles, proofread with 15 copyediting marks, design covers, and export Print PDF and EPUB 3 offline.';
      }
      const canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
      if (canonical) {
        canonical.href = isCourse
          ? 'https://quillvibe.jhonrey.com/course'
          : isHelp
            ? 'https://quillvibe.jhonrey.com/help'
            : isDev
              ? 'https://quillvibe.jhonrey.com/developer'
              : 'https://quillvibe.jhonrey.com/';
      }
    }
  }
  void setDesktopWindowTitle(title);
}

function showSharedBookSyncNotice(bookId: string, bookTitle: string): void {
  if (alertedSharedBookIds.has(bookId)) return;
  alertedSharedBookIds.add(bookId);
  const existing = document.getElementById('qv-shared-book-modal');
  if (existing) existing.remove();

  const close = () => backdrop.remove();
  const backdrop = el(
    'div',
    {
      className: 'bv-modal-backdrop',
      id: 'qv-shared-book-modal',
      on: {
        click: (e) => {
          if (e.target === backdrop) close();
        },
      },
    },
    el(
      'div',
      {
        className: 'bv-modal',
        style: { maxWidth: '460px' },
        attrs: { role: 'alertdialog', 'aria-modal': 'true', 'aria-label': 'Shared Book Live Sync Notice' },
      },
      el(
        'div',
        { className: 'bv-panel-head' },
        el('span', { className: 'bv-panel-title', text: 'Book Open in Multiple Windows / Tabs' }),
        el('button', {
          className: 'bv-mini-btn',
          text: 'Close',
          attrs: { type: 'button' },
          on: { click: close },
        }),
      ),
      el(
        'div',
        { className: 'bv-modal-body', style: { display: 'flex', flexDirection: 'column', gap: '12px' } },
        el('p', {
          text: `“${bookTitle || 'Untitled Book'}” is already open in another Quillvibe window or tab.`,
          style: { margin: '0', fontSize: '13.5px', fontWeight: '600', color: 'var(--text-primary)' },
        }),
        el('p', {
          text: 'Changes you save in this window will reflect automatically across all open copies of this book using safe revision checks so your saves do not conflict or overwrite each other.',
          style: { margin: '0', fontSize: '13px', lineHeight: '1.55', color: 'var(--text-secondary)' },
        }),
        el(
          'div',
          { style: { display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '4px' } },
          el('button', {
            className: 'bv-btn bv-btn-primary',
            text: 'Got It',
            attrs: { type: 'button' },
            on: { click: close },
          }),
        ),
      ),
    ),
  );
  document.body.appendChild(backdrop);
}

function maybeNotifySharedBook(bookId: string): void {
  if (!bookId || isEmptyTabId(bookId)) return;
  const others = windowSync?.getOtherWindowsWithBook(bookId) ?? [];
  const dupInCurrent = state.openBookTabIds.filter((id) => id === bookId).length > 1;
  if (others.length > 0 || dupInCurrent) {
    const book = state.library.books.find((b) => b.id === bookId);
    showSharedBookSyncNotice(bookId, book?.title || state.project.title);
  }
}

function isFullStageView(view: StudioViewId): boolean {
  return (
    view === 'landing' ||
    view === 'bible' ||
    view === 'graph' ||
    view === 'typeset' ||
    view === 'extensions' ||
    view === 'course' ||
    view === 'help' ||
    view === 'developer' ||
    view === 'settings' ||
    view === 'manual'
  );
}

function resolveOpenedFilePayload(opened: OpenedFileResult): {
  input: Uint8Array | string;
  base64Encoded: boolean;
} {
  if (opened.bytes && opened.bytes.byteLength > 0) {
    return { input: opened.bytes, base64Encoded: false };
  }
  if (opened.isBinary && opened.contentBase64) {
    return { input: opened.contentBase64, base64Encoded: true };
  }
  return { input: opened.content, base64Encoded: Boolean(opened.isBinary) };
}

function schedulePersist(options?: { authoritativeLibrary?: boolean }): void {
  if (isApplyingRemoteSync || isEmptyTabId(state.activeTabId)) return;
  const authoritative = Boolean(options?.authoritativeLibrary);
  // Merge smoothly against any parallel desktop window edits stored in library JSON unless caller committed an explicit deletion/replacement
  if (!authoritative && typeof window !== 'undefined' && window.localStorage) {
    const rawLib = window.localStorage.getItem('quillvibe.library.v2');
    if (rawLib) {
      try {
        const diskLib = safeJsonParse<BookLibraryState>(rawLib);
        if (Array.isArray(diskLib.books) && diskLib.books.length > 0) {
          const mergedBooks = diskLib.books.map((b) =>
            b.id === state.project.id ? state.project : b,
          );
          if (!mergedBooks.some((b) => b.id === state.project.id)) {
            mergedBooks.push(state.project);
          }
          state.library = {
            activeBookId: state.project.id,
            books: sortLibraryBooksByLatest(mergedBooks),
          };
        }
      } catch {
        // Fallback cleanly to current state.library
      }
    }
  }
  state.library = authoritative
    ? {
        activeBookId: state.library.activeBookId,
        books: sortLibraryBooksByLatest(state.library.books),
      }
    : upsertBookInLibrary(state.library, state.project);
  if (authoritative && typeof window !== 'undefined' && window.localStorage) {
    try {
      const safeLib: BookLibraryState = {
        ...state.library,
        books: state.library.books.map(stripPrivateAuthorSecrets),
      };
      window.localStorage.setItem('quillvibe.library.v2', JSON.stringify(safeLib));
    } catch {
      // Ignore storage quota errors
    }
  }
  state.saveStatusLabel = 'Saving…';
  if (saveStatusEl) saveStatusEl.textContent = state.saveStatusLabel;
  windowSync?.broadcastBookUpdated(state.project.id, stripPrivateAuthorSecrets(state.project));
  if (persistTimer !== null) window.clearTimeout(persistTimer);
  persistTimer = window.setTimeout(async () => {
    persistTimer = null;
    // Re-read latest localStorage right before atomic write so parallel window edits to other books are preserved
    let libToWrite = state.library;
    if (!authoritative && typeof window !== 'undefined' && window.localStorage) {
      const latestRaw = window.localStorage.getItem('quillvibe.library.v2');
      if (latestRaw) {
        try {
          const latestLib = safeJsonParse<BookLibraryState>(latestRaw);
          if (Array.isArray(latestLib.books) && latestLib.books.length > 0) {
            const merged = latestLib.books.map((b) =>
              b.id === state.project.id ? state.project : b,
            );
            if (!merged.some((b) => b.id === state.project.id)) merged.push(state.project);
            libToWrite = { activeBookId: state.project.id, books: sortLibraryBooksByLatest(merged) };
          }
        } catch {
          // Keep current state.library
        }
      }
    }
    const serializedBook = serializeExtensionFile('.qv', state.project);
    const safeLibToWrite: BookLibraryState = {
      ...libToWrite,
      books: libToWrite.books.map(stripPrivateAuthorSecrets),
    };
    const serializedLib = JSON.stringify(safeLibToWrite);
    await Promise.all([persistProject(serializedBook), persistLibrary(serializedLib)]);
    state.saveStatusLabel = 'Saved';
    if (saveStatusEl) saveStatusEl.textContent = state.saveStatusLabel;
  }, state.settings.autoSaveDelayMs || 320);
}

function formatClock(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function updateSprintDisplay(): void {
  if (!sprintStatusEl || !sprintToggleBtnEl) return;
  const currentTotal = getProjectWordCount(state.project);
  const delta = currentTotal - state.sprintStartWords;
  const deltaText = delta >= 0 ? `+${delta}w` : `${delta}w`;
  sprintStatusEl.textContent = `Sprint ${formatClock(state.sprintRemainingSec)} (${deltaText})`;
  sprintToggleBtnEl.textContent = state.sprintRunning ? 'Pause' : 'Start';
}

function updateWordCountersOnly(): void {
  const totalWords = getProjectWordCount(state.project);
  const ctx = findSceneContext(state.project, state.activeSceneId);
  const sceneWords = ctx ? countWords(ctx.scene.content) : 0;
  const sceneChars = ctx ? countCharacters(ctx.scene.content) : 0;
  const chapWords = ctx ? getChapterWordCount(ctx.chapter) : 0;
  const pages = estimateStandardPages(totalWords);
  const mins = estimateReadingMinutes(totalWords);

  if (wordStatsEl) {
    wordStatsEl.textContent = `Scene ${sceneWords}w (${sceneChars}c) | Ch ${chapWords}w | Book ${totalWords.toLocaleString()} / ${state.project.wordTarget.toLocaleString()}w | ~${pages}p (${mins}m)`;
  }

  if (ctx) {
    const binderCount = document.querySelector(`[data-binder-scene="${ctx.scene.id}"]`);
    if (binderCount) binderCount.textContent = String(sceneWords);
    const binderTitle = document.querySelector(`[data-binder-title="${ctx.scene.id}"]`);
    if (binderTitle) binderTitle.textContent = ctx.scene.title || 'Untitled Scene';
    const chapCount = document.querySelector(`[data-binder-chap="${ctx.chapter.id}"]`);
    if (chapCount) chapCount.textContent = String(chapWords);
  }

  updateSprintDisplay();
}

function syncResponsiveDrawerClasses(): void {
  const isFullStage = isEmptyTabId(state.activeTabId) || isFullStageView(state.activeView);
  const isNarrowDrawerMode = window.innerWidth <= 1180;
  const binderActive = !isFullStage && state.showBinder;
  const inspectorActive = !isFullStage && state.showInspector;
  workspaceGridEl.classList.toggle('hide-binder', !binderActive);
  workspaceGridEl.classList.toggle('hide-inspector', !inspectorActive);
  binderToggleBtn?.classList.toggle('is-active', binderActive);
  inspectorToggleBtn?.classList.toggle('is-active', inspectorActive);

  const hasOverlayOpen =
    !isFullStage &&
    ((isNarrowDrawerMode && inspectorActive) || (window.innerWidth <= 960 && binderActive));
  drawerBackdropEl?.classList.toggle('is-visible', hasOverlayOpen);
}

function allowedViewsForTier(tier: ToolTier): StudioViewId[] {
  const extra: StudioViewId[] = isTauriRuntime()
    ? ['extensions', 'course', 'help', 'settings', 'manual']
    : ['landing', 'extensions', 'course', 'help', 'developer', 'settings', 'manual'];
  if (tier === 'basic') return ['editor', ...extra];
  if (tier === 'intermediate') return ['editor', 'corkboard', 'outline', 'typeset', ...extra];
  return ['editor', 'corkboard', 'outline', 'bible', 'graph', 'typeset', ...extra];
}

function syncExportSelectWidth(): void {
  if (!exportFormatSelectEl) return;
  const optText = exportFormatSelectEl.selectedOptions[0]?.textContent || exportFormatSelectEl.value || '.qv';
  let textWidth = optText.length * 7;
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.font = '11px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
      textWidth = ctx.measureText(optText).width;
    }
  }
  const widthPx = Math.max(76, Math.ceil(textWidth + 52));
  exportFormatSelectEl.style.width = `${widthPx}px`;
}

function confirmPartialQuillvibeExport(
  ext: Exclude<QuillvibeExtension, '.qv'>,
): Promise<'proceed' | 'full' | 'cancel'> {
  return new Promise((resolve) => {
    const extDetail =
      ext === '.qvscene'
        ? 'saves only the currently open scene (prose, scene images, snapshots, and proofreading marks)—not the other chapters, Story Bible, Story Graph, or cover.'
        : ext === '.qvbible'
          ? 'saves only the Story Bible database (Characters, Locations, Lore, and custom categories)—not manuscript chapters or cover artwork.'
          : ext === '.qvdesign'
            ? 'saves only the editable Book Cover Studio package (layers, vector paths, draft variants, and collaboration pins)—not the manuscript chapters.'
            : 'saves only the Interior Typeset & Paper Style preset (trim size, typeface, margins, and drop caps)—not book chapters or Story Bible.';

    const close = (choice: 'proceed' | 'full' | 'cancel') => {
      document.removeEventListener('keydown', onEsc);
      backdrop.remove();
      resolve(choice);
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close('cancel');
    };

    const backdrop = el(
      'div',
      {
        className: 'bv-modal-backdrop',
        id: 'qv-partial-export-modal',
        on: {
          click: (e) => {
            if (e.target === backdrop) close('cancel');
          },
        },
      },
      el(
        'div',
        { className: 'bv-modal', style: { maxWidth: '480px' }, attrs: { role: 'dialog', 'aria-modal': 'true' } },
        el(
          'div',
          { className: 'bv-modal-header' },
          el('strong', { text: `Save Partial File (${ext}) or Full Book (.qv)?` }),
          el('button', {
            className: 'bv-btn bv-btn-icon',
            text: '×',
            attrs: { type: 'button', 'aria-label': 'Close confirmation' },
            on: { click: () => close('cancel') },
          }),
        ),
        el(
          'div',
          { className: 'bv-modal-body', style: { display: 'flex', flexDirection: 'column', gap: '12px' } },
          el('p', {
            style: { margin: '0', fontSize: '13.5px', lineHeight: '1.55' },
            text: `${ext} is a partial archive format: it ${extDetail}`,
          }),
          el('p', {
            className: 'bv-label',
            style: { margin: '0' },
            text: 'Choose "Save Complete Book (.qv)" if you want a full backup of your whole project, or continue exporting only this component.',
          }),
          el(
            'div',
            { style: { display: 'flex', gap: '8px', justifyContent: 'flex-end', flexWrap: 'wrap', marginTop: '4px' } },
            el('button', {
              className: 'bv-btn',
              text: 'Cancel',
              attrs: { type: 'button' },
              on: { click: () => close('cancel') },
            }),
            el('button', {
              className: 'bv-btn',
              text: `Continue Exporting ${ext}`,
              attrs: { type: 'button' },
              on: { click: () => close('proceed') },
            }),
            el('button', {
              className: 'bv-btn bv-btn-primary',
              text: 'Save Complete Book (.qv)',
              attrs: { type: 'button' },
              on: { click: () => close('full') },
            }),
          ),
        ),
      ),
    );

    document.addEventListener('keydown', onEsc);
    document.body.appendChild(backdrop);
  });
}

function getHeaderNavOptions(tier: ToolTier) {
  const all = [
    { id: 'editor' as const, label: 'Manuscript', icon: 'quill' as const, tooltip: TOOLTIP_CATALOG.navEditor },
    { id: 'corkboard' as const, label: 'Corkboard', icon: 'corkboard' as const, tooltip: TOOLTIP_CATALOG.navCorkboard },
    { id: 'outline' as const, label: 'Outline', icon: 'outline' as const, tooltip: TOOLTIP_CATALOG.navOutline },
    { id: 'bible' as const, label: 'Story Bible', icon: 'bible' as const, tooltip: TOOLTIP_CATALOG.navBible },
    { id: 'graph' as const, label: 'Graph', icon: 'graph' as const, tooltip: TOOLTIP_CATALOG.navGraph },
    { id: 'typeset' as const, label: 'Studio', icon: 'typeset' as const, tooltip: TOOLTIP_CATALOG.navTypeset },
  ];
  const allowed = new Set(allowedViewsForTier(tier));
  return all.filter((opt) => allowed.has(opt.id));
}

function rebuildHeaderNavControl(): void {
  if (!headerNavHostEl) return;
  const effTier = getEffectiveTier();
  const allowed = allowedViewsForTier(effTier);
  if (!allowed.includes(state.activeView)) {
    state.activeView = 'editor';
  }
  headerNavGlass?.destroy();
  headerNavHostEl.replaceChildren();
  const opts = getHeaderNavOptions(effTier);
  lastRenderedTier = effTier;

  if (opts.length <= 1) {
    // Focused workspace keeps header clean and uncluttered
    headerNavGlass = null;
    headerNavHostEl.appendChild(
      el(
        'span',
        { className: 'qv-basic-doc-pill' },
        icon('quill', 13),
        el('span', { text: 'Manuscript Document' }),
      ),
    );
  } else {
    headerNavGlass = new LiquidGlassControl<StudioViewId>({
      ariaLabel: 'Studio workspace',
      surface: 'solid',
      iconOnly: true,
      value: state.activeView,
      options: opts,
      onChange: (view) => {
        actions.setState({ activeView: view }, true);
      },
    });
    headerNavHostEl.appendChild(headerNavGlass.element);
    requestAnimationFrame(() => {
      headerNavGlass?.sampleBackdrop(true);
    });
  }

  // Update mobile bottom navigation buttons (hidden on small screens where only Focused is active)
  if (mobileBottomNavEl) {
    mobileBottomNavEl.replaceChildren();
    mobileBottomNavEl.style.display = opts.length <= 1 ? 'none' : '';
    if (opts.length > 1) {
      for (const opt of opts) {
        mobileBottomNavEl.appendChild(
          el(
            'button',
            {
              className: `qv-mobile-nav-btn${state.activeView === opt.id ? ' is-active' : ''}`,
              attrs: { type: 'button', 'aria-label': opt.label },
              on: { click: () => actions.setState({ activeView: opt.id }, true) },
            },
            icon(opt.icon, 16),
            el('span', { text: opt.label }),
          ),
        );
      }
    }
  }
}

let suppressNextBrowserPush = false;

function syncWebUrlIfNeeded(effectiveView: AppState['activeView']): void {
  if (isTauriRuntime() || typeof window === 'undefined') return;
  const welcomeOpen = Boolean(document.querySelector('.qv-welcome-overlay'));
  if (welcomeOpen && window.location.pathname === '/start') {
    return;
  }
  const targetPath = routeForState(effectiveView, state.typesetSubTab, state.editorSubMode);
  syncBrowserPath(targetPath, suppressNextBrowserPush);
  suppressNextBrowserPush = false;
}

function renderActiveView(): void {
  if (!shellEl) return;
  hideTooltip();
  const effTier = getEffectiveTier();
  if (lastRenderedTier !== effTier) {
    rebuildHeaderNavControl();
  }
  if (tierPillBtnEl) {
    tierPillBtnEl.style.display = isSmallMobileViewport() ? 'none' : '';
    tierPillBtnEl.textContent = `Workspace: ${formatWorkspaceLayoutName(effTier)}`;
  }
  const isNewTab = isEmptyTabId(state.activeTabId);
  const isLandingPage = !isTauriRuntime() && state.activeView === 'landing';
  const isCourseTab = state.activeTabId === COURSE_TAB_ID || state.activeView === 'course';
  const isHelpTab = state.activeTabId === HELP_TAB_ID || state.activeView === 'help';
  const isSettingsTab = state.activeTabId === SETTINGS_TAB_ID || state.activeView === 'settings';
  const isManualTab = state.activeTabId === MANUAL_TAB_ID || state.activeView === 'manual';
  const isExtensionsTab = state.activeTabId === EXTENSIONS_TAB_ID || state.activeView === 'extensions';
  const isDevTab = !isTauriRuntime() && state.activeView === 'developer';
  const isStandalonePage =
    isLandingPage || isCourseTab || isHelpTab || isDevTab || isSettingsTab || isManualTab || isExtensionsTab;
  const effectiveUrlView: AppState['activeView'] = isLandingPage
    ? 'landing'
    : isCourseTab
      ? 'course'
      : isHelpTab
        ? 'help'
        : isSettingsTab
          ? 'settings'
          : isManualTab
            ? 'manual'
            : isExtensionsTab
              ? 'extensions'
              : isDevTab
                ? 'developer'
                : state.activeView;
  syncWebUrlIfNeeded(effectiveUrlView);
  const isFullStagePage = isNewTab || isStandalonePage || isFullStageView(state.activeView);
  shellEl.classList.toggle('is-zen', state.zenMode);
  shellEl.classList.toggle('is-immersive', state.immersiveMode);
  shellEl.classList.toggle('is-typeset-studio', isFullStagePage);
  shellEl.classList.toggle('is-standalone-page', isStandalonePage);
  shellEl.classList.toggle('is-landing-page', isLandingPage);
  immersiveBtnEl?.classList.toggle('is-active', state.immersiveMode);
  syncResponsiveDrawerClasses();
  if (bookTitleInputEl) {
    const desiredTitle = isNewTab
      ? 'New Tab'
      : isCourseTab
        ? 'Book Writing Course'
        : isHelpTab
          ? 'Help & FAQ'
          : isSettingsTab
            ? 'Settings, Layouts & Themes'
            : isManualTab
              ? 'Help, Course & Manual'
              : isExtensionsTab
                ? 'Extensions & File Formats'
                : isDevTab
                  ? 'Developer Portal'
                  : state.project.title;
    if (bookTitleInputEl.value !== desiredTitle) bookTitleInputEl.value = desiredTitle;
    bookTitleInputEl.disabled = isNewTab || isStandalonePage;
  }
  if (exportFormatSelectEl && exportFormatSelectEl.value !== state.defaultExportFormat) {
    exportFormatSelectEl.value = state.defaultExportFormat;
  }
  syncExportSelectWidth();
  if (!isStandalonePage && !isNewTab) {
    headerNavGlass?.setValue(state.activeView);
    headerNavGlass?.sampleBackdrop(true);
  }
  if (mobileBottomNavEl) {
    const opts = getHeaderNavOptions(effTier);
    Array.from(mobileBottomNavEl.children).forEach((child, idx) => {
      child.classList.toggle('is-active', opts[idx]?.id === state.activeView);
    });
  }

  if (isLandingPage) {
    clearNode(binderEl);
    clearNode(inspectorEl);
    renderLandingPageView(mainStageEl, actions, () => state);
    syncWindowAndDocumentTitle();
    syncThemeButtonIcon();
    immersiveHud?.sync();
    return;
  }

  if (isNewTab) {
    clearNode(binderEl);
    clearNode(inspectorEl);
    renderNewTabView(mainStageEl, actions, {
      isBookOpenElsewhere: (bookId) =>
        (windowSync?.getOtherWindowsWithBook(bookId).length ?? 0) > 0 ||
        state.openBookTabIds.includes(bookId),
      onPickBook: (bookId) => {
        const emptyId = state.activeTabId;
        tabManager.replaceTab(emptyId, bookId, { activate: true });
        syncTabsFromManager(true);
        actions.switchBook(bookId);
      },
      onCreateBlankBook: (title, penName) => {
        const emptyId = state.activeTabId;
        const res = addBookToLibrary(upsertBookInLibrary(state.library, state.project), title, penName);
        state.library = res.library;
        state.project = res.newBook;
        rememberLastBook(res.newBook.id);
        tabManager.replaceTab(emptyId, res.newBook.id, { activate: true });
        syncTabsFromManager(true);
        state.activeView = 'editor';
        state.activeSceneId = getAllScenes(state.project)[0]?.scene.id ?? '';
        state.activeBibleId = state.project.bible.characters[0]?.id ?? '';
        state.activeGraphNodeId = state.project.storyGraph?.nodes[0]?.id ?? '';
        state.sprintStartWords = getProjectWordCount(state.project);
        windowSync?.publishPresence();
        schedulePersist();
        renderDesktopTabBar();
        renderActiveView();
        actions.notify(`Created “${title}”`);
      },
    });
    syncWindowAndDocumentTitle();
    syncThemeButtonIcon();
    immersiveHud?.sync();
    return;
  }

  if (isCourseTab) {
    clearNode(binderEl);
    clearNode(inspectorEl);
    renderCoursePageView(mainStageEl, actions);
    syncWindowAndDocumentTitle();
    syncThemeButtonIcon();
    immersiveHud?.sync();
    return;
  }

  if (isHelpTab) {
    clearNode(binderEl);
    clearNode(inspectorEl);
    renderHelpPageView(mainStageEl, actions);
    syncWindowAndDocumentTitle();
    syncThemeButtonIcon();
    immersiveHud?.sync();
    return;
  }

  if (isDevTab) {
    clearNode(binderEl);
    clearNode(inspectorEl);
    renderDeveloperPageView(mainStageEl, actions);
    syncWindowAndDocumentTitle();
    syncThemeButtonIcon();
    immersiveHud?.sync();
    return;
  }

  if (isSettingsTab) {
    clearNode(binderEl);
    clearNode(inspectorEl);
    renderSettingsPageView(mainStageEl, actions);
    syncWindowAndDocumentTitle();
    syncThemeButtonIcon();
    immersiveHud?.sync();
    return;
  }

  if (isManualTab) {
    clearNode(binderEl);
    clearNode(inspectorEl);
    renderManualPageView(mainStageEl, actions);
    syncWindowAndDocumentTitle();
    syncThemeButtonIcon();
    immersiveHud?.sync();
    return;
  }

  if (isExtensionsTab) {
    clearNode(binderEl);
    clearNode(inspectorEl);
    renderExtensionsPageView(mainStageEl, actions);
    syncWindowAndDocumentTitle();
    syncThemeButtonIcon();
    immersiveHud?.sync();
    return;
  }

  renderBinder(binderEl, actions);
  renderInspector(inspectorEl, actions);

  if (state.activeView === 'editor') {
    renderEditorView(mainStageEl, actions);
  } else if (state.activeView === 'corkboard') {
    renderCorkboardView(mainStageEl, actions);
  } else if (state.activeView === 'outline') {
    renderOutlineView(mainStageEl, actions);
  } else if (state.activeView === 'bible') {
    renderBibleView(mainStageEl, actions);
  } else if (state.activeView === 'graph') {
    renderGraphView(mainStageEl, actions);
  } else if (state.activeView === 'typeset') {
    renderTypesetView(mainStageEl, actions);
  }

  syncWindowAndDocumentTitle();
  immersiveHud?.sync();
  updateWordCountersOnly();
}

function promptQuillvibePasswordModal(
  filename: string,
  titleText = 'Unlock Protected Quillvibe File',
  hintText = `Enter the password set when “${filename}” was exported.`,
): Promise<string | null> {
  return new Promise((resolve) => {
    const passIn = el('input', {
      className: 'bv-input',
      attrs: {
        type: 'password',
        placeholder: 'Enter file password…',
        autocomplete: 'off',
      },
    });
    const close = (val: string | null) => {
      backdrop.remove();
      resolve(val);
    };
    const submit = () => close(passIn.value);

    const backdrop = el(
      'div',
      {
        className: 'bv-modal-backdrop',
        id: 'qv-password-modal',
        on: {
          click: (e) => {
            if (e.target === backdrop) close(null);
          },
        },
      },
      el(
        'div',
        {
          className: 'bv-modal',
          style: { maxWidth: '420px' },
          attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-label': titleText },
        },
        el(
          'div',
          { className: 'bv-panel-head' },
          el('span', { className: 'bv-panel-title', text: titleText }),
          el('button', {
            className: 'bv-mini-btn',
            text: 'Cancel',
            attrs: { type: 'button' },
            on: { click: () => close(null) },
          }),
        ),
        el(
          'div',
          { className: 'bv-modal-body' },
          el('p', { className: 'bv-label', text: hintText }),
          passIn,
          el(
            'div',
            { style: { display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '6px' } },
            el('button', {
              className: 'bv-btn',
              text: 'Cancel',
              attrs: { type: 'button' },
              on: { click: () => close(null) },
            }),
            el('button', {
              className: 'bv-btn bv-btn-primary',
              text: 'Confirm',
              attrs: { type: 'button' },
              on: { click: submit },
            }),
          ),
        ),
      ),
    );
    passIn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        submit();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        close(null);
      }
    });
    document.body.appendChild(backdrop);
    requestAnimationFrame(() => passIn.focus());
  });
}

const EXTERNAL_DOC_IMPORT_EXTS = new Set(['.docx', '.html', '.htm', '.rtf', '.md', '.markdown', '.txt']);

async function openSelectedBrowserFile(file: File): Promise<void> {
  const lower = file.name.toLowerCase();
  const dotIdx = lower.lastIndexOf('.');
  const ext = dotIdx >= 0 ? lower.slice(dotIdx) : '';
  if (EXTERNAL_DOC_IMPORT_EXTS.has(ext)) {
    const imported = await importAnyExternalDocumentFile(file);
    actions.replaceLibrary({
      activeBookId: imported.id,
      books: [...state.library.books, imported],
    });
    actions.notify(`Imported “${imported.title}”`);
    return;
  }
  const opened = await readPickedBrowserFile(file);
  const resolved = resolveOpenedFilePayload(opened);
  await handleOpenedFile(resolved.input, opened.filename, {
    base64Encoded: resolved.base64Encoded,
    allowLegacy: false,
  });
}

function showOpenFileDropDialog(): void {
  document.getElementById('bv-open-file-modal')?.remove();

  const close = () => backdrop.remove();
  const desktopMode = isTauriRuntime();

  const fileInput = el('input', {
    attrs: {
      type: 'file',
      accept:
        '.qv,.qvbible,.qvscene,.qvstyle,.qvdesign,.qvext,.docx,.md,.markdown,.txt,.html,.htm,.rtf',
    },
    style: { display: 'none' },
    on: {
      change: async () => {
        const picked = fileInput.files?.[0];
        fileInput.value = '';
        if (!picked) return;
        close();
        try {
          await openSelectedBrowserFile(picked);
        } catch (err) {
          actions.notify(err instanceof Error ? err.message : 'Unable to open selected file.');
        }
      },
    },
  });

  const dropzone = el(
    'div',
    {
      className: 'qv-open-dropzone',
      attrs: { tabindex: '0', role: 'button', 'aria-label': 'Drop a Quillvibe or manuscript file here' },
      on: {
        click: () => {
          if (desktopMode) {
            void (async () => {
              const opened = await openQuillvibeFile();
              if (!opened) return;
              close();
              const resolved = resolveOpenedFilePayload(opened);
              await handleOpenedFile(resolved.input, opened.filename, {
                base64Encoded: resolved.base64Encoded,
                allowLegacy: false,
              });
            })();
          } else {
            fileInput.click();
          }
        },
        dragenter: (e) => {
          e.preventDefault();
          dropzone.classList.add('is-drag-over');
        },
        dragover: (e) => {
          e.preventDefault();
          dropzone.classList.add('is-drag-over');
        },
        dragleave: () => {
          dropzone.classList.remove('is-drag-over');
        },
        drop: (e) => {
          e.preventDefault();
          dropzone.classList.remove('is-drag-over');
          const dropped = e.dataTransfer?.files?.[0];
          if (!dropped) return;
          close();
          void openSelectedBrowserFile(dropped).catch((err) => {
            actions.notify(err instanceof Error ? err.message : 'Unable to open dropped file.');
          });
        },
      },
    },
    icon('folder', 26),
    el('strong', { text: 'Drop a Quillvibe or Manuscript File Here' }),
    el('span', {
      className: 'bv-label',
      text: 'Supports .qv, .qvbible, .qvscene, .qvstyle, .qvdesign, .qvext, .docx, .md, .txt, .html, .rtf',
    }),
  );

  const browseBtn = el(
    'button',
    {
      className: 'bv-btn bv-btn-primary',
      attrs: { type: 'button' },
      on: {
        click: () => {
          if (desktopMode) {
            void (async () => {
              const opened = await openQuillvibeFile();
              if (!opened) return;
              close();
              const resolved = resolveOpenedFilePayload(opened);
              await handleOpenedFile(resolved.input, opened.filename, {
                base64Encoded: resolved.base64Encoded,
                allowLegacy: false,
              });
            })();
          } else {
            fileInput.click();
          }
        },
      },
    },
    icon('folder', 14),
    'Browse Files…',
  );

  const importDocBtn = el(
    'button',
    {
      className: 'bv-btn',
      text: 'Import Word / Markdown…',
      attrs: { type: 'button' },
      on: {
        click: () => {
          close();
          void actions.importExternalDocument();
        },
      },
    },
  );

  const modal = el(
    'div',
    {
      className: 'bv-modal',
      style: { maxWidth: '520px' },
      attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Open File' },
    },
    el(
      'div',
      { className: 'bv-panel-head' },
      el('span', { className: 'bv-panel-title', text: 'Open Book, Package, or Manuscript' }),
      el('button', {
        className: 'bv-mini-btn',
        text: 'Close',
        attrs: { type: 'button' },
        on: { click: close },
      }),
    ),
    el(
      'div',
      { className: 'bv-modal-body', style: { gap: '14px' } },
      fileInput,
      dropzone,
      el(
        'div',
        { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' } },
        ...(desktopMode ? [importDocBtn] : []),
        browseBtn,
        el('button', {
          className: 'bv-btn',
          text: 'Cancel',
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
      id: 'bv-open-file-modal',
      on: {
        click: (e) => {
          if (e.target === backdrop) close();
        },
      },
    },
    modal,
  );
  backdrop.addEventListener('bv-close-modal', close);
  document.body.appendChild(backdrop);
}

async function handleOpenedFile(
  input: Uint8Array | string,
  filename: string,
  options: { base64Encoded?: boolean; allowLegacy?: boolean; password?: string; openInNewTab?: boolean } = {},
): Promise<void> {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.qvext') || lower.endsWith('.bvext')) {
    const rawJson = typeof input === 'string' ? input : new TextDecoder().decode(input);
    setExtensionsPageOptions({
      initialTab: 'external',
      pendingExternalRawJson: rawJson,
    });
    actions.openExtensionsModal('external');
    return;
  }

  const detectedExt = extractAnyImportableExtensionFromFilename(filename);
  if (detectedExt && isLegacyImportExtension(detectedExt) && !options.allowLegacy) {
    showErrorDialog({
      code: 'QV-101',
      message: `Legacy ${detectedExt} files no longer open automatically. Use Settings -> Publishing & Archive -> Import Legacy Archive.`,
      onOpenHelp: (q) => actions.openHelpPage(q),
    });
    return;
  }

  try {
    const decoded = await parseQuillvibeInput(input, {
      filenameHint: filename,
      base64Encoded: options.base64Encoded,
      password: options.password,
    });
    const baseProject = state.project;
    const applied = applyOpenedExtensionFile(decoded.parsed, baseProject);
    state.project = applied.project;
    state.library = upsertBookInLibrary(state.library, state.project);
    rememberLastBook(state.project.id);
    const shouldUseNewTab = Boolean(
      isTauriRuntime() &&
        state.settings.enableDesktopBookTabs &&
        (options.openInNewTab || decoded.parsed.extension === '.qv' || isNonBookTabId(state.activeTabId)),
    );
    if (shouldUseNewTab) {
      if (isEmptyTabId(state.activeTabId)) {
        tabManager.replaceTab(state.activeTabId, state.project.id, { activate: true });
      } else {
        tabManager.openTab(state.project.id, { activate: true });
      }
      syncTabsFromManager(true);
    } else if (isNonBookTabId(state.activeTabId)) {
      tabManager.openTab(state.project.id, { activate: true });
      syncTabsFromManager(true);
    }
    state.activeView = applied.focusView;
    if (applied.focusTypesetSubTab) {
      state.typesetSubTab = applied.focusTypesetSubTab;
    }
    if (applied.focusSceneId) {
      state.activeSceneId = applied.focusSceneId;
    } else if (!findSceneContext(state.project, state.activeSceneId)) {
      state.activeSceneId = getAllScenes(state.project)[0]?.scene.id ?? '';
    }
    windowSync?.publishPresence();
    schedulePersist();
    renderDesktopTabBar();
    renderActiveView();
    actions.notify(applied.summaryMessage);
  } catch (err) {
    if (
      err instanceof QuillvibeCodecError &&
      (err.code === 'PASSWORD_REQUIRED' || err.code === 'WRONG_PASSWORD_OR_DAMAGED')
    ) {
      const retryNote =
        err.code === 'WRONG_PASSWORD_OR_DAMAGED'
          ? `Wrong password or damaged file for “${filename}”. Try your password again:`
          : `Enter the password set when “${filename}” was exported.`;
      const pw = await promptQuillvibePasswordModal(
        filename,
        err.code === 'WRONG_PASSWORD_OR_DAMAGED' ? 'Incorrect Password or Damaged File' : 'Password Required',
        retryNote,
      );
      if (pw !== null && pw.length > 0) {
        await handleOpenedFile(input, filename, { ...options, password: pw });
      }
      return;
    }
    const message = err instanceof Error ? err.message : 'Unable to open Quillvibe file.';
    const errCode =
      err instanceof QuillvibeCodecError
        ? err.code === 'WRONG_PASSWORD_OR_DAMAGED'
          ? 'QV-102'
          : 'QV-103'
        : 'QV-104';
    showErrorDialog({
      code: errCode,
      message: `Could not open “${filename}”: ${message}`,
      details: err instanceof Error ? err.stack : undefined,
      onOpenHelp: (q) => actions.openHelpPage(q),
    });
  }
}

const actions: AppActions = {
  getState: () => state,

  setState(patch, rerender = true) {
    const prevView = state.activeView;
    const prevSubTab = state.typesetSubTab;
    const prevEditorSubMode = state.editorSubMode;
    Object.assign(state, patch);

    if (patch.activeView && patch.activeView !== prevView) {
      destroyActiveTour();
      // Auto-collapse Binder & Inspector when opening full-stage or dedicated pages, restore when leaving
      const prevFullStage = isFullStageView(prevView);
      const nextFullStage = isFullStageView(patch.activeView);
      if (nextFullStage && !prevFullStage) {
        savedDrawerStateBeforeTypeset = {
          binder: state.showBinder,
          inspector: state.showInspector,
        };
        state.showBinder = false;
        state.showInspector = false;
      } else if (prevFullStage && !nextFullStage && savedDrawerStateBeforeTypeset) {
        if (window.innerWidth > 960) {
          state.showBinder = savedDrawerStateBeforeTypeset.binder;
        }
        if (window.innerWidth > COMPACT_SIDEBAR_BREAKPOINT) {
          state.showInspector = savedDrawerStateBeforeTypeset.inspector;
        } else if (state.showBinder && savedDrawerStateBeforeTypeset.inspector) {
          state.showInspector = false;
        }
        savedDrawerStateBeforeTypeset = null;
      }
    }

    if (
      !isTauriRuntime() &&
      ((patch.activeView && patch.activeView !== prevView) ||
        (patch.typesetSubTab && patch.typesetSubTab !== prevSubTab) ||
        (patch.editorSubMode && patch.editorSubMode !== prevEditorSubMode))
    ) {
      syncBrowserPath(routeForState(state.activeView, state.typesetSubTab, state.editorSubMode));
    }

    if (rerender) {
      renderActiveView();
    } else {
      syncResponsiveDrawerClasses();
      if (patch.showInspector && inspectorEl && inspectorEl.childElementCount === 0) {
        renderInspector(inspectorEl, actions);
      }
    }
    if (patch.activeView && patch.activeView !== prevView && state.activeView !== 'course') {
      requestAnimationFrame(() => maybeStartSectionTour(state.activeView, actions));
    }
  },

  updateSettings(patch: Partial<QuillvibeSettings>) {
    const prevTheme = state.settings.appTheme;
    const prevTier = state.settings.toolTier;
    const prevToolbar = state.settings.toolbarDisplayMode;
    const prevDesktopTabs = state.settings.enableDesktopBookTabs;
    state.settings = saveSettings({ ...state.settings, ...patch });
    applySettingsToDocument(state.settings);
    if (
      state.settings.linkPaperThemeToAppTheme &&
      (patch.appTheme !== undefined || patch.linkPaperThemeToAppTheme === true)
    ) {
      const targetPaper = mapAppThemeToPaperTheme(state.settings.appTheme);
      if (state.project.paperTheme !== targetPaper) {
        state.project = normalizeProjectDefaults({ ...state.project, paperTheme: targetPaper });
        schedulePersist();
      }
    }
    syncWindowAndDocumentTitle();
    syncThemeButtonIcon();
    immersiveHud?.sync();
    if (patch.enableDesktopBookTabs !== undefined && patch.enableDesktopBookTabs !== prevDesktopTabs) {
      renderDesktopTabBar();
    }
    if (
      patch.appTheme !== undefined && patch.appTheme !== prevTheme ||
      patch.toolTier !== undefined && patch.toolTier !== prevTier ||
      patch.toolbarDisplayMode !== undefined && patch.toolbarDisplayMode !== prevToolbar
    ) {
      renderActiveView();
    }
  },

  mutateProject(updater: (prev: BookProject) => BookProject, rerender = true) {
    if (!isApplyingHistory) {
      projectHistory.pushSnapshot(state.project, `Edit ${state.activeView}`);
    }
    const prevPaper = state.project.paperTheme;
    const nextProj = normalizeProjectDefaults(updater(state.project));
    nextProj.updatedAt = new Date().toISOString();
    state.project = nextProj;
    rememberLastBook(state.project.id);
    if (
      state.settings.linkPaperThemeToAppTheme &&
      state.project.paperTheme !== prevPaper
    ) {
      const nextAppTheme = mapPaperThemeToAppTheme(state.project.paperTheme);
      if (state.settings.appTheme !== nextAppTheme) {
        state.settings = saveSettings({ ...state.settings, appTheme: nextAppTheme });
        applySettingsToDocument(state.settings);
        syncThemeButtonIcon();
      }
    }
    schedulePersist();
    syncWindowAndDocumentTitle();
    renderDesktopTabBar();
    if (rerender) renderActiveView();
    else {
      updateWordCountersOnly();
      immersiveHud?.sync();
    }
  },

  updateActiveSceneTextQuietly(field, value) {
    if (!isApplyingHistory) {
      const activeTitle = findSceneContext(state.project, state.activeSceneId)?.scene.title || 'Scene';
      projectHistory.pushSnapshot(
        state.project,
        field === 'content' ? `${activeTitle} prose` : `${activeTitle} title`,
        900,
      );
    }
    if (field === 'content') {
      const ctx = findSceneContext(state.project, state.activeSceneId);
      const prevMarks = ctx?.scene.proofreadMarks;
      const prevContent = ctx?.scene.content ?? '';
      const aligned = realignMarksAfterEdit(prevMarks, prevContent, value);
      state.project = updateSceneInProject(state.project, state.activeSceneId, {
        content: value,
        proofreadMarks: aligned,
      });
    } else {
      state.project = updateSceneInProject(state.project, state.activeSceneId, { title: value });
    }
    state.project.updatedAt = new Date().toISOString();
    rememberLastBook(state.project.id);
    schedulePersist();
    updateWordCountersOnly();
    const undoBtn = mainStageEl?.querySelector<HTMLButtonElement>('[aria-label="Undo edit"]');
    if (undoBtn) undoBtn.disabled = !actions.canUndo();
    const redoBtn = mainStageEl?.querySelector<HTMLButtonElement>('[aria-label="Redo edit"]');
    if (redoBtn) redoBtn.disabled = !actions.canRedo();
  },

  selectScene(sceneId, switchToEditor = true) {
    actions.setState(
      {
        activeSceneId: sceneId,
        ...(switchToEditor ? { activeView: 'editor' } : {}),
        ...(window.innerWidth <= 960 ? { showBinder: false } : {}),
      },
      true,
    );
  },

  returnToWriting() {
    if (!isTauriRuntime()) {
      actions.setState({ activeView: 'editor' }, true);
      return;
    }
    const validBooks = state.library.books;
    const latestSorted = sortLibraryBooksByLatest(validBooks);
    const preferredId =
      lastOpenedBookId && validBooks.some((b) => b.id === lastOpenedBookId)
        ? lastOpenedBookId
        : latestSorted[0]?.id ?? state.project.id;

    state.activeView = 'editor';
    if (preferredId && validBooks.some((b) => b.id === preferredId)) {
      tabManager.openTab(preferredId, { activate: true });
      if (state.project.id !== preferredId) {
        actions.switchBook(preferredId);
      } else {
        syncTabsFromManager(true);
        rememberLastBook(preferredId);
        windowSync?.publishPresence();
        renderDesktopTabBar();
        renderActiveView();
      }
      return;
    }
    actions.setState({ activeView: 'editor' }, true);
  },

  openBibleEntry(category, entryId) {
    actions.setState(
      {
        activeView: 'bible',
        bibleCategory: category,
        activeBibleId: entryId,
      },
      true,
    );
  },

  openExtensionsModal(initialTab?: ExtensionsModalTab) {
    setExtensionsPageOptions({ initialTab });
    if (!isTauriRuntime()) {
      actions.setState({ activeView: 'extensions' }, true);
      return;
    }
    if (isEmptyTabId(state.activeTabId)) {
      tabManager.replaceTab(state.activeTabId, EXTENSIONS_TAB_ID, { activate: true });
    } else {
      tabManager.openTab(EXTENSIONS_TAB_ID, { activate: true });
    }
    syncTabsFromManager(true);
    state.activeView = 'extensions';
    renderDesktopTabBar();
    renderActiveView();
  },

  openLibraryModal() {
    showLibraryModal(actions);
  },

  openCollabModal() {
    showCollabModal(actions);
  },

  openSettingsModal(initialTab = 'editor') {
    setSettingsPageTab(initialTab);
    if (!isTauriRuntime()) {
      actions.setState({ activeView: 'settings' }, true);
      return;
    }
    if (isEmptyTabId(state.activeTabId)) {
      tabManager.replaceTab(state.activeTabId, SETTINGS_TAB_ID, { activate: true });
    } else {
      tabManager.openTab(SETTINGS_TAB_ID, { activate: true });
    }
    syncTabsFromManager(true);
    state.activeView = 'settings';
    renderDesktopTabBar();
    renderActiveView();
  },

  openHelpModal(initialTab = 'course') {
    setManualPageTab(initialTab);
    if (!isTauriRuntime()) {
      actions.setState({ activeView: 'manual' }, true);
      return;
    }
    if (isEmptyTabId(state.activeTabId)) {
      tabManager.replaceTab(state.activeTabId, MANUAL_TAB_ID, { activate: true });
    } else {
      tabManager.openTab(MANUAL_TAB_ID, { activate: true });
    }
    syncTabsFromManager(true);
    state.activeView = 'manual';
    renderDesktopTabBar();
    renderActiveView();
  },

  openCoursePage(moduleId?: string, lessonId?: string) {
    setCoursePageSelection(moduleId, lessonId);
    if (!isTauriRuntime()) {
      actions.setState({ activeView: 'course' }, true);
      return;
    }
    if (isEmptyTabId(state.activeTabId)) {
      tabManager.replaceTab(state.activeTabId, COURSE_TAB_ID, { activate: true });
    } else {
      tabManager.openTab(COURSE_TAB_ID, { activate: true });
    }
    syncTabsFromManager(true);
    state.activeView = 'course';
    renderDesktopTabBar();
    renderActiveView();
  },

  openHelpPage(query?: string) {
    setHelpPageSearch(query);
    if (!isTauriRuntime()) {
      actions.setState({ activeView: 'help' }, true);
      return;
    }
    if (isEmptyTabId(state.activeTabId)) {
      tabManager.replaceTab(state.activeTabId, HELP_TAB_ID, { activate: true });
    } else {
      tabManager.openTab(HELP_TAB_ID, { activate: true });
    }
    syncTabsFromManager(true);
    state.activeView = 'help';
    renderDesktopTabBar();
    renderActiveView();
  },

  openDeveloperPage() {
    if (isTauriRuntime()) {
      window.open('https://quillvibe.jhonrey.com/developer', '_blank', 'noopener,noreferrer');
      return;
    }
    if (state.activeView === 'developer') {
      renderActiveView();
      return;
    }
    const win = window.open('/developer', '_blank', 'noopener,noreferrer');
    if (!win) {
      actions.setState({ activeView: 'developer' }, true);
    }
  },

  startInteractiveCourse(moduleIdx = 0) {
    openInteractiveCourseDrawer(actions, moduleIdx);
  },

  async toggleImmersiveMode(force?: boolean) {
    if (!isTauriRuntime()) return;
    const target = force !== undefined ? force : !state.immersiveMode;
    const actual = await setDesktopFullscreen(target);
    state.immersiveMode = actual;
    shellEl?.classList.toggle('is-immersive', actual);
    immersiveBtnEl?.classList.toggle('is-active', actual);
    immersiveHud?.sync();
  },

  async openNewWindow(bookId?: string) {
    if (!isTauriRuntime()) return;
    if (!isEmptyTabId(state.activeTabId)) {
      const syncedLib = upsertBookInLibrary(state.library, state.project);
      state.library = syncedLib;
      await persistLibrary(JSON.stringify(syncedLib));
    }
    const targetId = bookId?.trim() ? bookId.trim() : EMPTY_TAB_PREFIX;
    const targetBook =
      !isEmptyTabId(targetId)
        ? state.library.books.find((b) => b.id === targetId)
        : null;
    const winTitle = targetBook
      ? `Quillvibe - ${targetBook.title || 'Untitled Book'}`
      : 'Quillvibe - New Tab';
    const res = await openBookInNewDesktopWindow(targetId, winTitle);
    if (res.ok) {
      actions.notify(
        targetBook
          ? `Opened “${targetBook.title}” in new window`
          : 'Opened new Quillvibe window',
      );
    } else {
      actions.notify(res.error || 'Could not open new desktop window.');
    }
  },

  openBookInTab(bookId: string) {
    if (!state.library.books.some((b) => b.id === bookId)) return;
    const wasEmpty = isEmptyTabId(state.activeTabId);
    tabManager.openTab(bookId, { activate: false });
    if (state.project.id !== bookId || wasEmpty) {
      actions.switchBook(bookId);
    } else {
      tabManager.setActiveTabId(bookId);
      syncTabsFromManager(true);
      windowSync?.publishPresence();
      renderDesktopTabBar();
      renderActiveView();
      maybeNotifySharedBook(bookId);
    }
  },

  openEmptyTab() {
    const newId = createEmptyTabId();
    tabManager.openTab(newId, { activate: true });
    syncTabsFromManager(true);
    windowSync?.publishPresence();
    renderDesktopTabBar();
    renderActiveView();
  },

  closeBookTab(tabId: string) {
    tabDragController.handleTabRemoved(tabId);
    const validIds = new Set(state.library.books.map((b) => b.id));
    tabManager.prune((id) => validIds.has(id), state.project.id);
    const wasActive = tabManager.getActiveTabId() === tabId;
    const wasDisplayedProject = state.project.id === tabId;
    const res = tabManager.closeTab(tabId);
    if (!res.closed) return;
    syncTabsFromManager(true);
    pendingFocusTabIdAfterRender = res.nextActiveId;
    const targetId = res.nextActiveId || tabManager.getActiveTabId();
    if ((wasActive || wasDisplayedProject) && targetId) {
      if (isNonBookTabId(targetId)) {
        state.activeView =
          targetId === COURSE_TAB_ID
            ? 'course'
            : targetId === HELP_TAB_ID
              ? 'help'
              : targetId === SETTINGS_TAB_ID
                ? 'settings'
                : targetId === MANUAL_TAB_ID
                  ? 'manual'
                  : targetId === EXTENSIONS_TAB_ID
                    ? 'extensions'
                    : 'editor';
        windowSync?.publishPresence();
        renderDesktopTabBar();
        renderActiveView();
        return;
      }
      state.activeView = 'editor';
      actions.switchBook(targetId);
      return;
    }
    windowSync?.publishPresence();
    renderDesktopTabBar();
    renderActiveView();
  },

  mergeAllWindowsHere() {
    if (!isTauriRuntime() || !windowSync) return;
    const otherCount = windowSync.getOtherOpenWindowCount();
    if (otherCount === 0) {
      actions.notify('Only this Quillvibe window is currently open.');
      return;
    }
    windowSync.requestMergeAllWindowsHere();
    actions.notify(`Combining tabs from ${otherCount} other window${otherCount > 1 ? 's' : ''}…`);
  },

  replayWalkthrough() {
    replayFullWalkthrough(actions);
  },

  async importExternalDocument() {
    const picker = document.createElement('input');
    picker.type = 'file';
    picker.accept = '.docx,.html,.htm,.rtf,.md,.markdown,.txt';
    picker.onchange = async () => {
      const file = picker.files?.[0];
      if (!file) return;
      try {
        const imported = await importAnyExternalDocumentFile(file);
        actions.replaceLibrary({
          activeBookId: imported.id,
          books: [...state.library.books, imported],
        });
        actions.notify(`Imported “${imported.title}”`);
      } catch (err) {
        actions.notify(err instanceof Error ? err.message : 'Unable to import external manuscript.');
      }
    };
    picker.click();
  },

  switchBook(bookId: string) {
    const baseLib = isEmptyTabId(state.activeTabId)
      ? state.library
      : upsertBookInLibrary(state.library, state.project);
    const updatedLib = switchActiveBook(baseLib, bookId);
    state.library = updatedLib;
    state.project = getActiveBookFromLibrary(updatedLib);
    rememberLastBook(state.project.id);
    tabManager.openTab(state.project.id, { activate: true });
    syncTabsFromManager(true);
    state.activeSceneId = getAllScenes(state.project)[0]?.scene.id ?? '';
    state.activeBibleId = state.project.bible.characters[0]?.id ?? '';
    state.activeGraphNodeId = state.project.storyGraph?.nodes[0]?.id ?? '';
    state.sprintStartWords = getProjectWordCount(state.project);
    windowSync?.publishPresence();
    schedulePersist();
    renderDesktopTabBar();
    renderActiveView();
    maybeNotifySharedBook(state.project.id);
    actions.notify(`Switched to “${state.project.title}”`);
  },

  replaceLibrary(library: BookLibraryState) {
    const sortedLib: BookLibraryState = {
      activeBookId: library.activeBookId,
      books: sortLibraryBooksByLatest(library.books),
    };
    state.library = sortedLib;
    state.project = getActiveBookFromLibrary(sortedLib);
    rememberLastBook(state.project.id);
    const validIds = new Set(sortedLib.books.map((b) => b.id));
    tabManager.prune((id) => validIds.has(id), state.project.id);
    if (!tabManager.hasTab(state.project.id)) {
      tabManager.openTab(state.project.id, { activate: false });
    }
    if (!isNonBookTabId(state.activeTabId) || !tabManager.hasTab(state.activeTabId)) {
      tabManager.setActiveTabId(state.project.id);
    }
    syncTabsFromManager(true);
    state.activeSceneId = getAllScenes(state.project)[0]?.scene.id ?? '';
    state.activeBibleId = state.project.bible.characters[0]?.id ?? '';
    state.activeGraphNodeId = state.project.storyGraph?.nodes[0]?.id ?? '';
    state.sprintStartWords = getProjectWordCount(state.project);
    windowSync?.publishPresence();
    schedulePersist({ authoritativeLibrary: true });
    renderDesktopTabBar();
    renderActiveView();
  },

  setDefaultExportFormat(fmt: ExportFormatId) {
    state.defaultExportFormat = fmt;
    saveDefaultExportFormat(fmt);
    if (exportFormatSelectEl) exportFormatSelectEl.value = fmt;
    syncExportSelectWidth();
    actions.notify(`Default export format set to ${fmt}`);
  },

  async exportDefaultFormat() {
    const fmt = state.defaultExportFormat;
    if (fmt === '.pdf') return actions.exportPdf();
    if (fmt === '.epub') return actions.exportEpub();
    if (fmt === '.docx') return actions.exportDocx();
    if (fmt === '.md') return actions.exportMarkdown();
    if (fmt === '.html') return actions.exportHtml();
    if (fmt === '.txt') return actions.exportPlainText();
    return actions.exportAsExtension(fmt);
  },

  async openAnyQuillvibeFile() {
    showOpenFileDropDialog();
  },

  async importLegacyBookFile() {
    const opened = await importLegacyBookFile();
    if (!opened) return;
    const resolved = resolveOpenedFilePayload(opened);
    await handleOpenedFile(resolved.input, opened.filename, {
      base64Encoded: resolved.base64Encoded,
      allowLegacy: true,
    });
  },

  async exportAsExtension(
    ext: QuillvibeExtension,
    options?: { sceneId?: string; password?: string; skipPartialConfirm?: boolean },
  ) {
    try {
      const perms = getActiveSessionPermissions(state.project);
      if (!perms.canExportFiles) {
        actions.notify('Exporting is disabled for your collaborator role.');
        return;
      }
      if (ext !== '.qv' && !options?.skipPartialConfirm) {
        const decision = await confirmPartialQuillvibeExport(ext);
        if (decision === 'cancel') return;
        if (decision === 'full') {
          return actions.exportAsExtension('.qv', { ...options, skipPartialConfirm: true });
        }
      }
      let password = options?.password;
      if (password === undefined && state.project.publishing?.enterpriseRequirePasswordExport) {
        const entered = await promptQuillvibePasswordModal(
          `${state.project.title || 'book'}${ext}`,
          'Set Export Password',
          'Your enterprise policy requires a password when exporting protected Quillvibe files.',
        );
        if (entered === null || !entered.trim()) {
          actions.notify('Export cancelled: password required by enterprise policy.');
          return;
        }
        password = entered;
      }
      const binary = await runWithExportLoading(`Encrypting ${ext} package…`, () =>
        serializeQuillvibeBinary(ext, state.project, {
          sceneId: options?.sceneId ?? state.activeSceneId,
          password,
        }),
      );
      const saved = await saveQuillvibeExtensionFile(ext, binary, state.project.title);
      if (saved) {
        actions.notify(
          password ? `Saved password-locked ${ext} file` : `Saved protected ${ext} file`,
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Export failed.';
      actions.notify(msg);
    }
  },

  async exportEpub() {
    if (!getActiveSessionPermissions(state.project).canExportFiles) {
      actions.notify('Exporting is disabled for your collaborator role.');
      return;
    }
    try {
      const out = await runWithExportLoading('Building EPUB 3 eBook…', async () => {
        const coverPng = await renderCoverToPngDataUrl(state.project, 1200, 1920);
        return exportBookAsEpub(state.project, coverPng);
      });
      if (out) actions.notify('Exported EPUB 3 eBook with Cover & Credits');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'EPUB export failed.';
      actions.notify(msg);
    }
  },

  async exportDocx() {
    if (!getActiveSessionPermissions(state.project).canExportFiles) {
      actions.notify('Exporting is disabled for your collaborator role.');
      return;
    }
    try {
      const out = await runWithExportLoading('Generating Word-Compatible .docx…', () =>
        exportBookAsDocx(state.project),
      );
      if (out) actions.notify('Exported complete .docx manuscript');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Document (.docx) export failed.';
      actions.notify(msg);
    }
  },

  async exportPdf() {
    if (!getActiveSessionPermissions(state.project).canExportFiles) {
      actions.notify('Exporting is disabled for your collaborator role.');
      return;
    }
    try {
      const out = await runWithExportLoading('Generating Print Interior PDF…', () =>
        exportBookAsPdf(state.project),
      );
      if (out) actions.notify('Exported Print Interior PDF (.pdf)');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'PDF export failed.';
      actions.notify(msg);
    }
  },

  async exportMarkdown() {
    if (!getActiveSessionPermissions(state.project).canExportFiles) {
      actions.notify('Exporting is disabled for your collaborator role.');
      return;
    }
    try {
      const out = await runWithExportLoading('Exporting Markdown (.md)…', () =>
        exportBookAsMarkdown(state.project),
      );
      if (out) actions.notify('Exported Markdown manuscript');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Markdown export failed.';
      actions.notify(msg);
    }
  },

  async exportHtml() {
    if (!getActiveSessionPermissions(state.project).canExportFiles) {
      actions.notify('Exporting is disabled for your collaborator role.');
      return;
    }
    try {
      const out = await runWithExportLoading('Exporting HTML Book (.html)…', () =>
        exportBookAsHtml(state.project),
      );
      if (out) actions.notify('Exported HTML web book');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'HTML export failed.';
      actions.notify(msg);
    }
  },

  async exportPlainText() {
    if (!getActiveSessionPermissions(state.project).canExportFiles) {
      actions.notify('Exporting is disabled for your collaborator role.');
      return;
    }
    try {
      const out = await runWithExportLoading('Exporting Plain Text (.txt)…', () =>
        exportBookAsPlainText(state.project),
      );
      if (out) actions.notify('Exported plain text manuscript');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Plain text export failed.';
      actions.notify(msg);
    }
  },

  async exportCoverPng() {
    try {
      const saved = await runWithExportLoading('Rendering Front Cover PNG…', async () => {
        const coverPng = await renderCoverToPngDataUrl(state.project, 1200, 1920);
        if (!coverPng) throw new Error('Unable to render cover PNG.');
        return exportCoverPngDownload(coverPng, state.project.title, 'front');
      });
      if (saved) actions.notify('Exported Cover PNG (1200×1920)');
    } catch (err) {
      actions.notify(err instanceof Error ? err.message : 'Cover export failed.');
    }
  },

  async exportFullWrapPng() {
    try {
      const saved = await runWithExportLoading('Rendering Full Cover Wrap PNG…', async () => {
        const wrapPng = await renderFullWrapToPngDataUrl(state.project, 960, 1500);
        if (!wrapPng) throw new Error('Unable to render full cover wrap PNG.');
        return exportCoverPngDownload(wrapPng, state.project.title, 'wrap');
      });
      if (saved) actions.notify('Exported Full Cover Wrap PNG (Back, Spine, Front)');
    } catch (err) {
      actions.notify(err instanceof Error ? err.message : 'Full wrap export failed.');
    }
  },

  printTypeset() {
    const project = state.project;
    const typo = project.typography;
    const trim = TRIM_SPECS[typo.trimSize] ?? TRIM_SPECS['6x9'];
    const identity = ensureAuthorIdentity(project);
    const penName = identity.penName || project.author;
    const font = resolveEffectiveFontCss(typo.fontFamily, typo.customFontFamily);
    const showPageNumbers = typo.includePageNumbers !== false;
    const { tocEntries, pages } = computeBookPagination(project);

    document.getElementById('qv-print-mount')?.remove();
    document.getElementById('qv-print-page-style')?.remove();

    const pageStyle = document.createElement('style');
    pageStyle.id = 'qv-print-page-style';
    pageStyle.textContent = `@page { size: ${trim.cssPageSize}; margin: 0; }
      #qv-print-mount { font-family: ${font}; font-size: ${typo.fontSizePt}pt; line-height: ${typo.lineHeight}; }
      #qv-print-mount .qv-print-sheet { width: ${trim.widthIn}in; height: ${trim.heightIn}in; padding: ${typo.marginInches}in; }`;

    const mount = el('div', { id: 'qv-print-mount', className: 'qv-print-mount' });
    for (const sheet of pages) {
      if (sheet.kind === 'front-matter') {
        mount.appendChild(
          el(
            'section',
            { className: 'qv-print-sheet qv-print-front' },
            el(
              'div',
              { className: 'qv-print-front-top' },
              el('h1', { className: 'qv-print-front-title', text: typo.smartTypography ? applySmartTypography(project.title) : project.title }),
              ...(project.subtitle ? [el('p', { className: 'qv-print-front-sub', text: typo.smartTypography ? applySmartTypography(project.subtitle) : project.subtitle })] : []),
              el('p', { className: 'qv-print-front-author', text: penName }),
            ),
            el(
              'div',
              { className: 'qv-print-front-bottom' },
              ...(project.dedication ? [el('p', { className: 'qv-print-dedication', text: project.dedication })] : []),
              el('p', { className: 'qv-print-copy', text: project.copyrightNotice }),
              ...(project.collaborators ?? []).map((c) =>
                el('p', { className: 'qv-print-credit', text: `${COLLABORATOR_ROLE_LABELS[c.role]}: ${c.creditLine}` }),
              ),
              el('div', { className: 'qv-print-footer', text: showPageNumbers ? String(sheet.pageNumber) : '' }),
            ),
          ),
        );
        continue;
      }
      if (sheet.kind === 'toc') {
        mount.appendChild(
          el(
            'section',
            { className: 'qv-print-sheet' },
            el(
              'div',
              {},
              el('p', { className: 'qv-print-kicker', text: 'Contents' }),
              el('h2', { className: 'qv-print-chapter-title', text: 'Table of Contents' }),
              el(
                'div',
                { className: 'qv-print-toc-list' },
                ...tocEntries.map((entry) =>
                  el(
                    'div',
                    { className: 'qv-print-toc-row' },
                    el('span', { text: `${entry.chapterLabel} — ${entry.chapterTitle}` }),
                    el('span', { className: 'qv-print-toc-dots' }),
                    el('span', { text: String(entry.pageNumber) }),
                  ),
                ),
              ),
            ),
            el('div', { className: 'qv-print-footer', text: showPageNumbers ? String(sheet.pageNumber) : '' }),
          ),
        );
        continue;
      }

      const proseWrap = el('div', { className: 'qv-print-prose' });
      for (const blk of sheet.blocks) {
        if (blk.kind === 'scene-break') {
          proseWrap.appendChild(el('p', { className: 'qv-print-scene-break', text: '* * *' }));
        } else if (blk.kind === 'blockquote') {
          proseWrap.appendChild(el('blockquote', { text: blk.text.replace(/\*\*([^*\n]+)\*\*/g, '$1').replace(/\*([^*\n]+)\*/g, '$1') }));
        } else {
          const p = el('p', {
            className: `${blk.dropCap ? 'drop-cap ' : ''}${!blk.indent ? 'no-indent' : ''}`.trim(),
            text: blk.text.replace(/\*\*([^*\n]+)\*\*/g, '$1').replace(/\*([^*\n]+)\*/g, '$1'),
          });
          proseWrap.appendChild(p);
        }
      }
      mount.appendChild(
        el(
          'section',
          { className: 'qv-print-sheet' },
          el(
            'div',
            {},
            ...(project.publishing?.arcWatermarkText?.trim()
              ? [el('div', { className: 'qv-print-arc', text: project.publishing.arcWatermarkText.trim() })]
              : []),
            ...(typo.runningHeader
              ? [el('div', { className: 'qv-print-head' }, el('span', { text: penName }), el('span', { text: project.title }))]
              : []),
            ...(sheet.isChapterStart
              ? [
                  el('p', { className: 'qv-print-kicker', text: sheet.chapterLabel ?? '' }),
                  el('h2', { className: 'qv-print-chapter-title', text: sheet.chapterTitle ?? '' }),
                ]
              : []),
            proseWrap,
          ),
          el('div', { className: 'qv-print-footer', text: showPageNumbers ? String(sheet.pageNumber) : '' }),
        ),
      );
    }

    document.head.appendChild(pageStyle);
    document.body.appendChild(mount);

    const cleanup = () => {
      document.getElementById('qv-print-mount')?.remove();
      document.getElementById('qv-print-page-style')?.remove();
      window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup, { once: true });
    requestAnimationFrame(() => {
      try {
        window.print();
      } catch {
        void actions.exportPdf();
        cleanup();
      }
    });
    window.setTimeout(cleanup, 90000);
  },

  undo() {
    if (state.activeView === 'typeset' && state.typesetSubTab === 'cover' && hasCoverHistory().undo) {
      return performCoverUndo(actions);
    }
    const prev = projectHistory.undo(state.project);
    if (!prev) return false;
    isApplyingHistory = true;
    try {
      state.project = normalizeProjectDefaults(prev.state);
      if (!findSceneContext(state.project, state.activeSceneId)) {
        state.activeSceneId = getAllScenes(state.project)[0]?.scene.id ?? '';
      }
      schedulePersist();
      syncWindowAndDocumentTitle();
      renderActiveView();
      actions.notify(`Undid ${prev.label}`);
      return true;
    } finally {
      isApplyingHistory = false;
    }
  },

  redo() {
    if (state.activeView === 'typeset' && state.typesetSubTab === 'cover' && hasCoverHistory().redo) {
      return performCoverRedo(actions);
    }
    const next = projectHistory.redo(state.project);
    if (!next) return false;
    isApplyingHistory = true;
    try {
      state.project = normalizeProjectDefaults(next.state);
      if (!findSceneContext(state.project, state.activeSceneId)) {
        state.activeSceneId = getAllScenes(state.project)[0]?.scene.id ?? '';
      }
      schedulePersist();
      syncWindowAndDocumentTitle();
      renderActiveView();
      actions.notify(`Redid ${next.label}`);
      return true;
    } finally {
      isApplyingHistory = false;
    }
  },

  canUndo() {
    if (state.activeView === 'typeset' && state.typesetSubTab === 'cover') {
      return hasCoverHistory().undo || projectHistory.canUndo();
    }
    return projectHistory.canUndo();
  },

  canRedo() {
    if (state.activeView === 'typeset' && state.typesetSubTab === 'cover') {
      return hasCoverHistory().redo || projectHistory.canRedo();
    }
    return projectHistory.canRedo();
  },

  createSnapshot(label?: string) {
    const res = createSnapshotForScene(state.project, state.activeSceneId, label);
    if (!res.snapshot) return;
    state.project = res.project;
    state.diffSnapshotId = res.snapshot.id;
    schedulePersist();
    renderActiveView();
    actions.notify(`Snapshot saved (${res.snapshot.wordCount}w)`);
  },

  notify(message: string) {
    const prev = document.getElementById('bv-toast');
    if (prev) prev.remove();
    if (toastTimer !== null) window.clearTimeout(toastTimer);

    const toast = el('div', {
      className: 'bv-toast',
      id: 'bv-toast',
      text: message,
      attrs: { role: 'status', 'aria-live': 'polite' },
    });
    document.body.appendChild(toast);
    toastTimer = window.setTimeout(() => toast.remove(), 3400);
  },

  refreshWordCounters: updateWordCountersOnly,
};

function createDesktopWindowControlsEl(): HTMLElement {
  return el(
    'div',
    { className: 'bv-win-controls' },
    el(
      'button',
      {
        className: 'bv-win-btn',
        tooltip: { title: 'Minimize Window', short: 'Minimize Quillvibe to the taskbar or dock.' },
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
        tooltip: { title: 'Maximize / Restore', short: 'Toggle full window size or restore bounds.' },
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
        tooltip: { title: 'Close Window', short: 'Exit Quillvibe desktop window.' },
        attrs: { type: 'button', 'aria-label': 'Close window' },
        on: { click: () => void closeDesktopWindow() },
      },
      (() => {
        const s = svgEl('svg', { width: 12, height: 12, viewBox: '0 0 12 12', fill: 'none' });
        s.append(
          svgEl('path', { d: 'M2.5 2.5L9.5 9.5M9.5 2.5L2.5 9.5', stroke: 'currentColor', 'stroke-width': 1.4, 'stroke-linecap': 'round' }),
        );
        return s;
      })(),
    ),
  );
}

function openTabPickerMenu(anchor: HTMLElement): void {
  const existing = document.getElementById('qv-tab-picker-menu');
  if (existing) {
    existing.remove();
    return;
  }

  const closeMenu = () => {
    menu.remove();
    document.removeEventListener('pointerdown', onOutside, true);
    document.removeEventListener('keydown', onKey);
  };
  const onOutside = (ev: PointerEvent) => {
    const t = ev.target as Node | null;
    if (t && !menu.contains(t) && !anchor.contains(t)) closeMenu();
  };
  const onKey = (ev: KeyboardEvent) => {
    if (ev.key === 'Escape') closeMenu();
  };

  const menu = el('div', {
    className: 'qv-tab-picker-menu',
    id: 'qv-tab-picker-menu',
    attrs: { role: 'menu', 'aria-label': 'Open book tab or window' },
  });

  menu.appendChild(el('div', { className: 'qv-tab-picker-head', text: 'Books in Library' }));

  for (const book of state.library.books) {
    const alreadyOpen = state.openBookTabIds.includes(book.id);
    const isCurrent = book.id === state.project.id;
    menu.appendChild(
      el(
        'button',
        {
          className: `qv-tab-picker-item${isCurrent ? ' is-current' : ''}`,
          attrs: { type: 'button', role: 'menuitem' },
          on: {
            click: () => {
              closeMenu();
              actions.openBookInTab(book.id);
            },
          },
        },
        el('span', { className: 'qv-tab-picker-title', text: book.title || 'Untitled Book' }),
        el('span', {
          className: 'qv-tab-picker-badge',
          text: isCurrent ? 'Active' : alreadyOpen ? 'Switch' : 'Add Tab',
        }),
      ),
    );
  }

  menu.appendChild(el('div', { className: 'qv-tab-picker-sep' }));
  menu.appendChild(
    el(
      'button',
      {
        className: 'qv-tab-picker-item',
        attrs: { type: 'button', role: 'menuitem' },
        on: {
          click: () => {
            closeMenu();
            actions.openEmptyTab();
          },
        },
      },
      icon('plus', 13),
      el('span', { className: 'qv-tab-picker-title', text: 'New Empty Tab' }),
    ),
  );
  menu.appendChild(
    el(
      'button',
      {
        className: 'qv-tab-picker-item',
        attrs: { type: 'button', role: 'menuitem' },
        on: {
          click: () => {
            closeMenu();
            void actions.openNewWindow();
          },
        },
      },
      icon('window-new', 13),
      el('span', { className: 'qv-tab-picker-title', text: 'New Window (Empty Tab)' }),
      el('span', { className: 'qv-tab-picker-badge', text: 'Ctrl+Shift+N' }),
    ),
  );
  if ((windowSync?.getOtherOpenWindowCount() ?? 0) > 0) {
    menu.appendChild(
      el(
        'button',
        {
          className: 'qv-tab-picker-item',
          attrs: { type: 'button', role: 'menuitem' },
          on: {
            click: () => {
              closeMenu();
              actions.mergeAllWindowsHere();
            },
          },
        },
        icon('split', 13),
        el('span', { className: 'qv-tab-picker-title', text: 'Combine All Windows Here' }),
      ),
    );
  }

  document.body.appendChild(menu);
  const rect = anchor.getBoundingClientRect();
  const menuW = Math.min(276, window.innerWidth - 16);
  const left = Math.max(8, Math.min(rect.left, window.innerWidth - menuW - 8));
  menu.style.left = `${Math.round(left)}px`;
  menu.style.top = `${Math.round(rect.bottom + 4)}px`;
  menu.style.width = `${menuW}px`;

  window.setTimeout(() => {
    document.addEventListener('pointerdown', onOutside, true);
    document.addEventListener('keydown', onKey);
  }, 0);
}

function renderDesktopTabBar(): void {
  if (!isTauriRuntime() || !desktopTabBarEl) return;
  const showTabs = state.settings.enableDesktopBookTabs !== false;
  desktopTabBarEl.style.display = showTabs ? '' : 'none';
  if (topbarLogoEl) topbarLogoEl.style.display = showTabs ? 'none' : '';
  if (topbarWinControlsEl) topbarWinControlsEl.style.display = showTabs ? 'none' : '';
  if (topbarNewWinBtnEl) topbarNewWinBtnEl.style.display = showTabs ? 'none' : '';
  if (!showTabs) {
    lastTabBarRenderSig = '';
    return;
  }
  if (tabDragController.isDragging()) return;

  // Ensure TabManager contains valid books, empty tabs, or Course/Help tabs
  const byId = new Map(state.library.books.map((b) => [b.id, b]));
  tabManager.prune((id) => byId.has(id), state.project.id);
  const activeCandidate = state.activeTabId;
  if (!tabManager.hasTab(activeCandidate)) {
    if (isNonBookTabId(activeCandidate) || byId.has(activeCandidate)) {
      tabManager.openTab(activeCandidate, { activate: true });
    } else if (tabManager.getTabIds().length > 0) {
      tabManager.setActiveTabId(tabManager.getTabIds()[0]);
    }
  } else {
    tabManager.setActiveTabId(activeCandidate);
  }
  syncTabsFromManager(false);
  const validIds = tabManager.getTabIds().filter((id) => isNonBookTabId(id) || byId.has(id));
  const canClose = validIds.length > 1;

  const resolveTabTitle = (id: string): string => {
    if (isEmptyTabId(id)) return 'New Tab';
    if (id === COURSE_TAB_ID) return 'Book Writing Course';
    if (id === HELP_TAB_ID) return 'Help & FAQ';
    if (id === SETTINGS_TAB_ID) return 'Settings';
    if (id === MANUAL_TAB_ID) return 'Manual & Reference';
    if (id === EXTENSIONS_TAB_ID) return 'Extensions & Formats';
    return byId.get(id)?.title?.trim() || 'Untitled Book';
  };

  if (!desktopTabBarMounted || !desktopTabStripEl?.isConnected || !desktopTabAddBtnEl || !desktopTabStripShellEl) {
    clearNode(desktopTabBarEl);
    const logoWrap = el(
      'div',
      { className: 'qv-tabbar-logo', attrs: { 'data-tauri-drag-region': '' } },
      quillvibeLogo(18),
    );

    const tabStrip = el('div', {
      className: 'qv-tab-strip',
      attrs: { role: 'tablist', 'aria-label': 'Open books and tabs' },
    });

    const addTabBtn = el(
      'button',
      {
        className: 'qv-tab-add-btn',
        tooltip: {
          title: 'New Empty Book Tab',
          short: 'Open a fresh tab to pick any recent book or start a new manuscript.',
        },
        attrs: { type: 'button', draggable: 'false', 'aria-label': 'New empty book tab' },
        on: {
          pointerdown: (e) => e.stopPropagation(),
          click: () => actions.openEmptyTab(),
        },
      },
      icon('plus', 13),
    );

    const tabMenuBtn = el(
      'button',
      {
        className: 'qv-tab-menu-btn',
        tooltip: {
          title: 'Tabs & Windows Menu',
          short: 'Switch books, open an empty window, or combine all open windows into one.',
        },
        attrs: { type: 'button', draggable: 'false', 'aria-label': 'Tabs and windows menu' },
        on: {
          pointerdown: (e) => e.stopPropagation(),
          click: () => openTabPickerMenu(tabMenuBtn),
        },
      },
      '▾',
    );

    const tabStripShell = el(
      'div',
      {
        className: 'qv-tab-strip-shell',
      },
      tabStrip,
      addTabBtn,
    );

    const dragSpacer = el('div', {
      className: 'qv-tabbar-spacer',
      attrs: { 'data-tauri-drag-region': '' },
    });

    desktopTabBarEl.append(
      logoWrap,
      tabStripShell,
      dragSpacer,
      tabMenuBtn,
      createDesktopWindowControlsEl(),
    );

    desktopTabStripEl = tabStrip;
    desktopTabAddBtnEl = addTabBtn;
    desktopTabStripShellEl = tabStripShell;
    desktopTabBarMounted = true;
    tabDragController.bindTabStripLayout(tabStrip, addTabBtn, tabStripShell, desktopTabBarEl);
  }

  const tabStrip = desktopTabStripEl;
  const activateTabId = activateDesktopTab;

  const resolveTabTooltip = (id: string): TooltipSpec => {
    if (isEmptyTabId(id)) {
      return {
        title: 'New Tab',
        short: 'Open a clean draft or jump to a studio page.',
      };
    }
    if (id === SETTINGS_TAB_ID) {
      return {
        title: 'Settings',
        short: 'Themes, fonts, workspace layouts, and backups.',
      };
    }
    if (id === COURSE_TAB_ID) {
      return {
        title: 'Academy Course',
        short: 'Interactive book writing and craft lessons.',
      };
    }
    if (id === HELP_TAB_ID) {
      return {
        title: 'Help & FAQ',
        short: 'Guides, file formats, and error diagnostics.',
      };
    }
    if (id === MANUAL_TAB_ID) {
      return {
        title: 'Reference Manual',
        short: 'Full index of controls, shortcuts, and formats.',
      };
    }
    if (id === EXTENSIONS_TAB_ID) {
      return {
        title: 'Extensions',
        short: 'Format inspector and .qvext add-on packs.',
      };
    }
    const book = state.library.books.find((b) => b.id === id);
    if (!book) {
      return { title: 'Book Tab', short: 'Manuscript workspace tab.' };
    }
    const words = getProjectWordCount(book);
    return {
      title: book.title || 'Untitled Book',
      short: `${book.author || 'Author'} — ${words.toLocaleString()} words`,
    };
  };

  const createTabElement = (id: string, initialTitle: string): HTMLElement => {
    const closeBtn = el(
      'button',
      {
        className: 'qv-tab-close',
        attrs: {
          type: 'button',
          tabindex: '-1',
          'aria-label': `Close ${initialTitle} tab`,
        },
        on: {
          pointerdown: (e) => {
            e.stopPropagation();
          },
          click: (e) => {
            e.stopPropagation();
            if (tabManager.getTabIds().length > 1) {
              actions.closeBookTab(id);
            }
          },
        },
      },
      '×',
    );

    const tabEl = el(
      'div',
      {
        className: 'qv-book-tab',
        dataset: { tabId: id, tabTitle: initialTitle },
        attrs: {
          role: 'tab',
          draggable: 'false',
          tabindex: '-1',
          'aria-label': initialTitle,
          'aria-selected': 'false',
        },
        on: {
          auxclick: (e) => {
            if (e.button === 1 && tabManager.getTabIds().length > 1) {
              e.preventDefault();
              actions.closeBookTab(id);
            }
          },
          keydown: (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              if (tabManager.getActiveTabId() !== id) activateTabId(id);
              return;
            }
            if (e.key === 'Delete' && tabManager.getTabIds().length > 1) {
              e.preventDefault();
              actions.closeBookTab(id);
              return;
            }
            if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'Home' || e.key === 'End') {
              const items = Array.from(tabStrip.querySelectorAll<HTMLElement>('.qv-book-tab'));
              const curIdx = items.indexOf(tabEl);
              if (curIdx === -1 || items.length === 0) return;
              e.preventDefault();
              const nextIdx =
                e.key === 'Home'
                  ? 0
                  : e.key === 'End'
                    ? items.length - 1
                    : e.key === 'ArrowLeft'
                      ? (curIdx - 1 + items.length) % items.length
                      : (curIdx + 1) % items.length;
              items[nextIdx]?.focus();
            }
          },
        },
      },
      el('span', { className: 'qv-book-tab-title', text: initialTitle }),
      closeBtn,
    );

    attachTooltip(tabEl, resolveTabTooltip(id));

    tabDragController.attachTab(tabEl, tabStrip, desktopTabBarEl!, {
      tabId: id,
      tabTitle: initialTitle,
    });

    attachContextMenu(tabEl, () => {
      const liveTitle = resolveTabTitle(id);
      const liveCanClose = tabManager.getTabIds().length > 1;
      const liveIsEmpty = isEmptyTabId(id);
      return [
        {
          heading: liveTitle,
          items: [
            {
              label: 'Pop Out to New Window',
              icon: 'window-new' as const,
              onSelect: () => {
                void actions.openNewWindow(liveIsEmpty ? EMPTY_TAB_PREFIX : id);
                if (liveCanClose) actions.closeBookTab(id);
              },
            },
            {
              label: 'New Empty Tab',
              icon: 'plus',
              onSelect: () => actions.openEmptyTab(),
            },
            ...((windowSync?.getOtherOpenWindowCount() ?? 0) > 0
              ? [
                  {
                    label: 'Combine All Windows Into This Window',
                    icon: 'split' as const,
                    onSelect: () => actions.mergeAllWindowsHere(),
                  },
                ]
              : []),
            {
              label: 'Close Tab',
              disabled: !liveCanClose,
              onSelect: () => actions.closeBookTab(id),
            },
            {
              label: 'Close Other Tabs',
              disabled: !liveCanClose,
              onSelect: () => {
                tabDragController.cancelActiveDrag();
                setTabOrderAndActive([id], id, true);
                activateTabId(id);
              },
            },
          ],
        },
      ];
    });

    return tabEl;
  };

  const renderSig = JSON.stringify({
    tabs: validIds.map((id) => [id, resolveTabTitle(id)]),
    canClose,
  });

  if (renderSig === lastTabBarRenderSig && tabStrip.childElementCount === validIds.length) {
    const existingTabs = Array.from(tabStrip.querySelectorAll<HTMLElement>('.qv-book-tab'));
    for (const tabEl of existingTabs) {
      const id = tabEl.dataset.tabId ?? '';
      const isActive = id === state.activeTabId;
      tabEl.classList.toggle('is-active', isActive);
      tabEl.setAttribute('aria-selected', String(isActive));
      tabEl.setAttribute('tabindex', isActive ? '0' : '-1');
      if (pendingFocusTabIdAfterRender && pendingFocusTabIdAfterRender === id) {
        pendingFocusTabIdAfterRender = null;
        tabEl.focus({ preventScroll: false });
      }
    }
    tabDragController.syncUniformTabWidths();
    tabDragController.syncNewTabButtonPosition(true);
    return;
  }
  lastTabBarRenderSig = renderSig;

  const existingById = new Map<string, HTMLElement>();
  for (const child of Array.from(tabStrip.children)) {
    const node = child as HTMLElement;
    const tid = node.dataset.tabId ?? '';
    if (!tid || !validIds.includes(tid)) {
      node.remove();
    } else {
      existingById.set(tid, node);
    }
  }

  validIds.forEach((id, index) => {
    const tabTitle = resolveTabTitle(id);
    const isActive = id === state.activeTabId;
    let tabEl = existingById.get(id);
    if (!tabEl) {
      tabEl = createTabElement(id, tabTitle);
    }

    tabEl.classList.toggle('is-active', isActive);
    tabEl.style.visibility = '';
    tabEl.style.opacity = '';
    tabEl.style.transform = '';
    tabEl.dataset.tabTitle = tabTitle;
    tabEl.setAttribute('tabindex', isActive ? '0' : '-1');
    tabEl.setAttribute('aria-label', tabTitle);
    tabEl.setAttribute('aria-selected', String(isActive));
    updateTooltip(tabEl, resolveTabTooltip(id));

    const titleEl = tabEl.querySelector<HTMLElement>('.qv-book-tab-title');
    if (titleEl && titleEl.textContent !== tabTitle) {
      titleEl.textContent = tabTitle;
    }

    const closeBtn = tabEl.querySelector<HTMLButtonElement>('.qv-tab-close');
    if (closeBtn) {
      closeBtn.style.display = canClose ? '' : 'none';
      closeBtn.disabled = !canClose;
      closeBtn.setAttribute('aria-label', `Close ${tabTitle} tab`);
    }

    const currentAtIdx = tabStrip.children[index];
    if (currentAtIdx !== tabEl) {
      tabStrip.insertBefore(tabEl, currentAtIdx ?? null);
    }
  });

  tabDragController.syncUniformTabWidths();
  tabDragController.syncNewTabButtonPosition(true);

  if (pendingFocusTabIdAfterRender) {
    const focusTargetId = pendingFocusTabIdAfterRender;
    pendingFocusTabIdAfterRender = null;
    const focusEl = Array.from(tabStrip.querySelectorAll<HTMLElement>('.qv-book-tab')).find(
      (node) => node.dataset.tabId === focusTargetId,
    );
    focusEl?.focus({ preventScroll: false });
  }
}

function syncThemeButtonIcon(): void {
  const mode = state.settings.appTheme;
  if (themeMorphSvgEl) {
    themeMorphSvgEl.dataset.themeMode = mode;
  }
  if (themeSwitchBtnEl) {
    const label =
      mode === 'system'
        ? 'Match Device'
        : mode === 'ivory'
          ? 'Ivory Light'
          : mode === 'parchment'
            ? 'Parchment'
            : 'Obsidian Dark';
    themeSwitchBtnEl.setAttribute('aria-label', `Switch Theme (${label})`);
  }
}

function buildShell(root: HTMLElement): void {
  clearNode(root);

  bookTitleInputEl = el('input', {
    className: 'bv-book-title-input',
    tooltip: TOOLTIP_CATALOG.bookTitle,
    attrs: { type: 'text', value: state.project.title, 'aria-label': 'Book title' },
    on: {
      change: () => {
        const nextTitle = bookTitleInputEl.value.trim() || 'Untitled Book';
        bookTitleInputEl.value = nextTitle;
        actions.mutateProject((p) => ({ ...p, title: nextTitle }), false);
      },
    },
  });

  saveStatusEl = el('span', {
    className: 'bv-save-indicator',
    text: state.saveStatusLabel,
    tooltip: isTauriRuntime()
      ? TOOLTIP_CATALOG.saveStatus
      : {
          ...TOOLTIP_CATALOG.saveStatus,
          short:
            'Auto-saved in this browser. Export a .quillvibe file to back up locally (desktop apps auto-save to disk).',
        },
  });

  binderToggleBtn = el(
    'button',
    {
      className: `bv-btn bv-btn-icon${state.showBinder ? ' is-active' : ''}`,
      tooltip: TOOLTIP_CATALOG.toggleBinder,
      attrs: { type: 'button', 'aria-label': 'Toggle Manuscript Binder' },
      on: {
        click: () => {
          const nextShow = !state.showBinder;
          const patch: Partial<AppState> = { showBinder: nextShow };
          if (nextShow && window.innerWidth <= COMPACT_SIDEBAR_BREAKPOINT) {
            patch.showInspector = false;
          }
          actions.setState(patch, false);
        },
      },
    },
    icon('panel-left', 15),
  );

  headerNavHostEl = el('div', { className: 'bv-topbar-center' });

  exportFormatSelectEl = el(
    'select',
    {
      className: 'bv-export-format-select',
      tooltip: TOOLTIP_CATALOG.defaultFormatSelect,
      attrs: { 'aria-label': 'Default export file extension' },
      on: {
        change: () => {
          actions.setDefaultExportFormat(exportFormatSelectEl.value as ExportFormatId);
        },
      },
    },
    ...EXPORT_FORMAT_OPTIONS.map((opt) =>
      el('option', {
        text: opt.shortLabel,
        attrs: { value: opt.id, selected: state.defaultExportFormat === opt.id },
      }),
    ),
  );

  inspectorToggleBtn = el(
    'button',
    {
      className: `bv-btn bv-btn-icon${state.showInspector ? ' is-active' : ''}`,
      tooltip: TOOLTIP_CATALOG.toggleInspector,
      attrs: { type: 'button', 'aria-label': 'Toggle Scene Inspector' },
      on: {
        click: () => {
          const nextShow = !state.showInspector;
          const patch: Partial<AppState> = { showInspector: nextShow };
          if (nextShow && window.innerWidth <= COMPACT_SIDEBAR_BREAKPOINT) {
            patch.showBinder = false;
          }
          actions.setState(patch, false);
        },
      },
    },
    icon('panel-right', 15),
  );

  topbarWinControlsEl = isTauriRuntime() ? createDesktopWindowControlsEl() : null;
  topbarLogoEl = el(
    'div',
    { className: 'bv-logo-mark', attrs: { 'data-tauri-drag-region': '' } },
    quillvibeLogo(28),
  );

  desktopTabBarEl = isTauriRuntime()
    ? el('div', {
        className: 'qv-desktop-tabbar',
        attrs: { 'data-tauri-drag-region': '' },
        on: {
          mousedown: (e) => {
            if (e.button !== 0) return;
            const t = e.target as HTMLElement | null;
            if (!t || t.closest('button, .qv-book-tab, a')) return;
            void startDesktopWindowDrag();
          },
          dblclick: (e) => {
            const t = e.target as HTMLElement | null;
            if (!t || t.closest('button, .qv-book-tab, a')) return;
            void isDesktopWindowMaximized().then(() => toggleMaximizeDesktopWindow());
          },
        },
      })
    : null;

  const topbar = el(
    'header',
    {
      className: 'bv-topbar',
      attrs: { 'data-tauri-drag-region': '' },
      on: {
        mousedown: (e) => {
          if (!isTauriRuntime() || e.button !== 0) return;
          const t = e.target as HTMLElement | null;
          if (!t || t.closest('button, input, select, .lg-host, a')) return;
          void startDesktopWindowDrag();
        },
        dblclick: (e) => {
          if (!isTauriRuntime()) return;
          const t = e.target as HTMLElement | null;
          if (!t || t.closest('button, input, select, .lg-host, a')) return;
          void isDesktopWindowMaximized().then(() => toggleMaximizeDesktopWindow());
        },
      },
    },
    el(
      'div',
      { className: 'bv-brand' },
      topbarLogoEl,
      binderToggleBtn,
      el('div', { className: 'bv-book-meta' }, bookTitleInputEl),
    ),
    headerNavHostEl,
    el(
      'div',
      { className: 'bv-topbar-actions' },
      el(
        'button',
        {
          className: 'bv-btn bv-btn-icon',
          tooltip: {
            title: 'Universal Search',
            short: 'Search courses, FAQs, error codes, tools, scenes, and Story Bible entries.',
            shortcut: 'Ctrl+K',
          },
          attrs: { type: 'button', 'aria-label': 'Universal Search (Ctrl+K)' },
          on: { click: () => openUniversalSearch(actions, () => state) },
        },
        icon('search', 15),
      ),
      (themeSwitchBtnEl = el(
        'button',
        {
          className: 'bv-btn bv-btn-icon',
          tooltip: TOOLTIP_CATALOG.themeSwitch,
          attrs: { type: 'button', 'aria-label': 'Switch Theme' },
          on: {
            click: () => {
              const order: AppThemeId[] = ['system', 'ivory', 'parchment', 'obsidian'];
              const nextTheme = order[(order.indexOf(state.settings.appTheme) + 1) % order.length];
              actions.updateSettings({ appTheme: nextTheme });
              actions.notify(
                `Theme: ${nextTheme === 'system' ? 'Match Device' : nextTheme.charAt(0).toUpperCase() + nextTheme.slice(1)}`,
              );
            },
          },
        },
        (themeMorphSvgEl = createMorphThemeIcon(state.settings.appTheme, 16)),
      )),
      ...(isTauriRuntime()
        ? [
            (topbarNewWinBtnEl = el(
              'button',
              {
                className: 'bv-btn bv-btn-icon',
                tooltip: TOOLTIP_CATALOG.newWindowBtn,
                attrs: { type: 'button', 'aria-label': 'Open Book in New Window' },
                on: { click: () => void actions.openNewWindow() },
              },
              icon('window-new', 15),
            )),
            (immersiveBtnEl = el(
              'button',
              {
                className: `bv-btn bv-btn-icon${state.immersiveMode ? ' is-active' : ''}`,
                tooltip: TOOLTIP_CATALOG.immersiveBtn,
                attrs: { type: 'button', 'aria-label': 'Toggle Immersive Fullscreen (F11)' },
                on: { click: () => void actions.toggleImmersiveMode() },
              },
              icon('fullscreen', 15),
            )),
          ]
        : []),
      el(
        'button',
        {
          className: 'bv-btn bv-btn-icon',
          tooltip: TOOLTIP_CATALOG.library,
          attrs: { type: 'button', 'aria-label': 'Book Library and Author Key' },
          on: { click: () => actions.openLibraryModal() },
        },
        icon('library', 15),
      ),
      el(
        'button',
        {
          className: 'bv-btn bv-btn-icon qv-tier-adv-only',
          tooltip: isTauriRuntime()
            ? TOOLTIP_CATALOG.collaborate
            : {
                ...TOOLTIP_CATALOG.collaborate,
                short:
                  'Credits, verified co-author device keys, .qv merge & Website Sync work here; Wi-Fi LAN & Bluetooth require the desktop app.',
              },
          attrs: { type: 'button', 'aria-label': 'Collaborate Offline' },
          on: { click: () => actions.openCollabModal() },
        },
        icon('collab', 15),
      ),
      el(
        'button',
        {
          className: 'bv-btn bv-btn-icon',
          tooltip: TOOLTIP_CATALOG.openFile,
          attrs: { type: 'button', 'aria-label': 'Open Quillvibe File' },
          on: { click: () => void actions.openAnyQuillvibeFile() },
        },
        icon('folder', 15),
      ),
      el(
        'div',
        { className: 'bv-save-split' },
        el(
          'button',
          {
            className: 'bv-btn bv-btn-icon bv-save-split-btn',
            tooltip: TOOLTIP_CATALOG.saveDefault,
            attrs: { type: 'button', 'aria-label': 'Save or Export Default Format' },
            on: { click: () => void actions.exportDefaultFormat() },
          },
          icon('save', 15),
        ),
        exportFormatSelectEl,
      ),
      el(
        'button',
        {
          className: 'bv-btn bv-btn-icon qv-tier-adv-only',
          tooltip: TOOLTIP_CATALOG.extensionsManager,
          attrs: { type: 'button', 'aria-label': 'Extensions and Formats' },
          on: { click: () => actions.openExtensionsModal() },
        },
        icon('extensions', 15),
      ),
      el(
        'button',
        {
          className: 'bv-btn bv-btn-icon',
          tooltip: TOOLTIP_CATALOG.settingsBtn,
          attrs: { type: 'button', 'aria-label': 'Settings, Tiers and Themes' },
          on: { click: () => actions.openSettingsModal('editor') },
        },
        icon('settings', 15),
      ),
      el(
        'button',
        {
          className: 'bv-btn bv-btn-icon',
          tooltip: TOOLTIP_CATALOG.helpBtn,
          attrs: { type: 'button', 'aria-label': 'Help and Book Course' },
          on: { click: () => actions.openHelpModal('course') },
        },
        icon('help', 15),
      ),
      inspectorToggleBtn,
      topbarWinControlsEl,
    ),
  );

  binderEl = el('aside', { className: 'bv-binder', attrs: { 'aria-label': 'Manuscript Binder' } });
  mainStageEl = el('main', { className: 'bv-main-stage' });
  inspectorEl = el('aside', { className: 'bv-inspector', attrs: { 'aria-label': 'Scene Inspector' } });

  drawerBackdropEl = el('div', {
    className: 'bv-drawer-backdrop',
    on: {
      click: () => {
        const patch: Partial<AppState> = {};
        if (window.innerWidth <= 960) patch.showBinder = false;
        if (window.innerWidth <= 1180) patch.showInspector = false;
        actions.setState(patch, false);
      },
    },
  });

  const MIN_MAIN_STAGE_WIDTH_PX = 460;

  const getMaxBinderWidthPx = (): number => {
    const winW = typeof window !== 'undefined' ? window.innerWidth : 1280;
    const inspectorUsed =
      state.showInspector && winW > COMPACT_SIDEBAR_BREAKPOINT
        ? state.settings.inspectorWidthPx + 5
        : 0;
    return Math.max(190, Math.min(440, winW - MIN_MAIN_STAGE_WIDTH_PX - inspectorUsed - 5));
  };

  const getMaxInspectorWidthPx = (): number => {
    const winW = typeof window !== 'undefined' ? window.innerWidth : 1280;
    const binderUsed =
      state.showBinder && winW > 960
        ? state.settings.binderWidthPx + 5
        : 0;
    return Math.max(210, Math.min(480, winW - MIN_MAIN_STAGE_WIDTH_PX - binderUsed - 5));
  };

  const binderResizer = createVerticalResizer({
    side: 'left',
    minWidth: 190,
    maxWidth: 440,
    getDynamicMaxWidth: getMaxBinderWidthPx,
    cssVarName: '--qv-binder-w',
    ariaLabel: 'Resize Manuscript Binder',
    getWidth: () => state.settings.binderWidthPx,
    onResizeEnd: (w) => actions.updateSettings({ binderWidthPx: w }),
    onDoubleClickReset: () => DEFAULT_SETTINGS.binderWidthPx,
  });

  const inspectorResizer = createVerticalResizer({
    side: 'right',
    minWidth: 210,
    maxWidth: 480,
    getDynamicMaxWidth: getMaxInspectorWidthPx,
    cssVarName: '--qv-inspector-w',
    ariaLabel: 'Resize Scene Inspector',
    getWidth: () => state.settings.inspectorWidthPx,
    onResizeEnd: (w) => actions.updateSettings({ inspectorWidthPx: w }),
    onDoubleClickReset: () => DEFAULT_SETTINGS.inspectorWidthPx,
  });

  workspaceGridEl = el(
    'div',
    { className: 'bv-workspace-grid' },
    binderEl,
    binderResizer,
    mainStageEl,
    inspectorResizer,
    inspectorEl,
    drawerBackdropEl,
  );

  wordStatsEl = el('span', { className: 'bv-status-words', text: '' });
  sprintStatusEl = el('span', { text: '' });

  const sprintDurationSelect = el(
    'select',
    {
      className: 'bv-select',
      style: { height: '22px', fontSize: '11px' },
      tooltip: {
        title: 'Sprint Duration (15m / 25m / 45m)',
        short: 'Select focus session length in minutes before clicking Start.',
      },
      attrs: { 'aria-label': 'Sprint duration' },
      on: {
        change: () => {
          const mins = Number(sprintDurationSelect.value) || 25;
          state.sprintRunning = false;
          if (sprintInterval !== null) {
            clearInterval(sprintInterval);
            sprintInterval = null;
          }
          state.sprintDurationMin = mins;
          state.sprintRemainingSec = mins * 60;
          state.sprintStartWords = getProjectWordCount(state.project);
          updateSprintDisplay();
        },
      },
    },
    el('option', { text: '15m', attrs: { value: '15', selected: state.sprintDurationMin === 15 } }),
    el('option', { text: '25m', attrs: { value: '25', selected: state.sprintDurationMin === 25 } }),
    el('option', { text: '45m', attrs: { value: '45', selected: state.sprintDurationMin === 45 } }),
  );

  const toggleSprint = () => {
    if (state.sprintRunning) {
      state.sprintRunning = false;
      if (sprintInterval !== null) {
        clearInterval(sprintInterval);
        sprintInterval = null;
      }
    } else {
      if (state.sprintRemainingSec <= 0) {
        state.sprintRemainingSec = state.sprintDurationMin * 60;
        state.sprintStartWords = getProjectWordCount(state.project);
      }
      if (state.sprintRemainingSec === state.sprintDurationMin * 60) {
        state.sprintStartWords = getProjectWordCount(state.project);
      }
      state.sprintRunning = true;
      sprintInterval = window.setInterval(() => {
        if (state.sprintRemainingSec > 0) {
          state.sprintRemainingSec -= 1;
          updateSprintDisplay();
          immersiveHud?.sync();
        }
        if (state.sprintRemainingSec <= 0) {
          state.sprintRunning = false;
          if (sprintInterval !== null) {
            clearInterval(sprintInterval);
            sprintInterval = null;
          }
          updateSprintDisplay();
          immersiveHud?.sync();
          playRingtonePreview(state.settings.alarmRingtone, state.settings.alarmVolume * 0.7);
          const gained = getProjectWordCount(state.project) - state.sprintStartWords;
          actions.notify(`Writing sprint complete (${gained >= 0 ? '+' : ''}${gained} words)`);
        }
      }, 1000);
    }
    updateSprintDisplay();
    immersiveHud?.sync();
  };

  const resetSprint = () => {
    state.sprintRunning = false;
    if (sprintInterval !== null) {
      clearInterval(sprintInterval);
      sprintInterval = null;
    }
    state.sprintRemainingSec = state.sprintDurationMin * 60;
    state.sprintStartWords = getProjectWordCount(state.project);
    updateSprintDisplay();
    immersiveHud?.sync();
  };

  sprintToggleBtnEl = el('button', {
    className: 'bv-mini-btn',
    text: 'Start',
    tooltip: {
      title: 'Start / Pause Writing Sprint',
      short: 'Begin or pause the countdown timer and track net words drafted (+0w).',
    },
    attrs: { type: 'button' },
    on: { click: toggleSprint },
  });

  const sprintResetBtn = el('button', {
    className: 'bv-mini-btn',
    text: 'Reset',
    tooltip: {
      title: 'Reset Sprint Timer',
      short: 'Stops any running countdown, restores chosen duration (15m/25m/45m), and clears +0w delta.',
    },
    attrs: { type: 'button' },
    on: { click: resetSprint },
  });

  alarmController?.destroy();
  alarmController = new AlarmController({
    getConfig: () => ({
      ringtone: state.settings.alarmRingtone,
      volume: state.settings.alarmVolume,
    }),
    onTrigger: (snap) => {
      immersiveHud?.showRingingModal(snap.label);
    },
  });

  immersiveHud?.destroy();
  immersiveHud = mountImmersiveHud(actions, alarmController, { toggleSprint, resetSprint });

  tierPillBtnEl = el('button', {
    className: 'bv-mini-btn qv-tier-pill',
    text: `Workspace: ${formatWorkspaceLayoutName(state.settings.toolTier)}`,
    tooltip: TOOLTIP_CATALOG.tierSwitch,
    attrs: { type: 'button', 'aria-label': 'Workspace Layout Settings' },
    on: { click: () => actions.openSettingsModal('editor') },
  });

  const statusbar = el(
    'footer',
    { className: 'bv-statusbar' },
    el('div', { className: 'bv-status-left' }, saveStatusEl, wordStatsEl, tierPillBtnEl),
    el(
      'div',
      { className: 'bv-status-right' },
      el(
        'button',
        {
          className: 'bv-mini-btn',
          tooltip: TOOLTIP_CATALOG.alarmBtn,
          attrs: { type: 'button', 'aria-label': 'Writing Alarm Clock' },
          on: { click: () => immersiveHud?.openAlarmPopover() },
        },
        icon('alarm', 12),
        'Alarm',
      ),
      icon('clock', 12),
      sprintStatusEl,
      sprintDurationSelect,
      sprintToggleBtnEl,
      sprintResetBtn,
    ),
  );

  mobileBottomNavEl = el('nav', {
    className: 'qv-mobile-bottom-nav',
    attrs: { 'aria-label': 'Mobile workspace navigation' },
  });

  const chromeTop = el('div', { className: 'qv-chrome-top' }, desktopTabBarEl, topbar);
  shellEl = el('div', { className: 'bv-shell' }, chromeTop, workspaceGridEl, mobileBottomNavEl, statusbar);
  root.appendChild(shellEl);
  renderDesktopTabBar();
  rebuildHeaderNavControl();

  attachContextMenu(shellEl, () => [
    {
      heading: 'Quillvibe Theme',
      items: (['system', 'ivory', 'parchment', 'obsidian'] as AppThemeId[]).map((th) => ({
        label:
          th === 'system'
            ? 'Match Device (System)'
            : th === 'ivory'
              ? 'Ivory Light (Default)'
              : th === 'parchment'
                ? 'Warm Parchment'
                : 'Obsidian Dark',
        checked: state.settings.appTheme === th,
        onSelect: () => actions.updateSettings({ appTheme: th }),
      })),
    },
    ...(!isSmallMobileViewport()
      ? [
          {
            heading: 'Workspace Layout',
            items: (['basic', 'intermediate', 'advanced'] as ToolTier[]).map((t) => ({
              label: formatWorkspaceLayoutName(t),
              checked: state.settings.toolTier === t,
              onSelect: () => actions.updateSettings({ toolTier: t }),
            })),
          },
        ]
      : []),
    {
      items: [
        {
          label: 'Open Book Writing Course',
          icon: 'course',
          onSelect: () => actions.openCoursePage(),
        },
        {
          label: 'Open Help & FAQ Center',
          icon: 'help',
          onSelect: () => actions.openHelpPage(),
        },
        {
          label: 'Open Developer Portal (.qvext)',
          icon: 'extensions',
          onSelect: () => actions.openDeveloperPage(),
        },
        ...(isTauriRuntime()
          ? [
              {
                label: 'Toggle Immersive Fullscreen (F11)',
                icon: 'fullscreen' as const,
                onSelect: () => void actions.toggleImmersiveMode(),
              },
            ]
          : []),
        {
          label: 'Open Workspace Settings',
          icon: 'settings',
          onSelect: () => actions.openSettingsModal('editor'),
        },
      ],
    },
  ]);

  const syncMobileViewport = () => {
    const vv = window.visualViewport;
    if (!vv) return;
    const kbInset = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
    const isKbOpen = window.innerWidth <= 768 && kbInset > 110;
    document.documentElement.style.setProperty('--qv-vh', `${Math.round(vv.height)}px`);
    document.documentElement.style.setProperty('--qv-keyboard-inset', `${kbInset}px`);
    document.body.classList.toggle('is-mobile-keyboard-open', isKbOpen);
    if (isKbOpen && document.activeElement instanceof HTMLElement) {
      window.setTimeout(() => {
        (document.activeElement as HTMLElement)?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
      }, 60);
    }
  };

  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', syncMobileViewport);
    window.visualViewport.addEventListener('scroll', syncMobileViewport);
    syncMobileViewport();
  }

  window.addEventListener('resize', () => {
    if (window.innerWidth <= COMPACT_SIDEBAR_BREAKPOINT && state.showBinder && state.showInspector) {
      state.showInspector = false;
    }
    const clampedBinder = Math.min(state.settings.binderWidthPx, getMaxBinderWidthPx());
    const clampedInspector = Math.min(state.settings.inspectorWidthPx, getMaxInspectorWidthPx());
    document.documentElement.style.setProperty('--qv-binder-w', `${clampedBinder}px`);
    document.documentElement.style.setProperty('--qv-inspector-w', `${clampedInspector}px`);
    const effTier = getEffectiveTier();
    if (lastRenderedTier !== effTier) {
      rebuildHeaderNavControl();
      renderActiveView();
    } else if (tierPillBtnEl) {
      tierPillBtnEl.style.display = isSmallMobileViewport() ? 'none' : '';
    }
    syncResponsiveDrawerClasses();
    syncMobileViewport();
  });
}

function wireGlobalShortcutsAndDrop(): void {
  window.addEventListener('keydown', (e) => {
    const target = e.target as HTMLElement | null;
    const isPlainInput =
      target instanceof HTMLInputElement ||
      (target instanceof HTMLTextAreaElement && !target.classList.contains('bv-prose-textarea'));
    if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'z') {
      if (isPlainInput) return;
      e.preventDefault();
      if (e.shiftKey) actions.redo();
      else actions.undo();
    } else if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'y') {
      if (isPlainInput) return;
      e.preventDefault();
      actions.redo();
    } else if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      openUniversalSearch(actions, () => state);
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      if (state.activeView === 'editor') {
        actions.createSnapshot();
      } else {
        void actions.exportDefaultFormat();
      }
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o') {
      e.preventDefault();
      void actions.openAnyQuillvibeFile();
    } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'n' && isTauriRuntime()) {
      e.preventDefault();
      void actions.openNewWindow();
    } else if (
      (e.ctrlKey || e.metaKey) &&
      !e.shiftKey &&
      !e.altKey &&
      e.key.toLowerCase() === 'w' &&
      isTauriRuntime() &&
      state.settings.enableDesktopBookTabs &&
      state.openBookTabIds.length > 1
    ) {
      e.preventDefault();
      actions.closeBookTab(state.activeTabId);
    } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'f') {
      e.preventDefault();
      actions.setState({ zenMode: !state.zenMode }, true);
    } else if (e.key === 'F11' && isTauriRuntime()) {
      e.preventDefault();
      void actions.toggleImmersiveMode();
    } else if (e.key === 'F1') {
      e.preventDefault();
      actions.openHelpModal('tour');
    } else if (e.key === 'Escape') {
      hideContextMenu();
      const modals = [
        'qv-universal-search-modal',
        'bv-extensions-modal',
        'bv-library-modal',
        'bv-collab-modal',
        'bv-help-modal',
        'bv-settings-modal',
        'qv-alarm-popover-modal',
      ];
      let closed = false;
      for (const mId of modals) {
        const m = document.getElementById(mId);
        if (m) {
          m.dispatchEvent(new CustomEvent('bv-close-modal'));
          if (m.isConnected) {
            m.remove();
          }
          closed = true;
        }
      }
      if (!closed) {
        destroyActiveTour();
      }
      if (!closed && state.zenMode) {
        actions.setState({ zenMode: false }, true);
      }
    }
  });

  let dropOverlay: HTMLElement | null = null;
  let dragDepth = 0;

  const hideDrop = () => {
    dragDepth = 0;
    dropOverlay?.remove();
    dropOverlay = null;
  };

  window.addEventListener('dragenter', (e) => {
    if (!e.dataTransfer?.types.includes('Files')) return;
    dragDepth++;
    if (!dropOverlay) {
      dropOverlay = el('div', {
        className: 'bv-drop-overlay',
        text: 'Drop .qv, .qvbible, .qvscene, .qvstyle, .qvdesign, .qvext, or .docx / .md file',
      });
      document.body.appendChild(dropOverlay);
    }
  });

  window.addEventListener('dragover', (e) => {
    if (e.dataTransfer?.types.includes('Files')) {
      e.preventDefault();
    }
  });

  window.addEventListener('dragleave', () => {
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) hideDrop();
  });

  window.addEventListener('drop', async (e) => {
    if (e.defaultPrevented) {
      hideDrop();
      return;
    }
    e.preventDefault();
    hideDrop();
    const file = e.dataTransfer?.files?.[0];
    if (!file) return;
    const lower = file.name.toLowerCase();
    const isExtPlugin = lower.endsWith('.qvext') || lower.endsWith('.bvext');
    const isMigrationFile = /\.(docx|html?|rtf|md|markdown|txt)$/i.test(lower);
    const anyDetected = extractAnyImportableExtensionFromFilename(file.name);
    if (anyDetected && isLegacyImportExtension(anyDetected)) {
      actions.notify(
        `Legacy ${anyDetected} files cannot open directly. Use Settings -> Publishing & Archive -> Import Legacy Archive.`,
      );
      return;
    }
    if (!isExtPlugin && !extractExtensionFromFilename(file.name)) {
      if (isMigrationFile) {
        try {
          const imported = await importAnyExternalDocumentFile(file);
          actions.replaceLibrary({
            activeBookId: imported.id,
            books: [...state.library.books, imported],
          });
          actions.notify(`Imported “${imported.title}” from ${file.name}`);
        } catch (err) {
          actions.notify(err instanceof Error ? err.message : 'Unable to import document.');
        }
        return;
      }
      actions.notify(
        'Unsupported file. Drop a .qv, .qvbible, .qvscene, .qvstyle, .qvdesign, .qvext, .docx, .html, or .md file.',
      );
      return;
    }
    if (isExtPlugin) {
      const text = await file.text();
      await handleOpenedFile(text, file.name, { base64Encoded: false, allowLegacy: false });
      return;
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    await handleOpenedFile(bytes, file.name, { base64Encoded: false, allowLegacy: false });
  });
}

async function bootstrap(): Promise<void> {
  const root = document.getElementById('app');
  if (!root) return;

  const [savedLibJson, startupFile] = await Promise.all([
    loadPersistedLibrary(),
    getStartupOpenedFile(),
  ]);

  if (savedLibJson) {
    try {
      const parsedLib = safeJsonParse<BookLibraryState>(savedLibJson);
      if (Array.isArray(parsedLib.books) && parsedLib.books.length > 0) {
        state.library = {
          activeBookId: parsedLib.activeBookId,
          books: sortLibraryBooksByLatest(parsedLib.books.map(normalizeProjectDefaults)),
        };
        state.project = getActiveBookFromLibrary(state.library);
      }
    } catch {
      // Fallback cleanly to single project load
    }
  } else {
    const saved = await loadPersistedProject();
    if (saved) {
      try {
        const decoded = await parseQuillvibeInput(saved, { filenameHint: 'saved.qv' });
        const applied = applyOpenedExtensionFile(decoded.parsed, state.project);
        state.project = applied.project;
        state.library = upsertBookInLibrary(state.library, state.project);
      } catch {
        // Fallback to starter
      }
    }
  }

  // Multi-window support: Tauri initializationScript global or ?bookId=... opens the requested book directly
  const winInit =
    typeof window !== 'undefined'
      ? (window as unknown as { __QUILLVIBE_INITIAL_BOOK_ID__?: string; __QUILLVIBE_SKIP_SPLASH__?: boolean })
      : {};
  const requestedBookId =
    winInit.__QUILLVIBE_INITIAL_BOOK_ID__?.trim() ||
    (typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('bookId')?.trim()
      : null);
  const skipSplashFromWindow = Boolean(winInit.__QUILLVIBE_SKIP_SPLASH__ || requestedBookId);
  if (requestedBookId && isEmptyTabId(requestedBookId)) {
    const emptyId = createEmptyTabId();
    setTabOrderAndActive([emptyId], emptyId, false);
  } else if (requestedBookId && isSpecialPageTabId(requestedBookId)) {
    state.activeView = resolveSpecialPageView(requestedBookId);
    setTabOrderAndActive([requestedBookId], requestedBookId, false);
  } else if (requestedBookId) {
    const handoff = consumeDetachHandoff(requestedBookId);
    if (handoff) {
      const normalizedHandoff = normalizeProjectDefaults(handoff.project);
      state.library = upsertBookInLibrary(state.library, normalizedHandoff);
      state.library = switchActiveBook(state.library, normalizedHandoff.id);
      state.project = getActiveBookFromLibrary(state.library);
      state.activeView = handoff.activeView;
      state.activeSceneId = handoff.activeSceneId;
      state.editorSubMode = handoff.editorSubMode;
      state.typesetSubTab = handoff.typesetSubTab;
      if (typeof handoff.showBinder === 'boolean') state.showBinder = handoff.showBinder;
      if (typeof handoff.showInspector === 'boolean') state.showInspector = handoff.showInspector;
      pendingDetachHandoffEditorState = {
        sceneId: handoff.activeSceneId,
        scrollTop: handoff.scrollTop,
        selectionStart: handoff.selectionStart,
        selectionEnd: handoff.selectionEnd,
      };
      rememberLastBook(state.project.id);
      setTabOrderAndActive([state.project.id], state.project.id, false);
    } else if (state.library.books.some((b) => b.id === requestedBookId)) {
      state.library = switchActiveBook(state.library, requestedBookId);
      state.project = getActiveBookFromLibrary(state.library);
      rememberLastBook(state.project.id);
      setTabOrderAndActive([state.project.id], state.project.id, false);
    } else {
      setTabOrderAndActive([state.project.id], state.project.id, false);
    }
  } else {
    setTabOrderAndActive([state.project.id], state.project.id, false);
  }

  installGlobalErrorHandlers((q) => actions.openHelpPage(q));
  currentWindowLabel = await getDesktopWindowLabel();

  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const storedBookId = window.localStorage.getItem(LAST_OPENED_BOOK_STORAGE_KEY)?.trim() ?? '';
      if (storedBookId && state.library.books.some((b) => b.id === storedBookId)) {
        lastOpenedBookId = storedBookId;
      } else {
        rememberLastBook(state.project.id);
      }
    } catch {
      lastOpenedBookId = state.project.id;
    }
  } else {
    lastOpenedBookId = state.project.id;
  }

  if (isTauriRuntime() && !requestedBookId) {
    const savedTabs = tabManager.loadPersistedOrder(currentWindowLabel);
    if (savedTabs) {
      const validBookIds = new Set(state.library.books.map((b) => b.id));
      const restored = savedTabs.tabIds.filter((id) => isNonBookTabId(id) || validBookIds.has(id));
      if (restored.length > 0) {
        const nextActive =
          savedTabs.activeTabId && restored.includes(savedTabs.activeTabId)
            ? savedTabs.activeTabId
            : state.project.id;
        setTabOrderAndActive(restored, nextActive, false);
        if (!isNonBookTabId(nextActive) && validBookIds.has(nextActive)) {
          if (nextActive !== state.project.id) {
            state.library = switchActiveBook(state.library, nextActive);
            state.project = getActiveBookFromLibrary(state.library);
          }
          rememberLastBook(nextActive);
        }
      }
    }
  }

  windowSync?.destroy();
  windowSync = new WorkspaceWindowSync({
    getWindowLabel: () => currentWindowLabel,
    getOpenBookIds: () => state.openBookTabIds,
    getActiveBookId: () => state.activeTabId,
    getTabStripMetrics: () => {
      const strip = desktopTabBarEl?.querySelector<HTMLElement>('.qv-tab-strip');
      const firstTab = strip?.querySelector<HTMLElement>('.qv-book-tab');
      const stripRect = strip?.getBoundingClientRect();
      const tabW = firstTab?.getBoundingClientRect().width;
      return {
        tabWidthPx: tabW && tabW > 0 ? Math.round(tabW) : 160,
        tabCount: tabManager.getTabIds().length,
        stripLeftOffsetPx: stripRect && stripRect.left >= 0 ? Math.round(stripRect.left) : 44,
      };
    },
    onTabHoverPreview: (_fromWindowId, insertionIndex) => {
      renderTabDropIndicator(insertionIndex);
    },
    onTabHoverClear: () => {
      renderTabDropIndicator(null);
    },
    onRemoteBookUpdated: (bookId, remoteProject) => {
      const normalized = normalizeProjectDefaults(remoteProject);
      const exists = state.library.books.some((b) => b.id === bookId);
      state.library = {
        activeBookId: state.library.activeBookId,
        books: exists
          ? state.library.books.map((b) => (b.id === bookId ? normalized : b))
          : [...state.library.books, normalized],
      };
      if (!isNonBookTabId(state.activeTabId) && state.project.id === bookId) {
        isApplyingRemoteSync = true;
        try {
          const proseEl = mainStageEl?.querySelector<HTMLTextAreaElement>('.bv-prose-textarea');
          const prevStart = proseEl?.selectionStart ?? 0;
          const prevEnd = proseEl?.selectionEnd ?? 0;
          const prevScroll = proseEl?.scrollTop ?? 0;
          const wasFocused = Boolean(proseEl && document.activeElement === proseEl);
          state.project = normalized;
          if (bookTitleInputEl && bookTitleInputEl.value !== normalized.title) {
            bookTitleInputEl.value = normalized.title;
          }
          if (state.activeView === 'editor' && proseEl) {
            const ctx = findSceneContext(state.project, state.activeSceneId);
            const hasPendingLocalInput = wasFocused && persistTimer !== null;
            if (ctx && !hasPendingLocalInput && proseEl.value !== ctx.scene.content) {
              proseEl.value = ctx.scene.content;
              if (wasFocused) {
                const maxLen = proseEl.value.length;
                proseEl.setSelectionRange(Math.min(prevStart, maxLen), Math.min(prevEnd, maxLen));
              }
              proseEl.scrollTop = prevScroll;
            }
            updateWordCountersOnly();
          } else {
            renderActiveView();
          }
          state.saveStatusLabel = 'Synced';
          if (saveStatusEl) saveStatusEl.textContent = state.saveStatusLabel;
        } finally {
          isApplyingRemoteSync = false;
        }
      }
      renderDesktopTabBar();
    },
    onTabTransferredAway: (bookId) => {
      tabDragController.handleTabRemoved(bookId);
      const remaining = tabManager.getTabIds().filter((id) => id !== bookId);
      if (remaining.length === 0) {
        void closeDesktopWindow();
        return;
      }
      const wasActive = tabManager.getActiveTabId() === bookId;
      tabManager.closeTab(bookId);
      syncTabsFromManager(true);
      if (wasActive) {
        const nextId = tabManager.getActiveTabId();
        if (isNonBookTabId(nextId)) {
          state.activeView =
            nextId === COURSE_TAB_ID
              ? 'course'
              : nextId === HELP_TAB_ID
                ? 'help'
                : nextId === SETTINGS_TAB_ID
                  ? 'settings'
                  : nextId === MANUAL_TAB_ID
                    ? 'manual'
                    : nextId === EXTENSIONS_TAB_ID
                      ? 'extensions'
                      : 'editor';
          windowSync?.publishPresence();
          renderDesktopTabBar();
          renderActiveView();
        } else {
          actions.switchBook(nextId);
        }
      } else {
        windowSync?.publishPresence();
        renderDesktopTabBar();
      }
    },
    onTabDroppedIntoMe: (_fromWindowId, incomingBookId, insertionIndex) => {
      renderTabDropIndicator(null);
      const handoff = isNonBookTabId(incomingBookId) ? null : consumeDetachHandoff(incomingBookId);
      if (handoff) {
        const normalizedHandoff = normalizeProjectDefaults(handoff.project);
        state.library = upsertBookInLibrary(state.library, normalizedHandoff);
      }
      tabManager.openTab(incomingBookId, { activate: true, insertAt: insertionIndex });
      syncTabsFromManager(true);
      if (isEmptyTabId(incomingBookId)) {
        state.activeView = 'editor';
        windowSync?.publishPresence();
        renderDesktopTabBar();
        renderActiveView();
      } else if (isSpecialPageTabId(incomingBookId)) {
        state.activeView = resolveSpecialPageView(incomingBookId);
        windowSync?.publishPresence();
        renderDesktopTabBar();
        renderActiveView();
      } else {
        if (handoff) {
          state.activeView = handoff.activeView;
          state.activeSceneId = handoff.activeSceneId;
          state.editorSubMode = handoff.editorSubMode;
          state.typesetSubTab = handoff.typesetSubTab;
          if (typeof handoff.showBinder === 'boolean') state.showBinder = handoff.showBinder;
          if (typeof handoff.showInspector === 'boolean') state.showInspector = handoff.showInspector;
          pendingDetachHandoffEditorState = {
            sceneId: handoff.activeSceneId,
            scrollTop: handoff.scrollTop,
            selectionStart: handoff.selectionStart,
            selectionEnd: handoff.selectionEnd,
          };
        } else {
          state.activeView = 'editor';
        }
        actions.switchBook(incomingBookId);
      }
      actions.notify('Combined tab into this window');
    },
    onMergeRequested: (targetWindowId) => {
      const myBooks = tabManager.getTabIds().filter((id) => !isNonBookTabId(id));
      windowSync?.sendMergeOffer(targetWindowId, myBooks);
    },
    onMergeOfferReceived: (fromWindowId, incomingBookIds) => {
      for (const bid of incomingBookIds) {
        if (bid && !isNonBookTabId(bid)) {
          tabManager.openTab(bid, { activate: false });
        }
      }
      syncTabsFromManager(true);
      windowSync?.publishPresence();
      renderDesktopTabBar();
      windowSync?.sendMergeAck(fromWindowId);
      actions.notify('Combined open windows into this window');
    },
    onMergeAcknowledged: () => {
      void closeDesktopWindow();
    },
  });

  // Auto-follow OS light/dark changes when theme is set to Match Device (System)
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    media.addEventListener('change', () => {
      if (state.settings.appTheme === 'system') {
        applySettingsToDocument(state.settings);
        syncThemeButtonIcon();
        renderActiveView();
      }
    });
  }

  // Keep library books synchronized across parallel desktop windows without overwriting active edits
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', (ev) => {
      if (ev.key !== 'quillvibe.library.v2' || !ev.newValue) return;
      try {
        const externalLib = safeJsonParse<BookLibraryState>(ev.newValue);
        if (!Array.isArray(externalLib.books) || externalLib.books.length === 0) return;
        const merged = externalLib.books.map((b) =>
          !isEmptyTabId(state.activeTabId) && b.id === state.project.id
            ? state.project
            : normalizeProjectDefaults(b),
        );
        if (!isEmptyTabId(state.activeTabId) && !merged.some((b) => b.id === state.project.id)) {
          merged.push(state.project);
        }
        const mergedIds = new Set(merged.map((b) => b.id));
        tabManager.prune((id) => mergedIds.has(id), state.project.id);
        syncTabsFromManager(false);
        state.library = { activeBookId: state.project.id, books: sortLibraryBooksByLatest(merged) };
        renderDesktopTabBar();
        if (isEmptyTabId(state.activeTabId)) renderActiveView();
      } catch {
        // Ignore malformed storage updates
      }
    });
  }

  state.sprintStartWords = getProjectWordCount(state.project);
  if (!findSceneContext(state.project, state.activeSceneId)) {
    state.activeSceneId = getAllScenes(state.project)[0]?.scene.id ?? '';
  }

  applySettingsToDocument(state.settings);
  mountGlobalControlGlass();
  loadCustomFonts();

  let hasSeenSplash = false;
  try {
    hasSeenSplash =
      window.localStorage.getItem('quillvibe.splashSeen.v2') === '1' ||
      window.localStorage.getItem('bookvibe.splashSeen.v1') === '1';
  } catch {
    // Ignore storage access errors
  }

  let forceSplashFromRoute = false;
  if (!isTauriRuntime()) {
    const initialSearchQ = new URLSearchParams(window.location.search).get('q');
    const initialRoute = readInitialBrowserRoute(!hasSeenSplash);
    const effTier = getEffectiveTier();
    state.activeView = allowedViewsForTier(effTier).includes(initialRoute.view)
      ? initialRoute.view
      : 'editor';
    if (initialRoute.view === 'help' && initialSearchQ) {
      setHelpPageSearch(initialSearchQ);
    }
    if (initialRoute.typesetSubTab) {
      state.typesetSubTab = initialRoute.typesetSubTab;
    }
    if (initialRoute.editorSubMode) {
      state.editorSubMode = initialRoute.editorSubMode;
    }
    forceSplashFromRoute =
      initialRoute.showStartSplash &&
      initialRoute.view !== 'course' &&
      initialRoute.view !== 'help' &&
      initialRoute.view !== 'developer';

    window.addEventListener('popstate', () => {
      const nextRoute = readInitialBrowserRoute(false);
      suppressNextBrowserPush = true;
      actions.setState(
        {
          activeView: allowedViewsForTier(getEffectiveTier()).includes(nextRoute.view)
            ? nextRoute.view
            : 'editor',
          ...(nextRoute.typesetSubTab ? { typesetSubTab: nextRoute.typesetSubTab } : {}),
          ...(nextRoute.editorSubMode ? { editorSubMode: nextRoute.editorSubMode } : {}),
        },
        true,
      );
    });
  }

  if (typeof document !== 'undefined' && !isTauriRuntime()) {
    document.addEventListener('fullscreenchange', () => {
      const nextFull = Boolean(document.fullscreenElement);
      if (state.immersiveMode !== nextFull) {
        state.immersiveMode = nextFull;
        shellEl?.classList.toggle('is-immersive', nextFull);
        immersiveBtnEl?.classList.toggle('is-active', nextFull);
        immersiveHud?.sync();
      }
    });
  }

  if (isFullStageView(state.activeView)) {
    state.showBinder = false;
    state.showInspector = false;
  } else if (
    typeof window !== 'undefined' &&
    window.innerWidth <= COMPACT_SIDEBAR_BREAKPOINT &&
    state.showBinder &&
    state.showInspector
  ) {
    state.showInspector = false;
  }

  buildShell(root);
  wireGlobalShortcutsAndDrop();

  // Open startup file AFTER shell is mounted (fixes desktop .qvscene/.qv startup crash)
  if (startupFile) {
    try {
      const resolved = resolveOpenedFilePayload(startupFile);
      await handleOpenedFile(resolved.input, startupFile.filename, {
        base64Encoded: resolved.base64Encoded,
        allowLegacy: false,
        openInNewTab: true,
      });
      state.saveStatusLabel = 'Saved';
    } catch {
      // Continue cleanly if startup file was malformed
    }
  } else {
    renderActiveView();
    if (pendingDetachHandoffEditorState) {
      const restore = pendingDetachHandoffEditorState;
      pendingDetachHandoffEditorState = null;
      requestAnimationFrame(() => {
        const proseEl = mainStageEl?.querySelector<HTMLTextAreaElement>('.bv-prose-textarea');
        if (proseEl && state.activeSceneId === restore.sceneId) {
          proseEl.scrollTop = restore.scrollTop;
          const maxLen = proseEl.value.length;
          proseEl.focus({ preventScroll: true });
          proseEl.setSelectionRange(
            Math.min(restore.selectionStart, maxLen),
            Math.min(restore.selectionEnd, maxLen),
          );
        }
      });
    }
  }

  // Listen for files opened via OS double-click while this desktop window is already running
  if (isTauriRuntime()) {
    void listenDesktopOpenFile((opened) => {
      const resolved = resolveOpenedFilePayload(opened);
      void handleOpenedFile(resolved.input, opened.filename, {
        base64Encoded: resolved.base64Encoded,
        allowLegacy: false,
        openInNewTab: true,
      });
    });
  }

  const bootSplash = document.getElementById('qv-boot-splash');
  if (bootSplash) {
    bootSplash.classList.add('is-leaving');
    window.setTimeout(() => bootSplash.remove(), 260);
  }

  if (
    state.activeView !== 'landing' &&
    state.activeView !== 'course' &&
    state.activeView !== 'help' &&
    state.activeView !== 'developer' &&
    !skipSplashFromWindow &&
    !startupFile
  ) {
    maybeRunFirstLaunchSplash(actions, forceSplashFromRoute);
  } else if (!isNonBookTabId(state.activeTabId)) {
    window.setTimeout(() => maybeNotifySharedBook(state.project.id), 300);
  }
}

export async function bootQuillvibeApp(): Promise<AppActions> {
  await bootstrap();
  if (!isTauriRuntime() && typeof navigator !== 'undefined' && 'serviceWorker' in navigator && window.location.protocol === 'https:') {
    window.addEventListener('load', () => {
      void navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => undefined);
    });
  }

  return actions;
}

const manualBoot =
  typeof window !== 'undefined' &&
  Boolean((window as unknown as { __QUILLVIBE_MANUAL_BOOT__?: boolean }).__QUILLVIBE_MANUAL_BOOT__);

if (!manualBoot) {
  void bootQuillvibeApp();
}
