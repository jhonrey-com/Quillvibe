import type { AppActions } from '../core/app-context';
import { isTauriRuntime } from '../core/bridge';
import type { ToolTier } from '../core/types';
import {
  COURSE_MODULES,
  COURSE_PLATFORM_OPTIONS,
  COURSE_TRACK_OPTIONS,
  getCourseCompletionSummary,
  getModulePlatform,
  getModuleTrack,
  navigateToCourseLesson,
  openInteractiveCourseDrawer,
  readCompletedCourseLessons,
  toggleCourseLessonDone,
  type CourseLesson,
  type CourseModule,
  type CourseTrackId,
} from '../ui/course';
import { clearNode, el, icon } from '../ui/dom';
import { createAppThemeButton } from '../ui/theme-button';

const COLLAPSE_COMPLETED_KEY = 'quillvibe.courseCollapseCompleted.v1';

function readCollapseCompletedSetting(): boolean {
  if (typeof window === 'undefined' || !window.localStorage) return true;
  try {
    const raw = window.localStorage.getItem(COLLAPSE_COMPLETED_KEY);
    return raw === null ? true : raw === '1';
  } catch {
    return true;
  }
}

function writeCollapseCompletedSetting(val: boolean): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(COLLAPSE_COMPLETED_KEY, val ? '1' : '0');
  } catch {
    // Ignore storage limits
  }
}

let selectedModuleId = COURSE_MODULES[0].id;
let selectedLessonId = COURSE_MODULES[0].lessons[0].id;
let tierFilter: 'all' | ToolTier = 'all';
let trackFilter: 'all' | CourseTrackId = 'all';
let platformFilter: 'all' | 'web' | 'desktop' = isTauriRuntime() ? 'desktop' : 'web';
let syllabusFilterQuery = '';
let mobileSyllabusOpen = false;
let collapseCompletedModules = readCollapseCompletedSetting();
const expandedModuleIds = new Set<string>([COURSE_MODULES[0].id]);
const manuallyExpandedCompletedIds = new Set<string>();
const checkpointSelections = new Map<string, number>();

export function setCoursePageSelection(moduleId?: string, lessonId?: string): void {
  if (moduleId && COURSE_MODULES.some((m) => m.id === moduleId)) {
    selectedModuleId = moduleId;
    expandedModuleIds.add(moduleId);
    const mod = COURSE_MODULES.find((m) => m.id === moduleId)!;
    selectedLessonId =
      lessonId && mod.lessons.some((l) => l.id === lessonId) ? lessonId : mod.lessons[0].id;
  } else if (lessonId) {
    for (const m of COURSE_MODULES) {
      if (m.lessons.some((l) => l.id === lessonId)) {
        selectedModuleId = m.id;
        expandedModuleIds.add(m.id);
        selectedLessonId = lessonId;
        break;
      }
    }
  }
}

interface FlatLessonRef {
  module: CourseModule;
  lesson: CourseLesson;
}

function getAllFlatLessons(pf: 'all' | 'web' | 'desktop' = 'all'): FlatLessonRef[] {
  const out: FlatLessonRef[] = [];
  for (const m of COURSE_MODULES) {
    if (pf !== 'all') {
      const mp = getModulePlatform(m);
      if (mp !== 'both' && mp !== pf) continue;
    }
    for (const l of m.lessons) {
      out.push({ module: m, lesson: l });
    }
  }
  return out;
}

const WEB_MODULE_SCREENSHOTS: Partial<Record<string, { src: string; caption: string }>> = {
  'mod-setup': {
    src: '/screenshots/editor-workspace.png',
    caption: 'Quillvibe Web Manuscript workspace: Binder, Paper Sheet, Proofread/Split Ref controls, and Scene Inspector.',
  },
  'mod-ms-deep-1': {
    src: '/screenshots/editor-workspace.png',
    caption: 'Manuscript Workspace 101: Three-tier Binder hierarchy (Part -> Chapter -> Scene), paper sheet, and Scene Inspector.',
  },
  'mod-ms-deep-2': {
    src: '/screenshots/editor-split-diff.png',
    caption: 'Manuscript Workspace 201: Draft sheet with resizable Split Reference drawer and Revision Diff controls.',
  },
  'mod-web-browser': {
    src: '/screenshots/course-academy.png',
    caption: 'Quillvibe Web Edition: Direct browser URLs, Universal Search (Ctrl+K), and Academy guides.',
  },
  'mod-plot': {
    src: '/screenshots/story-graph.png',
    caption: 'Story Graph showing character and plot cards linked with crisp orthogonal connectors.',
  },
  'mod-series-world': {
    src: '/screenshots/story-graph.png',
    caption: 'Story Graph Auto-Sync wiring scene links and Story Bible continuity across chapters.',
  },
  'mod-sg-deep-1': {
    src: '/screenshots/story-graph.png',
    caption: 'Story Graph 101: Spatial Storyboard cards, real-time connectors, and removable Group Frames.',
  },
  'mod-sg-deep-2': {
    src: '/screenshots/story-graph.png',
    caption: 'Story Graph 201: Force Graph constellation, shortest path tracing, and Auto-Sync Book links.',
  },
  'mod-cover': {
    src: '/screenshots/cover-studio.png',
    caption: 'Book Cover Studio with layered shapes, corner resize handles, and live properties.',
  },
  'mod-cs-deep-1': {
    src: '/screenshots/cover-studio.png',
    caption: 'Book Cover Studio 101: Multi-face jacket artboard, magnetic snapping guides, and grouped layer hierarchy.',
  },
  'mod-cs-deep-2': {
    src: '/screenshots/desktop-cover-pro.png',
    caption: 'Book Cover Studio 201 (Desktop Pro): Vector paths, optical blend modes, URL paste, and draft comparison.',
  },
  'mod-prepress': {
    src: '/screenshots/cover-studio.png',
    caption: 'Book Cover Studio previewing zoom scale, trim hierarchy, and export preparation.',
  },
  'mod-desktop': {
    src: '/screenshots/desktop-editor.png',
    caption: 'Desktop Edition: Stacked Chrome-style Book Tab Bar, New Tab picker, and native window controls.',
  },
  'mod-desktop-tabs': {
    src: '/screenshots/desktop-editor.png',
    caption: 'Desktop Window Craft: Drag tabs horizontally to reorder or pull vertically downward to tear off windows.',
  },
  'mod-desktop-os': {
    src: '/screenshots/desktop-story-graph.png',
    caption: 'Desktop Studio: F11 fullscreen focus bar, direct disk saving, and GitHub Release updater.',
  },
};

function resolveModuleScreenshot(modId: string): { src: string; caption: string } | undefined {
  const entry = WEB_MODULE_SCREENSHOTS[modId];
  if (!entry) return undefined;
  if (!isTauriRuntime()) return entry;
  if (entry.src === '/screenshots/editor-workspace.png' || entry.src === '/screenshots/editor-split-diff.png') {
    return {
      src: '/screenshots/desktop-editor.png',
      caption: 'Quillvibe Desktop Manuscript workspace with stacked Book Tab Bar and native controls.',
    };
  }
  if (entry.src === '/screenshots/story-graph.png') {
    return {
      src: '/screenshots/desktop-story-graph.png',
      caption: 'Quillvibe Desktop Story Graph with stacked tabs, live edge wires, and Force Graph options.',
    };
  }
  if (entry.src === '/screenshots/cover-studio.png') {
    return {
      src: '/screenshots/desktop-cover-pro.png',
      caption: 'Quillvibe Desktop Pro Cover Studio with Vector Draw paths, Blend Modes, and Variant Compare.',
    };
  }
  return entry;
}

/**
 * Full-page book writing & publishing curriculum with calm two-pane reading focus.
 */
export function renderCoursePageView(container: HTMLElement, actions: AppActions): void {
  clearNode(container);

  const flatAll = getAllFlatLessons(platformFilter);
  const currentRef =
    flatAll.find((r) => r.lesson.id === selectedLessonId) ??
    flatAll.find((r) => r.module.id === selectedModuleId) ??
    flatAll[0];
  selectedModuleId = currentRef.module.id;
  selectedLessonId = currentRef.lesson.id;
  expandedModuleIds.add(currentRef.module.id);

  const doneSet = readCompletedCourseLessons();
  const summary = getCourseCompletionSummary(platformFilter);
  const currentIdx = flatAll.findIndex((r) => r.lesson.id === currentRef.lesson.id);
  const prevRef = currentIdx > 0 ? flatAll[currentIdx - 1] : null;
  const nextRef = currentIdx < flatAll.length - 1 ? flatAll[currentIdx + 1] : null;
  const filterQ = syllabusFilterQuery.trim().toLowerCase();
  const matchesPlatform = (mod: CourseModule) => {
    if (platformFilter === 'all') return true;
    const p = getModulePlatform(mod);
    return p === 'both' || p === platformFilter;
  };
  const visibleModCount = COURSE_MODULES.filter(matchesPlatform).length;

  // Syllabus Sidebar with collapsible module accordions
  const syllabusSearchInput = el('input', {
    className: 'bv-input qv-course-syllabus-search',
    attrs: {
      type: 'search',
      placeholder: 'Filter modules or lessons…',
      'aria-label': 'Filter syllabus lessons',
      value: syllabusFilterQuery,
    },
    on: {
      input: () => {
        syllabusFilterQuery = syllabusSearchInput.value;
        renderCoursePageView(container, actions);
        const restored = container.querySelector<HTMLInputElement>('.qv-course-syllabus-search');
        if (restored) {
          restored.focus();
          restored.setSelectionRange(restored.value.length, restored.value.length);
        }
      },
    },
  });

  const platformRow = el(
    'div',
    { className: 'qv-course-filter-row', attrs: { 'aria-label': 'Filter by Edition' } },
    ...COURSE_PLATFORM_OPTIONS.map((pf) =>
      el('button', {
        className: `bv-mini-btn${platformFilter === pf.id ? ' is-active' : ''}`,
        text: pf.label,
        attrs: { type: 'button' },
        on: {
          click: () => {
            platformFilter = pf.id;
            const firstMatch = COURSE_MODULES.find(
              (m) => pf.id === 'all' || getModulePlatform(m) === 'both' || getModulePlatform(m) === pf.id,
            );
            if (
              firstMatch &&
              pf.id !== 'all' &&
              getModulePlatform(currentRef.module) !== 'both' &&
              getModulePlatform(currentRef.module) !== pf.id
            ) {
              selectedModuleId = firstMatch.id;
              selectedLessonId = firstMatch.lessons[0].id;
              expandedModuleIds.add(firstMatch.id);
            }
            renderCoursePageView(container, actions);
          },
        },
      }),
    ),
  );

  const trackRow = el(
    'div',
    { className: 'qv-course-filter-row', attrs: { 'aria-label': 'Filter by Course Track' } },
    ...COURSE_TRACK_OPTIONS.map((tr) =>
      el('button', {
        className: `bv-mini-btn${trackFilter === tr.id ? ' is-active' : ''}`,
        text: tr.label,
        attrs: { type: 'button' },
        on: {
          click: () => {
            trackFilter = tr.id;
            const firstMatch = COURSE_MODULES.find((m) => tr.id === 'all' || getModuleTrack(m) === tr.id);
            if (firstMatch && tr.id !== 'all' && getModuleTrack(currentRef.module) !== tr.id) {
              selectedModuleId = firstMatch.id;
              selectedLessonId = firstMatch.lessons[0].id;
              expandedModuleIds.add(firstMatch.id);
            }
            renderCoursePageView(container, actions);
          },
        },
      }),
    ),
  );

  const filterRow = el(
    'div',
    { className: 'qv-course-filter-row' },
    ...(['all', 'basic', 'intermediate', 'advanced'] as const).map((tier) =>
      el('button', {
        className: `bv-mini-btn${tierFilter === tier ? ' is-active' : ''}`,
        text: tier === 'all' ? 'All Tiers' : tier.charAt(0).toUpperCase() + tier.slice(1),
        attrs: { type: 'button' },
        on: {
          click: () => {
            tierFilter = tier;
            renderCoursePageView(container, actions);
          },
        },
      }),
    ),
  );

  const navList = el('div', { className: 'qv-course-nav-list' });
  for (const mod of COURSE_MODULES) {
    if (!matchesPlatform(mod)) continue;
    if (trackFilter !== 'all' && getModuleTrack(mod) !== trackFilter) continue;
    const visibleLessons = mod.lessons.filter((l) => {
      const tierOk = tierFilter === 'all' || l.minTier === tierFilter;
      if (!tierOk) return false;
      if (!filterQ) return true;
      const hay = `${mod.title} ${mod.summary} ${l.title} ${l.instruction} ${l.objective}`.toLowerCase();
      return filterQ.split(/\s+/).every((t) => hay.includes(t));
    });
    if (visibleLessons.length === 0) continue;

    const modCompleted = mod.lessons.filter((l) => doneSet.has(l.id)).length;
    const isModComplete = mod.lessons.length > 0 && modCompleted === mod.lessons.length;
    const isFiltering = Boolean(filterQ) || tierFilter !== 'all' || trackFilter !== 'all';
    const isExpanded = isFiltering
      ? true
      : isModComplete && collapseCompletedModules
        ? manuallyExpandedCompletedIds.has(mod.id)
        : expandedModuleIds.has(mod.id);
    const hasActiveLesson = mod.id === currentRef.module.id;

    const headBtn = el(
      'button',
      {
        className: `qv-course-nav-group-toggle${hasActiveLesson ? ' has-active' : ''}${isExpanded ? ' is-open' : ''}${isModComplete ? ' is-mod-complete' : ''}`,
        attrs: {
          type: 'button',
          'aria-expanded': String(isExpanded),
        },
        on: {
          click: () => {
            if (isModComplete && collapseCompletedModules) {
              if (manuallyExpandedCompletedIds.has(mod.id)) {
                manuallyExpandedCompletedIds.delete(mod.id);
              } else {
                manuallyExpandedCompletedIds.add(mod.id);
              }
            } else if (expandedModuleIds.has(mod.id)) {
              expandedModuleIds.delete(mod.id);
            } else {
              expandedModuleIds.add(mod.id);
            }
            renderCoursePageView(container, actions);
          },
        },
      },
      el('span', {
        className: 'qv-course-mod-caret',
        text: isExpanded ? '▾' : '▸',
      }),
      el('span', {
        className: 'qv-course-mod-label',
        text: `${mod.number}. ${mod.title}`,
      }),
      el('span', {
        className: `bv-mono-tag${isModComplete ? ' qv-course-mod-done-badge' : ''}`,
        text: isModComplete ? `Completed (${modCompleted}/${mod.lessons.length})` : `${modCompleted}/${mod.lessons.length}`,
      }),
    );

    const modBlock = el(
      'div',
      { className: `qv-course-nav-group${isExpanded ? ' is-open' : ''}${isModComplete ? ' is-mod-complete' : ''}` },
      headBtn,
    );

    if (isExpanded) {
      const itemsWrap = el('div', { className: 'qv-course-nav-items' });
      for (const lesson of visibleLessons) {
        const isSelected = lesson.id === currentRef.lesson.id;
        const isDone = doneSet.has(lesson.id);
        itemsWrap.appendChild(
          el(
            'button',
            {
              className: `qv-course-nav-item${isSelected ? ' is-active' : ''}${isDone ? ' is-done' : ''}`,
              attrs: { type: 'button' },
              on: {
                click: () => {
                  selectedModuleId = mod.id;
                  selectedLessonId = lesson.id;
                  expandedModuleIds.add(mod.id);
                  mobileSyllabusOpen = false;
                  renderCoursePageView(container, actions);
                },
              },
            },
            el('span', {
              className: 'qv-course-nav-dot',
              text: isDone ? '✓' : '–',
            }),
            el(
              'div',
              { className: 'qv-course-nav-item-text' },
              el('div', { text: lesson.title }),
              el('span', {
                className: 'bv-mono-tag',
                text: `${lesson.durationMin} min (${lesson.minTier})`,
              }),
            ),
          ),
        );
      }
      modBlock.appendChild(itemsWrap);
    }
    navList.appendChild(modBlock);
  }

  const sidebar = el(
    'aside',
    {
      className: `qv-course-sidebar${mobileSyllabusOpen ? ' is-mobile-open' : ''}`,
      attrs: { 'aria-label': 'Course Syllabus' },
    },
    el(
      'div',
      { className: 'qv-course-sidebar-top' },
      el(
        'div',
        { className: 'qv-course-sidebar-brand' },
        el(
          'div',
          {},
          el('strong', { text: 'Book Writing Course', style: { fontSize: '14.5px', display: 'block' } }),
          el('span', { className: 'bv-label', text: `${visibleModCount} modules, ${summary.total} lessons` }),
        ),
        el(
          'button',
          {
            className: 'bv-mini-btn qv-course-sidebar-close',
            text: 'Done',
            attrs: { type: 'button' },
            on: {
              click: () => {
                mobileSyllabusOpen = false;
                renderCoursePageView(container, actions);
              },
            },
          },
        ),
      ),
      el('div', {
        className: 'bv-label',
        text: `${summary.completed} of ${summary.total} lessons completed (${summary.pct}%)`,
      }),
      el(
        'div',
        { className: 'qv-course-progress-bar' },
        el('div', {
          className: 'qv-course-progress-fill',
          style: { width: `${summary.pct}%` },
        }),
      ),
      syllabusSearchInput,
      platformRow,
      trackRow,
      filterRow,
      el(
        'label',
        { className: 'qv-course-collapse-opt' },
        el('input', {
          attrs: {
            type: 'checkbox',
            checked: collapseCompletedModules,
            'aria-label': 'Collapse completed courses by default',
          },
          on: {
            change: (ev) => {
              collapseCompletedModules = (ev.target as HTMLInputElement).checked;
              writeCollapseCompletedSetting(collapseCompletedModules);
              if (!collapseCompletedModules) {
                for (const m of COURSE_MODULES) {
                  if (m.lessons.every((l) => doneSet.has(l.id))) {
                    expandedModuleIds.add(m.id);
                  }
                }
              } else {
                manuallyExpandedCompletedIds.clear();
              }
              renderCoursePageView(container, actions);
            },
          },
        }),
        el('span', { text: 'Collapse completed courses' }),
      ),
    ),
    navList,
  );

  // Main calm editorial reading pane
  const { module: mod, lesson } = currentRef;
  const isDone = doneSet.has(lesson.id);
  const modPlatform = getModulePlatform(mod);

  const moduleShot = resolveModuleScreenshot(mod.id);
  const visualFigure = moduleShot
    ? el(
        'figure',
        { className: 'qv-help-figure' },
        el('img', {
          attrs: { src: moduleShot.src, alt: moduleShot.caption, loading: 'lazy' },
        }),
        el('figcaption', { text: moduleShot.caption }),
      )
    : null;

  const conceptsBox = el(
    'section',
    { className: 'qv-course-section' },
    el('h2', { text: 'Craft & Context' }),
    ...lesson.concepts.map((para) => el('p', { text: para })),
    visualFigure,
  );

  const stepsOl = el('ol', { className: 'qv-course-steps-list' });
  for (const step of lesson.steps) {
    stepsOl.appendChild(el('li', { text: step }));
  }

  const stepsBox = el(
    'section',
    { className: 'qv-course-section' },
    el('h2', { text: 'Practice Inside Quillvibe' }),
    stepsOl,
  );

  const exampleBox = el(
    'aside',
    { className: 'qv-course-callout' },
    el('div', { className: 'bv-panel-title', text: `Practical Example: ${lesson.example.heading}` }),
    el('p', { text: lesson.example.body }),
    el(
      'div',
      { className: 'qv-course-protip' },
      el('strong', { text: 'Author Note: ' }),
      el('span', { text: lesson.proTip }),
    ),
  );

  const chosenIdx = checkpointSelections.get(lesson.id);
  const checkpointOptions = el('div', { className: 'qv-course-quiz-opts' });
  lesson.checkpoint.options.forEach((optText, idx) => {
    const isChosen = chosenIdx === idx;
    const isCorrect = idx === lesson.checkpoint.correctIndex;
    let stateClass = '';
    if (chosenIdx !== undefined) {
      if (isCorrect) stateClass = ' is-correct';
      else if (isChosen) stateClass = ' is-wrong';
    }
    checkpointOptions.appendChild(
      el(
        'button',
        {
          className: `qv-course-quiz-opt${stateClass}`,
          attrs: { type: 'button' },
          on: {
            click: () => {
              checkpointSelections.set(lesson.id, idx);
              renderCoursePageView(container, actions);
            },
          },
        },
        el('span', { className: 'bv-mono-tag', text: String.fromCharCode(65 + idx) }),
        el('span', { text: optText }),
      ),
    );
  });

  const checkpointBox = el(
    'section',
    { className: 'qv-course-section qv-course-quiz-card' },
    el('h2', { text: 'Check Your Understanding' }),
    el('p', { text: lesson.checkpoint.question, style: { fontWeight: '600' } }),
    checkpointOptions,
    ...(chosenIdx !== undefined
      ? [
          el('div', {
            className: 'qv-course-quiz-feedback',
            text:
              chosenIdx === lesson.checkpoint.correctIndex
                ? `Correct — ${lesson.checkpoint.explanation}`
                : `Review note: ${lesson.checkpoint.explanation}`,
          }),
        ]
      : []),
  );

  const topHeaderBar = el(
    'div',
    { className: 'qv-course-reading-topbar' },
    el(
      'div',
      { className: 'qv-course-reading-topbar-left' },
      el(
        'button',
        {
          className: 'bv-mini-btn qv-course-syllabus-toggle',
          attrs: { type: 'button' },
          on: {
            click: () => {
              mobileSyllabusOpen = !mobileSyllabusOpen;
              renderCoursePageView(container, actions);
            },
          },
        },
        icon('outline', 13),
        'Syllabus',
      ),
      el('span', {
        className: 'bv-mono-tag',
        text: `Lesson ${currentIdx + 1} of ${flatAll.length}`,
      }),
    ),
    el(
      'div',
      { className: 'qv-course-reading-topbar-right' },
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
          className: 'bv-btn',
          attrs: { type: 'button' },
          on: { click: () => actions.returnToWriting() },
        },
        icon('quill', 13),
        'Back to Book',
      ),
      createAppThemeButton(actions),
    ),
  );

  const mainPane = el(
    'div',
    { className: 'qv-course-article-wrap' },
    topHeaderBar,
    el(
      'article',
      { className: 'qv-course-article' },
      el(
        'div',
        { className: 'qv-course-meta-row' },
        el('span', { className: 'bv-mono-tag', text: `MODULE ${mod.number}: ${mod.title.toUpperCase()}` }),
        el(
          'div',
          { style: { display: 'inline-flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' } },
          modPlatform !== 'both'
            ? el('span', {
                className: 'bv-mono-tag',
                text: modPlatform === 'desktop' ? 'DESKTOP APP EXCLUSIVE' : 'WEBSITE EDITION',
              })
            : null,
          mod.lessons.every((l) => doneSet.has(l.id))
            ? el('span', { className: 'bv-mono-tag qv-course-mod-done-badge', text: 'COURSE COMPLETED' })
            : null,
          el('span', { className: 'bv-mono-tag', text: `${lesson.durationMin} MIN (${lesson.minTier.toUpperCase()} TIER)` }),
        ),
      ),
      el('h1', { className: 'qv-course-title', text: lesson.title }),
      el('p', { className: 'qv-course-lead', text: lesson.instruction }),
      el(
        'div',
        { className: 'qv-course-objective' },
        el('strong', { text: 'Goal: ' }),
        el('span', { text: lesson.objective }),
      ),
      el(
        'div',
        { className: 'qv-course-action-strip' },
        (() => {
          const liveBtn = el(
            'button',
            {
              className: 'bv-btn bv-btn-primary',
              attrs: { type: 'button' },
              on: {
                click: () => {
                  const modIdx = COURSE_MODULES.findIndex((m) => m.id === mod.id);
                  openInteractiveCourseDrawer(actions, Math.max(0, modIdx));
                  navigateToCourseLesson(actions, lesson, { originEl: liveBtn });
                },
              },
            },
            icon('course', 14),
            `Start Live Guided Tutorial: ${lesson.actionLabel}`,
          );
          return liveBtn;
        })(),
        el(
          'button',
          {
            className: `bv-btn${isDone ? ' is-done' : ''}`,
            attrs: { type: 'button' },
            on: {
              click: () => {
                toggleCourseLessonDone(lesson.id, !isDone);
                renderCoursePageView(container, actions);
              },
            },
          },
          icon('check', 14),
          isDone ? 'Completed' : 'Mark Complete',
        ),
      ),
      conceptsBox,
      stepsBox,
      exampleBox,
      checkpointBox,
      el(
        'nav',
        { className: 'qv-course-pager', attrs: { 'aria-label': 'Lesson navigation' } },
        prevRef
          ? el('button', {
              className: 'bv-btn',
              text: `<- Previous: ${prevRef.lesson.title}`,
              attrs: { type: 'button' },
              on: {
                click: () => {
                  selectedModuleId = prevRef.module.id;
                  selectedLessonId = prevRef.lesson.id;
                  expandedModuleIds.add(prevRef.module.id);
                  renderCoursePageView(container, actions);
                },
              },
            })
          : el('span'),
        nextRef
          ? el('button', {
              className: 'bv-btn bv-btn-primary',
              text: `Next: ${nextRef.lesson.title} ->`,
              attrs: { type: 'button' },
              on: {
                click: () => {
                  if (!isDone) {
                    toggleCourseLessonDone(lesson.id, true);
                  }
                  selectedModuleId = nextRef.module.id;
                  selectedLessonId = nextRef.lesson.id;
                  expandedModuleIds.add(nextRef.module.id);
                  renderCoursePageView(container, actions);
                },
              },
            })
          : el('button', {
              className: 'bv-btn bv-btn-primary',
              text: 'Finish & Return to Book',
              attrs: { type: 'button' },
              on: {
                click: () => {
                  toggleCourseLessonDone(lesson.id, true);
                  actions.returnToWriting();
                  actions.notify('Completed the full Quillvibe Book Writing Course.');
                },
              },
            }),
      ),
    ),
  );

  container.appendChild(
    el('div', { className: 'qv-course-page' }, sidebar, mainPane),
  );
}
