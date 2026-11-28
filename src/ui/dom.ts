import type { AppThemeId } from '../core/types';
import { attachTooltip, type TooltipSpec } from './tooltip';

export type IconName =
  | 'book'
  | 'quill'
  | 'draft-sheet'
  | 'proofread'
  | 'split'
  | 'diff'
  | 'corkboard'
  | 'outline'
  | 'bible'
  | 'graph'
  | 'typeset'
  | 'page-margins'
  | 'cover'
  | 'seal'
  | 'library'
  | 'collab'
  | 'badge-id'
  | 'folder'
  | 'save'
  | 'extensions'
  | 'layers'
  | 'shield'
  | 'file-code'
  | 'settings'
  | 'help'
  | 'panel-left'
  | 'panel-right'
  | 'typewriter'
  | 'split-scene'
  | 'zen'
  | 'camera'
  | 'clock'
  | 'plus'
  | 'trash'
  | 'check'
  | 'chevron-right'
  | 'chevron-down'
  | 'printer'
  | 'download'
  | 'image'
  | 'key'
  | 'wifi'
  | 'bluetooth'
  | 'file'
  | 'cursor'
  | 'type-tool'
  | 'shapes'
  | 'ornament'
  | 'palette'
  | 'grid-snap'
  | 'magnet'
  | 'guides'
  | 'align-left'
  | 'align-center'
  | 'align-right'
  | 'align-justify'
  | 'list-bullet'
  | 'list-ordered'
  | 'quote'
  | 'section-divider'
  | 'clear-format'
  | 'bring-front'
  | 'send-back'
  | 'lock'
  | 'unlock'
  | 'eye'
  | 'eye-off'
  | 'flip-h'
  | 'flip-v'
  | 'undo'
  | 'redo'
  | 'zoom-in'
  | 'zoom-out'
  | 'copy-layer'
  | 'course'
  | 'sliders-tier'
  | 'theme-sun'
  | 'theme-moon'
  | 'window-new'
  | 'fullscreen'
  | 'fullscreen-exit'
  | 'alarm'
  | 'bell'
  | 'server'
  | 'search'
  | 'appearance'
  | 'font-family'
  | 'publish-book'
  | 'terminal'
  | 'sandbox'
  | 'archive-format'
  | 'volume'
  | 'battery'
  | 'calendar'
  | 'target'
  | 'music';

type ChildInput = Node | string | number | null | undefined | false;

export interface ElementOptions {
  className?: string;
  id?: string;
  text?: string;
  tooltip?: TooltipSpec;
  attrs?: Record<string, string | number | boolean | undefined>;
  dataset?: Record<string, string | undefined>;
  style?: Partial<CSSStyleDeclaration>;
  on?: Partial<{
    [K in keyof HTMLElementEventMap]: (ev: HTMLElementEventMap[K]) => void;
  }>;
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  options: ElementOptions = {},
  ...children: ChildInput[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (options.className) node.className = options.className;
  if (options.id) node.id = options.id;
  if (options.text !== undefined) node.textContent = options.text;

  if (options.attrs) {
    for (const [key, val] of Object.entries(options.attrs)) {
      if (val === undefined || val === false) continue;
      if (val === true) node.setAttribute(key, '');
      else node.setAttribute(key, String(val));
    }
  }

  if (options.dataset) {
    for (const [key, val] of Object.entries(options.dataset)) {
      if (val !== undefined) node.dataset[key] = val;
    }
  }

  if (options.style) {
    Object.assign(node.style, options.style);
  }

  if (options.on) {
    for (const [evName, handler] of Object.entries(options.on)) {
      if (handler) {
        node.addEventListener(evName, handler as EventListener);
      }
    }
  }

  if (options.tooltip) {
    attachTooltip(node, options.tooltip);
  }

  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    if (child instanceof Node) {
      node.appendChild(child);
    } else {
      node.appendChild(document.createTextNode(String(child)));
    }
  }

  return node;
}

export function svgEl<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
  ...children: SVGElement[]
): SVGElementTagNameMap[K] {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [key, val] of Object.entries(attrs)) {
    const attrName = key === 'className' ? 'class' : key;
    node.setAttribute(attrName, String(val));
  }
  for (const child of children) {
    node.appendChild(child);
  }
  return node;
}

export function clearNode(node: Element): void {
  node.replaceChildren();
}

/**
 * Snapshots scrollTop and scrollLeft for matching scrollable elements inside container
 * and returns a restore callback that restores them without smooth-scroll animation jumps.
 */
export function preserveScrollPositions(container: HTMLElement, selectors: string[]): () => void {
  const saved = selectors.map((selector) => {
    const node = container.matches(selector)
      ? container
      : container.querySelector<HTMLElement>(selector);
    return node ? { selector, top: node.scrollTop, left: node.scrollLeft } : null;
  });

  return () => {
    for (const item of saved) {
      if (!item || (item.top === 0 && item.left === 0)) continue;
      const target = container.matches(item.selector)
        ? container
        : container.querySelector<HTMLElement>(item.selector);
      if (!target) continue;
      const prevBehavior = target.style.scrollBehavior;
      target.style.scrollBehavior = 'auto';
      target.scrollTop = item.top;
      target.scrollLeft = item.left;
      target.style.scrollBehavior = prevBehavior;
    }
  };
}

/**
 * Transparent sculpted Quillvibe layered open-folio + page-wing emblem matching public/logo.svg.
 */
export function quillvibeLogo(size = 24): SVGSVGElement {
  const svg = svgEl('svg', {
    width: size,
    height: size,
    viewBox: '7 8 50 48',
    fill: 'none',
    'aria-hidden': 'true',
  });
  svg.append(
    svgEl('path', {
      d: 'M11 27C11 24.4 13.1 22.8 15.6 23.4L32 27.6L48.4 23.4C50.9 22.8 53 24.4 53 27V43.2C53 45.8 51.1 47.9 48.5 48.6L34.6 52.3C32.9 52.8 31.1 52.8 29.4 52.3L15.5 48.6C12.9 47.9 11 45.8 11 43.2V27Z',
      fill: '#7e6644',
    }),
    svgEl('path', {
      d: 'M33.2 31.4C33 21.6 38.1 13.8 47.6 12.2C48.4 21.8 43.2 28.8 33.2 31.4Z',
      fill: '#d9b478',
    }),
    svgEl('path', {
      d: 'M13.5 23.4C13.5 19.7 16.1 17.7 19.8 18.1C25.8 18.7 30.2 22.8 30.2 29.2V49.1C30.2 50.7 28.6 51.3 27.2 50.1C23.6 47 19.9 45.6 17.1 45.2C14.7 44.8 13.5 43.1 13.5 40.3V23.4Z',
      fill: '#f5f2eb',
      stroke: '#2b241d',
      'stroke-opacity': '0.24',
      'stroke-width': '0.9',
    }),
    svgEl('path', {
      d: 'M33.8 35.4C33.8 29.8 38.1 26.2 44.2 26H45.8C48.8 26 50.8 28 50.8 31V40.6C50.8 43.2 49.4 44.8 46.8 45.2C43.9 45.6 40.3 47 36.7 50.1C35.3 51.3 33.8 50.7 33.8 49.1V35.4Z',
      fill: '#dfd9cd',
      stroke: '#2b241d',
      'stroke-opacity': '0.24',
      'stroke-width': '0.9',
    }),
  );
  return svg;
}

const ICON_PATHS: Record<IconName, string[]> = {
  book: [
    'M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a2.5 2.5 0 0 1 0-5H20',
  ],
  quill: [
    'M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5z',
    'M16 8L2 22',
    'M17.5 15H9',
  ],
  'draft-sheet': [
    'M12 20h9',
    'M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z',
  ],
  proofread: [
    'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z',
    'M14 2v6h6',
    'M8 13h8',
    'M9 17.5l2 2 4-4',
  ],
  split: [
    'M12 3v18',
    'M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5z',
  ],
  diff: [
    'M4 5h6',
    'M7 2v6',
    'M14 5h6',
    'M4 13h7v6H4z',
    'M13 13h7v6h-7z',
  ],
  corkboard: [
    'M3 3h7v7H3z',
    'M14 3h7v7h-7z',
    'M14 14h7v7h-7z',
    'M3 14h7v7H3z',
  ],
  outline: [
    'M8 6h13',
    'M8 12h13',
    'M8 18h13',
    'M3 6h.01',
    'M3 12h.01',
    'M3 18h.01',
  ],
  bible: [
    'M2 5.5A2.5 2.5 0 0 1 4.5 3H12v17H4.5A2.5 2.5 0 0 1 2 17.5v-12z',
    'M22 5.5A2.5 2.5 0 0 0 19.5 3H12v17h7.5a2.5 2.5 0 0 0 2.5-2.5v-12z',
    'M15.5 3v6l1.75-1.4L19 9V3',
    'M5.5 8.5H9',
    'M5.5 12H9',
  ],
  graph: [
    'M8 6l8 6',
    'M16 12l-8 6',
  ],
  typeset: [
    'M4 7V4h16v3',
    'M9 20h6',
    'M12 4v16',
  ],
  'page-margins': [
    'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z',
    'M8 7h8v10H8z',
  ],
  cover: [
    'M4 4h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4V4z',
    'M8 4v16',
    'M11.5 9h5',
    'M11.5 13h3.5',
  ],
  seal: [
    'M12 15a6 6 0 1 0 0-12 6 6 0 0 0 0 12z',
    'M8.21 13.89L7 23l5-3 5 3-1.21-9.12',
  ],
  library: [
    'M4 19.5V4.5A1.5 1.5 0 0 1 5.5 3h2A1.5 1.5 0 0 1 9 4.5v15',
    'M9 19.5V6.5A1.5 1.5 0 0 1 10.5 5h2A1.5 1.5 0 0 1 14 6.5v13',
    'M14 19.5l4.2-13.6a1.4 1.4 0 0 1 1.7-.9l1.4.4a1.4 1.4 0 0 1 .9 1.7L18 20.5',
    'M3 20h18',
  ],
  collab: [],
  'badge-id': [
    'M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5z',
    'M7 9h10',
    'M7 13h6',
    'M7 17h4',
  ],
  folder: [
    'M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z',
  ],
  save: [
    'M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z',
    'M17 21v-8H7v8',
    'M7 3v5h8',
  ],
  extensions: [
    'M19 10h-2V7a2 2 0 0 0-2-2h-2.17a2.5 2.5 0 1 0-4.66 0H5a2 2 0 0 0-2 2v3h2.17a2.5 2.5 0 1 1 0 5H3v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3h2a2.5 2.5 0 0 0 0-5z',
  ],
  layers: [
    'M12 2L2 7l10 5 10-5-10-5z',
    'M2 12l10 5 10-5',
    'M2 17l10 5 10-5',
  ],
  shield: [
    'M12 3l7 3v6c0 4.5-3 7.8-7 9-4-1.2-7-4.5-7-9V6l7-3z',
    'M9.5 12.2l1.8 1.8 3.5-3.6',
  ],
  'file-code': [
    'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z',
    'M14 2v6h6',
    'M10 13l-2 2 2 2',
    'M14 13l2 2-2 2',
  ],
  settings: [
    'M4 6h16',
    'M4 12h16',
    'M4 18h16',
  ],
  help: [
    'M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3',
    'M12 17h.01',
  ],
  'panel-left': [
    'M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5z',
    'M9 3v18',
  ],
  'panel-right': [
    'M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5z',
    'M15 3v18',
  ],
  typewriter: [
    'M4 12h16',
    'M7 6h10',
    'M7 18h10',
    'M12 3v3',
    'M12 18v3',
  ],
  'split-scene': [
    'M3 12h18',
    'M6 6h12',
    'M6 18h12',
  ],
  zen: [
    'M15 3h6v6',
    'M9 21H3v-6',
    'M21 3l-7 7',
    'M3 21l7-7',
  ],
  camera: [
    'M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z',
  ],
  clock: ['M12 6v6l4 2'],
  plus: ['M12 5v14', 'M5 12h14'],
  trash: [
    'M3 6h18',
    'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2',
  ],
  check: ['M20 6L9 17l-5-5'],
  'chevron-right': ['M9 18l6-6-6-6'],
  'chevron-down': ['M6 9l6 6 6-6'],
  printer: [
    'M6 9V2h12v7',
    'M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2',
    'M6 14h12v8H6z',
  ],
  download: [
    'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4',
    'M7 10l5 5 5-5',
    'M12 15V3',
  ],
  image: [
    'M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5z',
    'M21 15l-5-5L5 21',
  ],
  key: [
    'M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4',
  ],
  wifi: [
    'M2.5 9.2a14 14 0 0 1 19 0',
    'M6 12.8a9 9 0 0 1 12 0',
    'M9.5 16.4a4.5 4.5 0 0 1 5 0',
    'M12 20h.01',
  ],
  bluetooth: ['M7 7l10 10-5 4V3l5 4L7 17'],
  file: [
    'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z',
    'M14 2v6h6',
  ],
  cursor: [
    'M5 3l14 9-6.2 1.8L10 20 5 3z',
  ],
  'type-tool': [
    'M5 5h14',
    'M12 5v14',
    'M8.5 19h7',
    'M5 5v2',
    'M19 5v2',
  ],
  shapes: [
    'M12 3l4.5 7.5h-9L12 3z',
    'M3.5 14h6.5v6.5H3.5z',
    'M17 17.25a3.25 3.25 0 1 0 0 .01',
  ],
  ornament: [
    'M12 3l2.2 6.2L20.5 12l-6.3 2.8L12 21l-2.2-6.2L3.5 12l6.3-2.8L12 3z',
  ],
  palette: [
    'M12 2.5a9.5 9.5 0 1 0 0 19h1.2a2.2 2.2 0 0 0 2.1-2.8c-.2-.8.4-1.7 1.3-1.7h1.4a3.5 3.5 0 0 0 3.5-3.5A9.5 9.5 0 0 0 12 2.5z',
  ],
  'grid-snap': [
    'M3 8h18',
    'M3 16h18',
    'M8 3v18',
    'M16 3v18',
  ],
  magnet: [
    'M6 3v7a6 6 0 0 0 12 0V3',
    'M6 7h3',
    'M15 7h3',
  ],
  guides: [
    'M4 4v16',
    'M20 4v16',
    'M4 12h16',
    'M9 8v8',
    'M15 8v8',
  ],
  'align-left': [
    'M4 5v14',
    'M8 8h11v3H8z',
    'M8 14h7v3H8z',
  ],
  'align-center': [
    'M12 4v16',
    'M6 8h12v3H6z',
    'M8 14h8v3H8z',
  ],
  'align-right': [
    'M20 5v14',
    'M5 8h11v3H5z',
    'M9 14h7v3H9z',
  ],
  'bring-front': [
    'M8 8h12v12H8z',
    'M4 4h10v4H8v6H4z',
  ],
  'send-back': [
    'M4 4h12v12H4z',
    'M10 16v4h10V10h-4',
  ],
  lock: [
    'M5 11h14v10H5z',
    'M8 11V7a4 4 0 0 1 8 0v4',
  ],
  unlock: [
    'M5 11h14v10H5z',
    'M8 11V7a4 4 0 0 1 7.6-1.7',
  ],
  eye: [
    'M2 12s3.8-6 10-6 10 6 10 6-3.8 6-10 6-10-6-10-6z',
    'M12 12a2.5 2.5 0 1 0 0 .01',
  ],
  'eye-off': [
    'M3 3l18 18',
    'M9.9 5.3A10.7 10.7 0 0 1 12 6c6.2 0 10 6 10 6a16.8 16.8 0 0 1-4.1 4.6',
    'M6.2 7.5A16.5 16.5 0 0 0 2 12s3.8 6 10 6c1.5 0 2.9-.3 4.1-.8',
  ],
  'flip-h': [
    'M12 3v18',
    'M4 7l5 5-5 5V7z',
    'M20 7l-5 5 5 5V7z',
  ],
  'flip-v': [
    'M3 12h18',
    'M7 4l5 5 5-5H7z',
    'M7 20l5-5 5 5H7z',
  ],
  undo: [
    'M9 14L4 9l5-5',
    'M4 9h10.5a5.5 5.5 0 0 1 0 11H11',
  ],
  redo: [
    'M15 14l5-5-5-5',
    'M20 9H9.5a5.5 5.5 0 0 0 0 11H13',
  ],
  'zoom-in': [
    'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z',
    'M21 21l-4.3-4.3',
    'M11 8v6',
    'M8 11h6',
  ],
  'zoom-out': [
    'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z',
    'M21 21l-4.3-4.3',
    'M8 11h6',
  ],
  'copy-layer': [
    'M9 9h11v11H9z',
    'M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1',
  ],
  course: [
    'M2 9l10-4 10 4-10 4-10-4z',
    'M6 11v5c0 2 2.7 3.5 6 3.5s6-1.5 6-3.5v-5',
    'M22 9v6',
  ],
  'sliders-tier': [
    'M4 20h16',
    'M6 14h4v6H6z',
    'M10 10h4v10h-4z',
    'M14 5h4v15h-4z',
  ],
  'theme-sun': [
    'M12 3v2',
    'M12 19v2',
    'M4.9 4.9l1.4 1.4',
    'M17.7 17.7l1.4 1.4',
    'M3 12h2',
    'M19 12h2',
    'M4.9 19.1l1.4-1.4',
    'M17.7 6.3l1.4-1.4',
  ],
  'theme-moon': [
    'M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5a8.5 8.5 0 1 0 10.7 10.7z',
  ],
  'window-new': [
    'M8 6h11a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z',
    'M16 4H5a2 2 0 0 0-2 2v9',
    'M13.5 10.5v4',
    'M11.5 12.5h4',
  ],
  fullscreen: [
    'M4 9V4h5',
    'M20 9V4h-5',
    'M4 15v5h5',
    'M20 15v5h-5',
  ],
  'fullscreen-exit': [
    'M9 4v5H4',
    'M15 4v5h5',
    'M9 20v-5H4',
    'M15 20v-5h5',
  ],
  alarm: [
    'M5 3L2 6',
    'M22 6l-3-3',
    'M12 9v4l2.5 1.5',
    'M6 19l-2 2',
    'M18 19l2 2',
  ],
  bell: [
    'M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9',
    'M13.73 21a2 2 0 0 1-3.46 0',
  ],
  server: [
    'M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5z',
    'M3 15a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4z',
    'M7 7h.01',
    'M7 17h.01',
    'M11 7h6',
    'M11 17h6',
  ],
  search: [
    'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z',
    'M21 21l-4.35-4.35',
  ],
  'align-justify': [
    'M3 6h18',
    'M3 10h18',
    'M3 14h18',
    'M3 18h18',
  ],
  'list-bullet': [
    'M9 6h12',
    'M9 12h12',
    'M9 18h12',
    'M4 6h.01',
    'M4 12h.01',
    'M4 18h.01',
  ],
  'list-ordered': [
    'M10 6h11',
    'M10 12h11',
    'M10 18h11',
    'M4 6h1v4',
    'M4 10h2',
    'M4 14h2l-2 3h2',
  ],
  quote: [
    'M10 11H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h4v6zm0 0v3a3 3 0 0 1-3 3',
    'M20 11h-4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h4v6zm0 0v3a3 3 0 0 1-3 3',
  ],
  'section-divider': [
    'M4 12h16',
    'M12 7.5a.8.8 0 1 0 0 1.6.8.8 0 0 0 0-1.6z',
    'M8.5 16.5l3.5-2.5 3.5 2.5',
  ],
  'clear-format': [
    'M4 7V5h12v2',
    'M10 5l-3 14',
    'M15 14l5 5',
    'M20 14l-5 5',
  ],
  appearance: [
    'M4 5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5z',
    'M8 21h8',
    'M12 17v4',
    'M9 9.5a3 3 0 1 0 6 0 3 3 0 1 0-6 0',
  ],
  'font-family': [
    'M5 19L10.5 5h3L19 19',
    'M7.2 14h9.6',
    'M4 19h3',
    'M17 19h3',
  ],
  'publish-book': [
    'M4 19.5A2.5 2.5 0 0 1 6.5 17H20',
    'M6.5 3H20v18H6.5A2.5 2.5 0 0 1 4 18.5v-13A2.5 2.5 0 0 1 6.5 3z',
    'M9 8h7',
    'M9 12h5',
  ],
  terminal: [
    'M4 5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5z',
    'M8 9l3 3-3 3',
    'M13 15h4',
  ],
  sandbox: [
    'M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z',
    'M12 12l8-4.5',
    'M12 12v9',
    'M12 12L4 7.5',
  ],
  'archive-format': [
    'M3 6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v3H3V6z',
    'M5 9h14v10a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V9z',
    'M10 14h4',
  ],
  volume: [
    'M11 5L6 9H3v6h3l5 4V5z',
    'M15.5 8.5a5 5 0 0 1 0 7',
    'M18.5 6a8.5 8.5 0 0 1 0 12',
  ],
  battery: [
    'M3 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8z',
    'M21 10.5v3',
    'M7 10v4',
    'M11 10v4',
  ],
  calendar: [
    'M4 5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5z',
    'M8 2v3',
    'M16 2v3',
    'M4 9h16',
  ],
  target: [
    'M12 12m-8 0a8 8 0 1 0 16 0a8 8 0 1 0 -16 0',
    'M12 12m-4 0a4 4 0 1 0 8 0a4 4 0 1 0 -8 0',
    'M12 12h.01',
  ],
  music: [
    'M9 18V6l10-2v12',
    'M7 18a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
    'M17 16a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  ],
};

export function icon(name: IconName, size = 15): SVGSVGElement {
  const svg = svgEl('svg', {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': '1.75',
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'aria-hidden': 'true',
  });

  if (name === 'collab') {
    svg.append(
      svgEl('path', { d: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2' }),
      svgEl('circle', { cx: 9, cy: 7, r: 4 }),
      svgEl('path', { d: 'M22 21v-2a4 4 0 0 0-3-3.87' }),
      svgEl('path', { d: 'M16 3.13a4 4 0 0 1 0 7.75' }),
    );
    return svg;
  }

  if (name === 'graph') {
    svg.append(
      svgEl('circle', { cx: 6, cy: 6, r: 2.5 }),
      svgEl('circle', { cx: 18, cy: 12, r: 2.5 }),
      svgEl('circle', { cx: 6, cy: 18, r: 2.5 }),
      svgEl('path', { d: 'M8.2 7.1l7.4 3.8' }),
      svgEl('path', { d: 'M15.6 13.1l-7.4 3.8' }),
    );
    return svg;
  }

  if (name === 'settings') {
    svg.append(
      svgEl('path', { d: 'M4 6h16' }),
      svgEl('path', { d: 'M4 12h16' }),
      svgEl('path', { d: 'M4 18h16' }),
      svgEl('circle', { cx: 8, cy: 6, r: 2, fill: 'var(--bg-surface, #ffffff)' }),
      svgEl('circle', { cx: 16, cy: 12, r: 2, fill: 'var(--bg-surface, #ffffff)' }),
      svgEl('circle', { cx: 10, cy: 18, r: 2, fill: 'var(--bg-surface, #ffffff)' }),
    );
    return svg;
  }

  if (name === 'theme-sun') {
    svg.appendChild(svgEl('circle', { cx: 12, cy: 12, r: 4 }));
    for (const d of ICON_PATHS[name]) {
      svg.appendChild(svgEl('path', { d }));
    }
    return svg;
  }

  if (name === 'clock' || name === 'help' || name === 'alarm') {
    svg.append(svgEl('circle', { cx: 12, cy: name === 'alarm' ? 13 : 12, r: name === 'alarm' ? 8 : 9 }));
    for (const d of ICON_PATHS[name]) {
      svg.appendChild(svgEl('path', { d }));
    }
    return svg;
  }

  if (name === 'camera') {
    svg.append(
      svgEl('path', {
        d: 'M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z',
      }),
      svgEl('circle', { cx: 12, cy: 13, r: 4 }),
    );
    return svg;
  }

  if (name === 'image') {
    svg.append(
      svgEl('rect', { x: 3, y: 3, width: 18, height: 18, rx: 2 }),
      svgEl('circle', { cx: 8.5, cy: 8.5, r: 1.5 }),
      svgEl('path', { d: 'M21 15l-5-5L5 21' }),
    );
    return svg;
  }

  for (const d of ICON_PATHS[name]) {
    svg.appendChild(svgEl('path', { d }));
  }
  return svg;
}

let morphThemeMaskSeq = 0;

/**
 * Animated morphing theme icon supporting system (Match Device), ivory, parchment, and obsidian.
 */
export function createMorphThemeIcon(
  mode: AppThemeId,
  size = 16,
): SVGSVGElement {
  morphThemeMaskSeq += 1;
  const maskId = `qv-tm-mask-${morphThemeMaskSeq}`;

  const svg = svgEl('svg', {
    className: 'qv-theme-morph',
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': 1.8,
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'data-theme-mode': mode,
    'aria-hidden': 'true',
  });

  const defs = svgEl('defs');
  const mask = svgEl('mask', { id: maskId });
  mask.append(
    svgEl('rect', { x: 0, y: 0, width: 24, height: 24, fill: '#ffffff', stroke: 'none' }),
    svgEl('circle', {
      className: 'qv-tm-cutout',
      cx: 16.8,
      cy: 7.4,
      r: 5.8,
      fill: '#000000',
      stroke: 'none',
    }),
  );
  defs.appendChild(mask);

  const coreGroup = svgEl('g', { className: 'qv-tm-core-group' });
  coreGroup.appendChild(
    svgEl('circle', {
      className: 'qv-tm-core',
      cx: 12,
      cy: 12,
      r: 6.2,
      fill: 'currentColor',
      stroke: 'none',
      mask: `url(#${maskId})`,
    }),
  );

  // Crisp contrast ring + half-disc arc shown in Match Device (system) mode
  const autoRing = svgEl('circle', {
    className: 'qv-tm-auto-ring',
    cx: 12,
    cy: 12,
    r: 8.6,
    fill: 'none',
  });
  const autoHalf = svgEl('path', {
    className: 'qv-tm-auto-half',
    d: 'M12 3.6A8.4 8.4 0 0 1 12 20.4Z',
    fill: 'currentColor',
    stroke: 'none',
  });

  // Radial sun rays (split into top/sides and bottom so parchment glides into a warm horizon sunrise)
  const topRays = svgEl(
    'g',
    { className: 'qv-tm-rays-top' },
    svgEl('line', { x1: 12, y1: 2, x2: 12, y2: 4.3 }),
    svgEl('line', { x1: 4.9, y1: 4.9, x2: 6.5, y2: 6.5 }),
    svgEl('line', { x1: 19.1, y1: 4.9, x2: 17.5, y2: 6.5 }),
    svgEl('line', { x1: 2, y1: 12, x2: 4.3, y2: 12 }),
    svgEl('line', { x1: 19.7, y1: 12, x2: 22, y2: 12 }),
  );
  const bottomRays = svgEl(
    'g',
    { className: 'qv-tm-rays-bottom' },
    svgEl('line', { x1: 4.9, y1: 19.1, x2: 6.5, y2: 17.5 }),
    svgEl('line', { x1: 12, y1: 19.7, x2: 12, y2: 22 }),
    svgEl('line', { x1: 19.1, y1: 19.1, x2: 17.5, y2: 17.5 }),
  );

  const horizon = svgEl('line', {
    className: 'qv-tm-horizon',
    x1: 3.5,
    y1: 17.8,
    x2: 20.5,
    y2: 17.8,
  });

  svg.append(defs, autoRing, autoHalf, coreGroup, topRays, bottomRays, horizon);
  return svg;
}
