import type { EditorSubMode, TypesetSubTab } from './app-context';
import type { StudioViewId } from './types';

export interface RouteMatch {
  view: StudioViewId;
  typesetSubTab?: TypesetSubTab;
  editorSubMode?: EditorSubMode;
  showStartSplash: boolean;
  canonicalPath: string;
}

const VIEW_TO_PATH: Record<StudioViewId, string> = {
  landing: '/',
  editor: '/write',
  corkboard: '/corkboard',
  outline: '/outline',
  bible: '/bible',
  graph: '/graph',
  typeset: '/studio',
  course: '/course',
  help: '/help',
  developer: '/developer',
  settings: '/settings',
  manual: '/manual',
  extensions: '/extensions',
};

export function resolvePathToRoute(pathname: string, _isFirstWebVisit = false): RouteMatch {
  const clean = pathname.replace(/\/+$/, '').toLowerCase() || '/';

  if (clean === '/' || clean === '/index.html' || clean === '/landing') {
    return { view: 'landing', showStartSplash: false, canonicalPath: '/' };
  }
  if (clean === '/start') {
    return { view: 'editor', editorSubMode: 'draft', showStartSplash: true, canonicalPath: '/start' };
  }
  if (clean === '/course' || clean.startsWith('/course/')) {
    return { view: 'course', showStartSplash: false, canonicalPath: '/course' };
  }
  if (clean === '/help' || clean.startsWith('/help/') || clean === '/faq' || clean.startsWith('/faq/')) {
    return { view: 'help', showStartSplash: false, canonicalPath: clean.startsWith('/faq') ? '/faq' : '/help' };
  }
  if (clean === '/developer' || clean.startsWith('/developer/') || clean === '/developers' || clean.startsWith('/developers/')) {
    return { view: 'developer', showStartSplash: false, canonicalPath: '/developer' };
  }
  if (clean === '/settings' || clean.startsWith('/settings/')) {
    return { view: 'settings', showStartSplash: false, canonicalPath: '/settings' };
  }
  if (clean === '/manual' || clean.startsWith('/manual/')) {
    return { view: 'manual', showStartSplash: false, canonicalPath: '/manual' };
  }
  if (clean === '/extensions' || clean.startsWith('/extensions/')) {
    return { view: 'extensions', showStartSplash: false, canonicalPath: '/extensions' };
  }
  if (clean === '/write/proofread') {
    return { view: 'editor', editorSubMode: 'proofread', showStartSplash: false, canonicalPath: '/write/proofread' };
  }
  if (clean === '/write/split') {
    return { view: 'editor', editorSubMode: 'split', showStartSplash: false, canonicalPath: '/write/split' };
  }
  if (clean === '/write/diff') {
    return { view: 'editor', editorSubMode: 'diff', showStartSplash: false, canonicalPath: '/write/diff' };
  }
  if (clean === '/write' || clean === '/editor') {
    return { view: 'editor', editorSubMode: 'draft', showStartSplash: false, canonicalPath: '/write' };
  }
  if (clean === '/corkboard') {
    return { view: 'corkboard', showStartSplash: false, canonicalPath: '/corkboard' };
  }
  if (clean === '/outline') {
    return { view: 'outline', showStartSplash: false, canonicalPath: '/outline' };
  }
  if (clean === '/bible') {
    return { view: 'bible', showStartSplash: false, canonicalPath: '/bible' };
  }
  if (clean === '/graph') {
    return { view: 'graph', showStartSplash: false, canonicalPath: '/graph' };
  }
  if (clean === '/studio/cover') {
    return { view: 'typeset', typesetSubTab: 'cover', showStartSplash: false, canonicalPath: '/studio/cover' };
  }
  if (clean === '/studio/publish') {
    return { view: 'typeset', typesetSubTab: 'publish', showStartSplash: false, canonicalPath: '/studio/publish' };
  }
  if (clean === '/studio' || clean === '/typeset') {
    return { view: 'typeset', typesetSubTab: 'interior', showStartSplash: false, canonicalPath: '/studio' };
  }
  return { view: 'editor', editorSubMode: 'draft', showStartSplash: false, canonicalPath: '/write' };
}

export function routeForState(
  view: StudioViewId,
  typesetSubTab: TypesetSubTab = 'interior',
  editorSubMode: EditorSubMode = 'draft',
): string {
  if (view === 'editor') {
    if (editorSubMode === 'proofread') return '/write/proofread';
    if (editorSubMode === 'split') return '/write/split';
    if (editorSubMode === 'diff') return '/write/diff';
    return '/write';
  }
  if (view === 'typeset') {
    if (typesetSubTab === 'cover') return '/studio/cover';
    if (typesetSubTab === 'publish') return '/studio/publish';
    return '/studio';
  }
  return VIEW_TO_PATH[view] ?? '/write';
}

/**
 * Restores deep links forwarded from public/404.html (?qv_route=/start) on static hosts.
 */
export function readInitialBrowserRoute(isFirstWebVisit: boolean): RouteMatch {
  if (typeof window === 'undefined') {
    return { view: 'editor', showStartSplash: false, canonicalPath: '/write' };
  }
  const params = new URLSearchParams(window.location.search);
  const forwarded = params.get('qv_route');
  const rawPath = forwarded || window.location.pathname;
  const resolved = resolvePathToRoute(rawPath, isFirstWebVisit);

  if (
    forwarded ||
    window.location.pathname === '/' ||
    window.location.pathname === '/index.html'
  ) {
    try {
      const remainingParams = new URLSearchParams(window.location.search);
      remainingParams.delete('qv_route');
      const remainingSearch = remainingParams.toString();
      const targetUrl = remainingSearch
        ? `${resolved.canonicalPath}?${remainingSearch}`
        : resolved.canonicalPath;
      window.history.replaceState({}, '', targetUrl);
    } catch {
      // Ignore restricted history APIs (e.g. file://)
    }
  }
  return resolved;
}

export function syncBrowserPath(path: string, replace = false): void {
  if (typeof window === 'undefined' || window.location.protocol === 'file:' || window.location.protocol === 'tauri:') {
    return;
  }
  if (window.location.pathname === path) return;
  try {
    if (replace) {
      window.history.replaceState({}, '', path);
    } else {
      window.history.pushState({}, '', path);
    }
  } catch {
    // Ignore history API errors
  }
}
