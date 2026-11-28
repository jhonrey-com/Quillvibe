import type { AppActions } from '../core/app-context';
import {
  exportCoverDataUrlDownload,
  exportGenericFile,
  isTauriRuntime,
} from '../core/bridge';
import { getActiveSessionPermissions } from '../core/collab';
import {
  renderCoverToJpegDataUrl,
  renderCoverToPngDataUrl,
  renderCoverToVectorSvg,
  BUILT_IN_COVER_ORNAMENTS,
  COVER_TEMPLATES,
  computeCoverBackgroundCss,
  computeSmartAlignSnap,
  createCoverVariantSnapshot,
  createGraphicLayerFromDataUrl,
  createPathLayer,
  createShapeLayer,
  createTextLayer,
  defaultBookCover,
  downscaleImageFileToDataUrl,
  encodeSvgStringToDataUrl,
  estimateSpineInches,
  loadImageUrlAsDataUrl,
} from '../core/cover';
import {
  COVER_ZOOM_PRESETS,
  classifyCanvasWheelGesture,
  computeCursorAnchoredZoom,
  computeFitZoom,
} from '../core/cover-navigation';
import {
  exportCoverDesignArchive,
  importCoverDesignArchive,
} from '../core/extensions';
import {
  alignBoxes,
  computeStudioSmartSnap,
  CoordinateSystem,
  type AlignMode,
  type SnapGuideLine,
  type SpacingBadgeIndicator,
  type WorldBox,
} from '../core/cover-studio-math';
import { TRIM_SPECS } from '../core/export';
import { getAllAvailableFontChoices, resolveEffectiveFontCss } from '../core/fonts';
import { ensureAuthorIdentity } from '../core/identity';
import { normalizeProjectDefaults } from '../core/library';
import { newId } from '../core/manuscript';
import type {
  BookCoverConfig,
  CoverBlendMode,
  CoverFaceId,
  CoverGraphicLayer,
  CoverPathPoint,
  CoverShapeKind,
  CoverShapeLayer,
  CoverTemplateId,
  CoverTextLayer,
  ToolbarDisplayMode,
} from '../core/types';
import { attachContextMenu } from '../ui/context-menu';
import { clearNode, el, icon, svgEl, type IconName } from '../ui/dom';
import { createVerticalResizer } from '../ui/resizer';

type CoverPreviewMode = 'front' | 'back' | 'spine' | 'full-wrap' | 'dust-jacket';
type CoverElementKey = keyof BookCoverConfig['elements'];
type FaceEditableFieldKey =
  | 'back-headline'
  | 'back-blurb'
  | 'author-bio'
  | 'spine-title'
  | 'front-flap'
  | 'back-flap'
  | '';
type StudioToolTab =
  | 'templates'
  | 'text'
  | 'shapes'
  | 'ornaments'
  | 'uploads'
  | 'background'
  | 'jacket'
  | 'draw'
  | 'variants'
  | 'collab';
type InspectorTab = 'properties' | 'layers';

const COVER_BLEND_MODES: Array<{ id: CoverBlendMode; label: string }> = [
  { id: 'normal', label: 'Normal' },
  { id: 'multiply', label: 'Multiply' },
  { id: 'screen', label: 'Screen' },
  { id: 'overlay', label: 'Overlay' },
  { id: 'soft-light', label: 'Soft Light' },
  { id: 'darken', label: 'Darken' },
  { id: 'lighten', label: 'Lighten' },
];

let coverWrapMode: CoverPreviewMode = 'front';
let activeEditFace: CoverFaceId = 'front';
let activeToolTab: StudioToolTab = 'templates';
let activeInspectorTab: InspectorTab = 'properties';
let activeSelectionKind: 'none' | 'element' | 'text' | 'shape' | 'graphic' | 'path' = 'none';
let activeElementKey: CoverElementKey = 'title';
let activeFaceElementKey: FaceEditableFieldKey = '';
let activeLayerId = '';
let drawBrushMode: 'off' | 'freehand' | 'pen' = 'off';
let drawStrokeColor = '#c7a97b';
let drawStrokeWidth = 3;
let drawFillColor = 'transparent';
let drawClosedPath = false;
let drawBlendMode: CoverBlendMode = 'normal';
let pendingPenPoints: CoverPathPoint[] = [];
let commentPinMode = false;
let compareLeftVariantId = '';
let compareRightVariantId = '';
const selectedLayerKeys = new Set<string>();
let studioZoom = 1.0;
let studioPanX = 0;
let studioPanY = 0;
let studioClipboard: Array<
  | { kind: 'text'; layer: CoverTextLayer }
  | { kind: 'shape'; layer: CoverShapeLayer }
  | { kind: 'graphic'; layer: CoverGraphicLayer }
> = [];
let sliderUndoBaseline: BookCoverConfig | null = null;
let activeCoverKeyHandler: ((e: KeyboardEvent) => void) | null = null;
let activeCoverWheelHandler: ((e: WheelEvent) => void) | null = null;

let savedStudioLeftScroll = 0;
let savedStudioRightScroll = 0;
let savedStudioStageScrollTop = 0;

const undoStack: BookCoverConfig[] = [];
const redoStack: BookCoverConfig[] = [];
const MAX_UNDO = 100;

function layerKeyOf(kind: 'element' | 'text' | 'shape' | 'graphic' | 'path', idOrKey: string): string {
  return `${kind}:${idOrKey}`;
}

function setSingleSelection(
  cover: BookCoverConfig,
  kind: 'element' | 'text' | 'shape' | 'graphic' | 'path',
  idOrKey: string,
  additive = false,
): void {
  if (!additive) selectedLayerKeys.clear();
  activeFaceElementKey = '';
  if (kind === 'element') {
    activeEditFace = 'front';
    activeSelectionKind = 'element';
    activeElementKey = idOrKey as CoverElementKey;
    activeLayerId = '';
    selectedLayerKeys.add(layerKeyOf('element', idOrKey));
    return;
  }
  activeSelectionKind = kind;
  activeLayerId = idOrKey;
  selectedLayerKeys.add(layerKeyOf(kind, idOrKey));
  const faceOwner =
    (cover.shapeLayers ?? []).find((s) => s.id === idOrKey)?.face ??
    (cover.graphicLayers ?? []).find((g) => g.id === idOrKey)?.face ??
    (cover.textLayers ?? []).find((t) => t.id === idOrKey)?.face ??
    (cover.pathLayers ?? []).find((p) => p.id === idOrKey)?.face;
  if (faceOwner) activeEditFace = faceOwner;
  // Expand selection automatically across layers sharing a groupId
  const allLayers = [
    ...(cover.shapeLayers ?? []).map((s) => ({ kind: 'shape' as const, id: s.id, groupId: s.groupId })),
    ...(cover.graphicLayers ?? []).map((g) => ({ kind: 'graphic' as const, id: g.id, groupId: g.groupId })),
    ...(cover.textLayers ?? []).map((t) => ({ kind: 'text' as const, id: t.id, groupId: t.groupId })),
  ];
  const clicked = allLayers.find((l) => l.kind === kind && l.id === idOrKey);
  if (clicked?.groupId) {
    for (const sibling of allLayers) {
      if (sibling.groupId === clicked.groupId) {
        selectedLayerKeys.add(layerKeyOf(sibling.kind, sibling.id));
      }
    }
  }
}

function clearCoverSelection(): void {
  activeSelectionKind = 'none';
  activeLayerId = '';
  activeFaceElementKey = '';
  selectedLayerKeys.clear();
}

function recordSliderBaseline(cover: BookCoverConfig): void {
  if (!sliderUndoBaseline) {
    sliderUndoBaseline = structuredClone(cover);
  }
}

function commitSliderBaseline(): void {
  if (!sliderUndoBaseline) return;
  undoStack.push(sliderUndoBaseline);
  if (undoStack.length > MAX_UNDO) undoStack.shift();
  redoStack.length = 0;
  sliderUndoBaseline = null;
}

function activeTargetFace(): CoverFaceId {
  if (coverWrapMode === 'front') return 'front';
  if (coverWrapMode === 'back') return 'back';
  if (coverWrapMode === 'spine') return 'spine';
  if (coverWrapMode === 'full-wrap') {
    return activeEditFace === 'back' || activeEditFace === 'spine' ? activeEditFace : 'front';
  }
  return activeEditFace;
}

function recordCoverUndoSnapshot(cover: BookCoverConfig): void {
  undoStack.push(structuredClone(cover));
  if (undoStack.length > MAX_UNDO) undoStack.shift();
  redoStack.length = 0;
}

function captureStudioScroll(root?: HTMLElement): void {
  const scope = root ?? document;
  const left = scope.querySelector('.qv-studio-left-body') as HTMLElement | null;
  const right = scope.querySelector('.qv-studio-right-body') as HTMLElement | null;
  const stage = scope.querySelector('.qv-studio-canvas-scroll') as HTMLElement | null;
  if (left) savedStudioLeftScroll = left.scrollTop;
  if (right) savedStudioRightScroll = right.scrollTop;
  if (stage) savedStudioStageScrollTop = stage.scrollTop;
}

function mutateCover(
  actions: AppActions,
  updater: (cover: BookCoverConfig) => BookCoverConfig,
  rerender = true,
  pushUndo = true,
): void {
  captureStudioScroll();
  actions.mutateProject((prev) => {
    const next = normalizeProjectDefaults(prev);
    const currentCover = next.cover ?? defaultBookCover(next);
    if (pushUndo) {
      recordCoverUndoSnapshot(currentCover);
    }
    next.cover = updater(currentCover);
    return next;
  }, rerender);
}

export function hasCoverHistory(): { undo: boolean; redo: boolean } {
  return { undo: undoStack.length > 0, redo: redoStack.length > 0 };
}

export function performCoverUndo(actions: AppActions): boolean {
  if (undoStack.length === 0) {
    actions.notify('Nothing to undo in Cover Studio.');
    return false;
  }
  const previous = undoStack.pop()!;
  const current = actions.getState().project.cover;
  if (current) {
    redoStack.push(structuredClone(current));
  }
  captureStudioScroll();
  actions.mutateProject((prev) => {
    const next = normalizeProjectDefaults(prev);
    next.cover = structuredClone(previous);
    return next;
  }, true);
  actions.notify('Undid cover edit');
  return true;
}

export function performCoverRedo(actions: AppActions): boolean {
  if (redoStack.length === 0) {
    actions.notify('Nothing to redo in Cover Studio.');
    return false;
  }
  const restored = redoStack.pop()!;
  const current = actions.getState().project.cover;
  if (current) {
    undoStack.push(structuredClone(current));
  }
  captureStudioScroll();
  actions.mutateProject((prev) => {
    const next = normalizeProjectDefaults(prev);
    next.cover = structuredClone(restored);
    return next;
  }, true);
  actions.notify('Redid cover edit');
  return true;
}

function applyDragToStyle(node: HTMLElement, xPct: number, yPct: number, rotDeg = 0, flipX = false, flipY = false): void {
  node.style.left = `${xPct}%`;
  node.style.top = `${yPct}%`;
  const sx = flipX ? -1 : 1;
  const sy = flipY ? -1 : 1;
  node.style.transform = `translate(-50%, -50%) rotate(${rotDeg}deg) scale(${sx}, ${sy})`;
}

export function renderCoverStudio(container: HTMLElement, rawActions: AppActions): void {
  captureStudioScroll(container);
  clearNode(container);

  const coverPerms = getActiveSessionPermissions(rawActions.getState().project);
  const actions: AppActions = coverPerms.canEditCoverAndTypeset
    ? rawActions
    : {
        ...rawActions,
        mutateProject: () => {
          rawActions.notify('Cover Studio editing is disabled for your collaborator role.');
        },
      };

  const state = actions.getState();
  const project = normalizeProjectDefaults(state.project);
  const cover = project.cover ?? defaultBookCover(project);
  const identity = ensureAuthorIdentity(project);
  const penName = identity.penName || project.author;
  const trim = TRIM_SPECS[project.typography.trimSize];

  const graphicLayers = cover.graphicLayers ?? [];
  const shapeLayers = cover.shapeLayers ?? [];
  const textLayers = cover.textLayers ?? [];
  const pathLayers = cover.pathLayers ?? [];
  const variants = cover.variants ?? [];
  const comments = cover.comments ?? [];
  const isDesktopProCover = isTauriRuntime();

  if (!isDesktopProCover && (activeToolTab === 'draw' || activeToolTab === 'variants' || activeToolTab === 'collab')) {
    activeToolTab = 'templates';
    drawBrushMode = 'off';
    commentPinMode = false;
  }

  const frontW = Math.round(trim.widthIn * 64);
  const frontH = Math.round(trim.heightIn * 64);
  const spineInches = estimateSpineInches(project);
  const snapGridEnabled = cover.snapToGrid !== false;
  const showGridOverlay = Boolean(cover.showGrid);
  const showBleedGuides = cover.showGuides !== false;
  const gridStepPct = Math.max(2, Math.min(10, cover.gridSizePx ?? 4));
  const detailMode: ToolbarDisplayMode = state.settings.toolbarDisplayMode;

  const selectedTextLayer = activeSelectionKind === 'text'
    ? textLayers.find((t) => t.id === activeLayerId) ?? null
    : null;
  const selectedShapeLayer = activeSelectionKind === 'shape'
    ? shapeLayers.find((s) => s.id === activeLayerId) ?? null
    : null;
  const selectedGraphicLayer = activeSelectionKind === 'graphic'
    ? graphicLayers.find((g) => g.id === activeLayerId) ?? null
    : null;
  const selectedPathLayer = activeSelectionKind === 'path'
    ? pathLayers.find((p) => p.id === activeLayerId) ?? null
    : null;

  // Fallback safely if activeLayerId was deleted
  if (
    (activeSelectionKind === 'text' && !selectedTextLayer) ||
    (activeSelectionKind === 'shape' && !selectedShapeLayer) ||
    (activeSelectionKind === 'graphic' && !selectedGraphicLayer) ||
    (activeSelectionKind === 'path' && !selectedPathLayer)
  ) {
    clearCoverSelection();
  }

  // Hidden file pickers
  const artFileInput = el('input', {
    attrs: { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/svg+xml,.svg' },
    style: { display: 'none' },
    on: {
      change: async () => {
        const file = artFileInput.files?.[0];
        artFileInput.value = '';
        if (!file) return;
        try {
          const url = await downscaleImageFileToDataUrl(file, 1400);
          mutateCover(actions, (c) => ({ ...c, backgroundImageDataUrl: url }));
          actions.notify('Updated front cover background image');
        } catch (err) {
          actions.notify(err instanceof Error ? err.message : 'Cover upload failed.');
        }
      },
    },
  });

  const layerFileInput = el('input', {
    attrs: { type: 'file', accept: '.svg,image/svg+xml,image/png,image/webp,image/jpeg' },
    style: { display: 'none' },
    on: {
      change: async () => {
        const file = layerFileInput.files?.[0];
        layerFileInput.value = '';
        if (!file) return;
        await addDroppedGraphicToFace(activeTargetFace(), file);
      },
    },
  });

  const addDroppedGraphicToFace = async (face: CoverFaceId, file: File) => {
    try {
      const isSvg = file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg');
      const url = await downscaleImageFileToDataUrl(file, 1000);
      const layer = createGraphicLayerFromDataUrl(face, file.name, url, isSvg ? 'svg' : 'image');
      activeSelectionKind = 'graphic';
      activeLayerId = layer.id;
      mutateCover(actions, (c) => ({
        ...c,
        graphicLayers: [...(c.graphicLayers ?? []), layer],
      }));
      actions.notify(`Placed "${layer.name}" on ${face} cover`);
    } catch (err) {
      actions.notify(err instanceof Error ? err.message : 'Unsupported image or SVG file.');
    }
  };

  // --- Studio Top Command Bar (Face, Undo/Redo, Grid/Snap/Guides, Zoom, Detail Mode, Export) ---
  const wrapModeSel = el(
    'select',
    {
      className: 'bv-select',
      attrs: { 'aria-label': 'Cover face view' },
      on: {
        change: () => {
          coverWrapMode = wrapModeSel.value as CoverPreviewMode;
          if (coverWrapMode === 'front' || coverWrapMode === 'back' || coverWrapMode === 'spine') {
            activeEditFace = coverWrapMode;
          }
          renderCoverStudio(container, actions);
        },
      },
    },
    el('option', { text: 'Front Cover', attrs: { value: 'front', selected: coverWrapMode === 'front' } }),
    el('option', { text: 'Back Cover', attrs: { value: 'back', selected: coverWrapMode === 'back' } }),
    el('option', { text: `Spine (${spineInches}")`, attrs: { value: 'spine', selected: coverWrapMode === 'spine' } }),
    el('option', { text: 'Full Print Wrap', attrs: { value: 'full-wrap', selected: coverWrapMode === 'full-wrap' } }),
    el('option', { text: 'Dust Jacket (+ Flaps)', attrs: { value: 'dust-jacket', selected: coverWrapMode === 'dust-jacket' } }),
  );

  const detailModeSel = el(
    'select',
    {
      className: 'bv-select',
      attrs: { 'aria-label': 'Studio tool detail level' },
      on: {
        change: () => {
          actions.updateSettings({ toolbarDisplayMode: detailModeSel.value as ToolbarDisplayMode });
        },
      },
    },
    el('option', { text: 'Icons Only', attrs: { value: 'icons', selected: detailMode === 'icons' } }),
    el('option', { text: 'Balanced Labels', attrs: { value: 'balanced', selected: detailMode === 'balanced' } }),
    el('option', { text: 'Full Details', attrs: { value: 'detailed', selected: detailMode === 'detailed' } }),
  );

  const makeToolToggleBtn = (
    ic: IconName,
    label: string,
    active: boolean,
    titleTip: string,
    onClick: () => void,
    disabled = false,
  ) =>
    el(
      'button',
      {
        className: `bv-fmt-btn qv-studio-toolbtn${active ? ' is-active' : ''}`,
        attrs: { type: 'button', 'aria-label': label, disabled: disabled ? true : undefined },
        tooltip: { title: label, short: titleTip },
        on: { click: onClick },
      },
      icon(ic, 14),
      detailMode !== 'icons' ? el('span', { className: 'qv-tool-label', text: label }) : null,
    );

  const openExportPopover = (anchor: HTMLElement) => {
    const existing = document.getElementById('qv-cover-export-popover');
    if (existing) {
      existing.remove();
      return;
    }
    const closePop = () => {
      pop.remove();
      document.removeEventListener('pointerdown', onOutside, true);
      document.removeEventListener('keydown', onEsc);
    };
    const onOutside = (ev: PointerEvent) => {
      const t = ev.target as Node | null;
      if (t && !pop.contains(t) && !anchor.contains(t)) closePop();
    };
    const onEsc = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') closePop();
    };
    const addItem = (label: string, onClick: () => void | Promise<void>) =>
      el('button', {
        className: 'qv-tab-picker-item',
        attrs: { type: 'button' },
        on: {
          click: () => {
            closePop();
            void onClick();
          },
        },
      }, el('span', { className: 'qv-tab-picker-title', text: label }));

    const pop = el(
      'div',
      { className: 'qv-export-popover', id: 'qv-cover-export-popover' },
      addItem('PNG 1x (600 x 960)', async () => {
        const url = await renderCoverToPngDataUrl(project, 600, 960, false);
        if (url) await exportCoverDataUrlDownload(url, project.title, 'png', 'front');
        actions.notify('Exported 1x PNG cover');
      }),
      addItem('PNG 2x Print (1200 x 1920)', () => actions.exportCoverPng()),
      addItem('PNG 3x Ultra (1800 x 2880)', async () => {
        const url = await renderCoverToPngDataUrl(project, 1800, 2880, false);
        if (url) await exportCoverDataUrlDownload(url, project.title, 'png', 'front');
        actions.notify('Exported 3x Ultra PNG cover');
      }),
      addItem('Transparent PNG (No Background)', async () => {
        const url = await renderCoverToPngDataUrl(project, 1200, 1920, true);
        if (url) await exportCoverDataUrlDownload(url, project.title, 'png', 'front');
        actions.notify('Exported transparent layer PNG');
      }),
      addItem('JPEG (92% Quality)', async () => {
        const url = await renderCoverToJpegDataUrl(project, 1200, 1920, 0.92);
        if (url) await exportCoverDataUrlDownload(url, project.title, 'jpeg', 'front');
        actions.notify('Exported JPEG cover');
      }),
      addItem('Vector SVG (.svg)', async () => {
        const svg = renderCoverToVectorSvg(project, 1200, 1920);
        await exportCoverDataUrlDownload(svg, project.title, 'svg', 'front');
        actions.notify('Exported Vector SVG cover');
      }),
      el('div', { className: 'qv-tab-picker-sep' }),
      ...(isDesktopProCover
        ? [
            addItem('Editable Cover Design (.qvdesign)', () =>
              actions.exportAsExtension('.qvdesign', { skipPartialConfirm: true }),
            ),
          ]
        : []),
      addItem('Full Print Wrap PNG (Back + Spine + Front)', () => actions.exportFullWrapPng()),
      addItem('Print Interior PDF', () => actions.exportPdf()),
    );
    document.body.appendChild(pop);
    const rect = anchor.getBoundingClientRect();
    const popW = pop.offsetWidth || 288;
    const popLeft = Math.max(8, Math.min(rect.right - popW, window.innerWidth - popW - 8));
    pop.style.left = `${Math.round(popLeft)}px`;
    pop.style.top = `${Math.round(rect.bottom + 4)}px`;
    window.setTimeout(() => {
      document.addEventListener('pointerdown', onOutside, true);
      document.addEventListener('keydown', onEsc);
    }, 0);
  };

  let zoomNavController: {
    applyZoom: (nextZoom: number, anchorX?: number, anchorY?: number) => void;
    fitArtboard: () => void;
    fitArtwork: () => void;
    resetView: () => void;
  } | null = null;

  let exportMenuBtn!: HTMLButtonElement;
  const studioBar = el(
    'div',
    { className: 'qv-studio-topbar' },
    el(
      'div',
      { className: 'bv-subbar-group' },
      wrapModeSel,
      makeToolToggleBtn('undo', 'Undo', false, 'Undo last cover edit (Ctrl+Z)', () => performCoverUndo(actions), undoStack.length === 0),
      makeToolToggleBtn('redo', 'Redo', false, 'Redo undone cover edit (Ctrl+Y)', () => performCoverRedo(actions), redoStack.length === 0),
      makeToolToggleBtn(
        'grid-snap',
        'Grid',
        showGridOverlay,
        'Toggle visual alignment grid overlay',
        () => mutateCover(actions, (c) => ({ ...c, showGrid: !showGridOverlay }), true, false),
      ),
      makeToolToggleBtn(
        'magnet',
        'Snap',
        snapGridEnabled,
        'Snap layers to magnetic alignment guides (hold Ctrl while dragging to bypass)',
        () => mutateCover(actions, (c) => ({ ...c, snapToGrid: !snapGridEnabled }), true, false),
      ),
      makeToolToggleBtn(
        'guides',
        'Bleed',
        showBleedGuides,
        'Show print trim and 0.125" safe-zone guides',
        () => mutateCover(actions, (c) => ({ ...c, showGuides: !showBleedGuides }), true, false),
      ),
    ),
    el(
      'div',
      { className: 'bv-subbar-group' },
      makeToolToggleBtn('zoom-out', 'Zoom Out', false, 'Zoom canvas out (min 10%)', () => {
        const step = studioZoom <= 0.5 ? 0.05 : 0.15;
        const target = Math.max(0.1, Number((studioZoom - step).toFixed(2)));
        if (zoomNavController) {
          zoomNavController.applyZoom(target);
        } else {
          studioZoom = target;
          renderCoverStudio(container, actions);
        }
      }),
      el('button', {
        className: 'bv-mini-btn',
        dataset: { coverZoomReadout: '1' },
        text: `${Math.round(studioZoom * 100)}%`,
        tooltip: { title: 'Reset Zoom (Ctrl/Cmd + 0)', short: 'Click to reset zoom to 100% and center canvas.' },
        attrs: { type: 'button' },
        on: {
          click: () => {
            if (zoomNavController) {
              zoomNavController.resetView();
            } else {
              studioZoom = 1;
              studioPanX = 0;
              studioPanY = 0;
              renderCoverStudio(container, actions);
            }
          },
        },
      }),
      el(
        'select',
        {
          className: 'bv-select qv-cover-zoom-select',
          dataset: { coverZoomSelect: '1' },
          attrs: { 'aria-label': 'Zoom level preset' },
          style: { minWidth: '82px' },
          on: {
            change: (ev) => {
              const sel = ev.currentTarget as HTMLSelectElement;
              const val = sel.value;
              if (val === 'fit') {
                zoomNavController?.fitArtboard();
                return;
              }
              const parsed = Number.parseFloat(val);
              if (Number.isFinite(parsed) && parsed > 0) {
                if (zoomNavController) {
                  zoomNavController.applyZoom(parsed);
                } else {
                  studioZoom = parsed;
                  renderCoverStudio(container, actions);
                }
              }
            },
          },
        },
        el('option', {
          text: `${Math.round(studioZoom * 100)}%`,
          attrs: {
            value: 'custom',
            selected: !COVER_ZOOM_PRESETS.some((p) => Math.abs(p - studioZoom) < 0.005),
            hidden: COVER_ZOOM_PRESETS.some((p) => Math.abs(p - studioZoom) < 0.005),
          },
        }),
        ...COVER_ZOOM_PRESETS.map((preset) =>
          el('option', {
            text: `${Math.round(preset * 100)}%`,
            attrs: {
              value: String(preset),
              selected: Math.abs(preset - studioZoom) < 0.005,
            },
          }),
        ),
        el('option', { text: 'Fit to Window', attrs: { value: 'fit' } }),
      ),
      makeToolToggleBtn('zoom-in', 'Zoom In', false, 'Zoom canvas in (max 500%)', () => {
        const step = studioZoom < 0.5 ? 0.05 : 0.25;
        const target = Math.min(5, Number((studioZoom + step).toFixed(2)));
        if (zoomNavController) {
          zoomNavController.applyZoom(target);
        } else {
          studioZoom = target;
          renderCoverStudio(container, actions);
        }
      }),
      el('button', {
        className: 'bv-mini-btn',
        text: 'Fit',
        tooltip: { title: 'Fit Cover to Viewport', short: 'Scale artboard cleanly to available canvas space.' },
        attrs: { type: 'button' },
        on: {
          click: () => {
            if (zoomNavController) {
              zoomNavController.fitArtboard();
            } else {
              const scrollEl = container.querySelector<HTMLElement>('.qv-studio-canvas-scroll');
              const faceUnits = coverWrapMode === 'full-wrap' ? 2.2 : coverWrapMode === 'dust-jacket' ? 3.1 : 1;
              studioZoom = computeFitZoom(scrollEl?.clientWidth ?? 640, scrollEl?.clientHeight ?? 620, frontW * faceUnits, frontH);
              studioPanX = 0;
              studioPanY = 0;
              renderCoverStudio(container, actions);
            }
          },
        },
      }),
      detailModeSel,
      el(
        'button',
        {
          className: 'bv-btn',
          attrs: { type: 'button' },
          tooltip: { title: 'Print Interior PDF', short: 'Print formatted pages or save to PDF.' },
          on: { click: () => actions.printTypeset() },
        },
        icon('printer', 13),
        'Print',
      ),
      (exportMenuBtn = el(
        'button',
        {
          className: 'bv-btn bv-btn-primary',
          attrs: { type: 'button' },
          on: { click: () => openExportPopover(exportMenuBtn) },
        },
        icon('download', 13),
        'Export ▾',
      )),
    ),
  );

  // --- Left Vector & Layout Tool Rail + Drawer ---
  const toolTabs: Array<{ id: StudioToolTab; ic: IconName; label: string; desc: string }> = [
    { id: 'templates', ic: 'cover', label: 'Templates', desc: 'Style presets & palette' },
    { id: 'text', ic: 'type-tool', label: 'Text', desc: 'Add display headlines' },
    { id: 'shapes', ic: 'shapes', label: 'Shapes', desc: 'Vector geometry & rules' },
    { id: 'ornaments', ic: 'ornament', label: 'Elements', desc: 'Seals, dividers & crests' },
    { id: 'uploads', ic: 'image', label: 'Uploads', desc: 'SVG, PNG & image URLs' },
    { id: 'background', ic: 'palette', label: 'Backdrop', desc: 'Gradients & photo FX' },
    { id: 'jacket', ic: 'book', label: 'Jacket', desc: 'Back, spine & flaps' },
    ...(isDesktopProCover
      ? [
          { id: 'draw' as const, ic: 'draft-sheet' as const, label: 'Draw', desc: 'Vector pen & freehand strokes' },
          { id: 'variants' as const, ic: 'split' as const, label: 'Drafts', desc: 'Compare cover design variants' },
          { id: 'collab' as const, ic: 'collab' as const, label: 'Collab', desc: 'Review pins & .qvdesign share' },
        ]
      : []),
  ];

  const rail = el('nav', { className: 'qv-studio-rail', attrs: { 'aria-label': 'Cover design tools' } });
  for (const t of toolTabs) {
    rail.appendChild(
      el(
        'button',
        {
          className: `qv-rail-btn${activeToolTab === t.id ? ' is-active' : ''}`,
          attrs: { type: 'button', 'aria-label': t.label },
          tooltip: { title: t.label, short: t.desc },
          on: {
            click: () => {
              activeToolTab = t.id;
              renderCoverStudio(container, actions);
            },
          },
        },
        icon(t.ic, 17),
        detailMode !== 'icons' ? el('span', { className: 'qv-rail-label', text: t.label }) : null,
      ),
    );
  }

  const leftBody = el('div', { className: 'qv-studio-left-body' });
  const fontChoices = getAllAvailableFontChoices();

  if (activeToolTab === 'templates') {
    const presetGrid = el('div', { className: 'qv-template-grid' });
    for (const preset of COVER_TEMPLATES) {
      presetGrid.appendChild(
        el(
          'button',
          {
            className: `qv-template-swatch${cover.template === preset.id ? ' is-active' : ''}`,
            attrs: { type: 'button' },
            on: {
              click: () =>
                mutateCover(actions, (c) => ({
                  ...c,
                  template: preset.id as CoverTemplateId,
                  backgroundColor: preset.backgroundColor,
                  backBackgroundColor: preset.backgroundColor,
                  spineBackgroundColor: preset.backgroundColor,
                  accentColor: preset.accentColor,
                  textColor: preset.textColor,
                })),
            },
          },
          el('span', {
            className: 'qv-swatch-chip',
            style: { background: preset.backgroundColor, borderColor: preset.accentColor },
          }),
          el('span', { className: 'qv-swatch-name', text: preset.label }),
        ),
      );
    }

    const coverFontSel = el(
      'select',
      {
        className: 'bv-input',
        on: {
          change: () =>
            mutateCover(actions, (c) => ({
              ...c,
              customFontFamily: coverFontSel.value || undefined,
            })),
        },
      },
      el('option', {
        text: 'Use Interior Book Typeface',
        attrs: { value: '', selected: !cover.customFontFamily },
      }),
      ...fontChoices.map((f) =>
        el('option', {
          text: f.label,
          attrs: { value: f.id, selected: cover.customFontFamily === f.id },
        }),
      ),
    );

    const colorInput = (val: string, cb: (hex: string) => void) =>
      el('input', {
        attrs: { type: 'color', value: val },
        style: { width: '100%', height: '30px', border: '1px solid var(--border-hairline)', background: 'transparent', borderRadius: '4px', cursor: 'pointer' },
        on: { change: (e) => cb((e.target as HTMLInputElement).value) },
      });

    leftBody.append(
      el('span', { className: 'bv-panel-title', text: 'Style Templates' }),
      presetGrid,
      el('div', { className: 'bv-field' }, el('label', { className: 'bv-label', text: 'Master Cover Font' }), coverFontSel),
      el(
        'div',
        { style: { display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '6px' } },
        el('div', { className: 'bv-field' }, el('label', { className: 'bv-label', text: 'Front' }), colorInput(cover.backgroundColor, (v) => mutateCover(actions, (c) => ({ ...c, backgroundColor: v })))),
        el('div', { className: 'bv-field' }, el('label', { className: 'bv-label', text: 'Back' }), colorInput(cover.backBackgroundColor || cover.backgroundColor, (v) => mutateCover(actions, (c) => ({ ...c, backBackgroundColor: v })))),
        el('div', { className: 'bv-field' }, el('label', { className: 'bv-label', text: 'Spine' }), colorInput(cover.spineBackgroundColor || cover.backgroundColor, (v) => mutateCover(actions, (c) => ({ ...c, spineBackgroundColor: v })))),
        el('div', { className: 'bv-field' }, el('label', { className: 'bv-label', text: 'Accent' }), colorInput(cover.accentColor, (v) => mutateCover(actions, (c) => ({ ...c, accentColor: v })))),
        el('div', { className: 'bv-field' }, el('label', { className: 'bv-label', text: 'Ink' }), colorInput(cover.textColor, (v) => mutateCover(actions, (c) => ({ ...c, textColor: v })))),
      ),
    );
  } else if (activeToolTab === 'text') {
    const addTextBtn = (label: string, sample: string, size: number, weight: '400' | '500' | '600' | '700', upper = false) =>
      el(
        'button',
        {
          className: 'bv-btn',
          style: { justifyContent: 'flex-start', width: '100%' },
          attrs: { type: 'button' },
          on: {
            click: () => {
              const created = createTextLayer(activeTargetFace(), sample, cover.textColor);
              created.fontSize = size;
              created.fontWeight = weight;
              created.uppercase = upper;
              activeSelectionKind = 'text';
              activeLayerId = created.id;
              mutateCover(actions, (c) => ({
                ...c,
                textLayers: [...(c.textLayers ?? []), created],
              }));
            },
          },
        },
        icon('type-tool', 14),
        label,
      );

    leftBody.append(
      el('span', { className: 'bv-panel-title', text: 'Add Typography Layers' }),
      addTextBtn('Display Headline', 'A NEW EDITION', 28, '700', true),
      addTextBtn('Review / Praise Quote', '“A luminous work of rare craft.” — Review', 13, '400', false),
      addTextBtn('Award / Series Tagline', 'VOLUME ONE — UNABRIDGED', 11, '600', true),
      el('span', { className: 'bv-panel-title', text: 'Core Book Fields', style: { marginTop: '8px' } }),
      ...(['title', 'subtitle', 'author', 'edition', 'signature'] as CoverElementKey[]).map((key) =>
        el('button', {
          className: `bv-mini-btn${activeSelectionKind === 'element' && activeElementKey === key ? ' is-active' : ''}`,
          text: ['Select', key.charAt(0).toUpperCase() + key.slice(1)].join(' '),
          attrs: { type: 'button' },
          on: {
            click: () => {
              activeSelectionKind = 'element';
              activeElementKey = key;
              activeInspectorTab = 'properties';
              renderCoverStudio(container, actions);
            },
          },
        }),
      ),
    );
  } else if (activeToolTab === 'shapes') {
    const shapesCatalog: Array<{ kind: CoverShapeKind; label: string }> = [
      { kind: 'rect', label: 'Solid Block / Panel' },
      { kind: 'rounded-rect', label: 'Rounded Card Box' },
      { kind: 'circle', label: 'Geometric Circle Seal' },
      { kind: 'triangle', label: 'Triangle' },
      { kind: 'arrow', label: 'Arrow Pointer' },
      { kind: 'star', label: 'Five-Point Star' },
      { kind: 'polygon', label: 'Hexagon Crest' },
      { kind: 'line', label: 'Horizontal Rule Line' },
      { kind: 'frame', label: 'Foil Border Frame' },
      { kind: 'badge', label: 'Top Ribbon Pill' },
    ];
    leftBody.append(
      el('span', { className: 'bv-panel-title', text: 'Vector Shapes & Frames' }),
      ...shapesCatalog.map((item) =>
        el(
          'button',
          {
            className: 'bv-btn',
            style: { justifyContent: 'flex-start', width: '100%' },
            attrs: { type: 'button' },
            on: {
              click: () => {
                const shape = createShapeLayer(activeTargetFace(), item.kind, cover.accentColor);
                activeSelectionKind = 'shape';
                activeLayerId = shape.id;
                mutateCover(actions, (c) => ({
                  ...c,
                  shapeLayers: [...(c.shapeLayers ?? []), shape],
                }));
              },
            },
          },
          icon('shapes', 14),
          item.label,
        ),
      ),
    );
  } else if (activeToolTab === 'ornaments') {
    leftBody.append(
      el('span', { className: 'bv-panel-title', text: 'Vector Ornaments & Emblems' }),
      ...BUILT_IN_COVER_ORNAMENTS.map((orn) =>
        el(
          'button',
          {
            className: 'bv-btn',
            style: { justifyContent: 'flex-start', width: '100%' },
            attrs: { type: 'button' },
            on: {
              click: () => {
                const layer = createGraphicLayerFromDataUrl(
                  activeTargetFace(),
                  orn.name,
                  encodeSvgStringToDataUrl(orn.svgMarkup),
                  'svg',
                );
                activeSelectionKind = 'graphic';
                activeLayerId = layer.id;
                mutateCover(actions, (c) => ({
                  ...c,
                  graphicLayers: [...(c.graphicLayers ?? []), layer],
                }));
              },
            },
          },
          icon('ornament', 14),
          orn.name,
        ),
      ),
    );
  } else if (activeToolTab === 'uploads') {
    const pasteUrlIn = el('input', {
      className: 'bv-input',
      attrs: {
        type: 'url',
        placeholder: 'https://example.com/artwork.png',
        'aria-label': 'Paste image URL',
      },
    });
    const pasteStatusEl = el('div', { className: 'bv-label' });
    const applyPastedUrl = async (asBackground: boolean) => {
      const raw = pasteUrlIn.value.trim();
      if (!raw) {
        pasteStatusEl.textContent = 'Enter an https:// image URL or data:image URI first.';
        return;
      }
      pasteStatusEl.textContent = 'Downloading & embedding image locally…';
      try {
        const embeddedUrl = await loadImageUrlAsDataUrl(raw, 1400);
        if (asBackground) {
          mutateCover(actions, (c) => ({ ...c, backgroundImageDataUrl: embeddedUrl }));
          actions.notify('Embedded remote image as cover background');
        } else {
          const face = activeTargetFace();
          const layer = createGraphicLayerFromDataUrl(face, 'Pasted Image', embeddedUrl, 'image');
          activeSelectionKind = 'graphic';
          activeLayerId = layer.id;
          mutateCover(actions, (c) => ({
            ...c,
            graphicLayers: [...(c.graphicLayers ?? []), layer],
          }));
          actions.notify(`Placed pasted image on ${face} cover`);
        }
        pasteUrlIn.value = '';
        pasteStatusEl.textContent = 'Embedded locally for offline export.';
      } catch (err) {
        pasteStatusEl.textContent = err instanceof Error ? err.message : 'Unable to load image URL.';
      }
    };

    leftBody.append(
      el('span', { className: 'bv-panel-title', text: 'Upload Graphics & Artwork' }),
      el(
        'button',
        {
          className: 'bv-btn bv-btn-primary',
          attrs: { type: 'button' },
          on: { click: () => layerFileInput.click() },
        },
        icon('image', 14),
        'Add SVG / Transparent PNG…',
      ),
      el(
        'button',
        {
          className: 'bv-btn',
          attrs: { type: 'button' },
          on: { click: () => artFileInput.click() },
        },
        cover.backgroundImageDataUrl ? 'Replace Cover Background…' : 'Upload Full Cover Photo…',
      ),
      ...(cover.backgroundImageDataUrl
        ? [
            el('button', {
              className: 'bv-mini-btn',
              text: 'Remove Background Photo',
              attrs: { type: 'button' },
              on: { click: () => mutateCover(actions, (c) => ({ ...c, backgroundImageDataUrl: '' })) },
            }),
          ]
        : []),
      ...(isDesktopProCover
        ? [
            el('hr', { style: { border: '0', borderTop: '1px solid var(--border-subtle)', margin: '8px 0' } }),
            el('span', { className: 'bv-panel-title', text: 'Paste Image URL (HTTPS)' }),
            pasteUrlIn,
            el(
              'div',
              { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } },
              el('button', {
                className: 'bv-mini-btn bv-btn-primary',
                text: 'Add as Layer',
                attrs: { type: 'button' },
                on: { click: () => void applyPastedUrl(false) },
              }),
              el('button', {
                className: 'bv-mini-btn',
                text: 'Set as Backdrop',
                attrs: { type: 'button' },
                on: { click: () => void applyPastedUrl(true) },
              }),
            ),
            pasteStatusEl,
          ]
        : [
            el('p', {
              className: 'bv-label',
              style: { marginTop: '8px' },
              text: 'Vector path drawing, blend modes, side-by-side draft comparison, and .qvdesign collaboration packages are available in the free Desktop App.',
            }),
          ]),
      artFileInput,
      layerFileInput,
    );
  } else if (isDesktopProCover && activeToolTab === 'draw') {
    const strokeColIn = el('input', {
      attrs: { type: 'color', value: drawStrokeColor },
      on: { change: () => { drawStrokeColor = strokeColIn.value; } },
    });
    const fillColIn = el('input', {
      attrs: { type: 'color', value: drawFillColor === 'transparent' ? cover.accentColor : drawFillColor },
      on: { change: () => { drawFillColor = fillColIn.value; } },
    });
    const strokeWIn = el('input', {
      attrs: { type: 'range', min: 1, max: 24, step: 1, value: drawStrokeWidth },
      on: { input: () => { drawStrokeWidth = Number(strokeWIn.value); } },
    });
    const blendSel = el(
      'select',
      {
        className: 'bv-input',
        on: { change: () => { drawBlendMode = blendSel.value as CoverBlendMode; } },
      },
      ...COVER_BLEND_MODES.map((m) =>
        el('option', { text: m.label, attrs: { value: m.id, selected: drawBlendMode === m.id } }),
      ),
    );
    const closedChk = el('input', {
      className: 'bv-lever',
      attrs: { type: 'checkbox', role: 'switch', checked: drawClosedPath },
      on: { change: () => { drawClosedPath = closedChk.checked; } },
    });

    leftBody.append(
      el('span', { className: 'bv-panel-title', text: 'Vector Drawing & Brush' }),
      el('p', {
        className: 'bv-label',
        text: 'Pick Freehand Brush to sketch directly on the cover, or Vector Pen to place anchor points.',
      }),
      el(
        'div',
        { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } },
        el('button', {
          className: `bv-mini-btn${drawBrushMode === 'freehand' ? ' is-active' : ''}`,
          text: 'Freehand Brush',
          attrs: { type: 'button' },
          on: {
            click: () => {
              drawBrushMode = drawBrushMode === 'freehand' ? 'off' : 'freehand';
              pendingPenPoints = [];
              commentPinMode = false;
              renderCoverStudio(container, actions);
            },
          },
        }),
        el('button', {
          className: `bv-mini-btn${drawBrushMode === 'pen' ? ' is-active' : ''}`,
          text: 'Vector Pen',
          attrs: { type: 'button' },
          on: {
            click: () => {
              drawBrushMode = drawBrushMode === 'pen' ? 'off' : 'pen';
              pendingPenPoints = [];
              commentPinMode = false;
              renderCoverStudio(container, actions);
            },
          },
        }),
        drawBrushMode !== 'off'
          ? el('button', {
              className: 'bv-mini-btn',
              text: 'Exit Draw',
              attrs: { type: 'button' },
              on: {
                click: () => {
                  drawBrushMode = 'off';
                  pendingPenPoints = [];
                  renderCoverStudio(container, actions);
                },
              },
            })
          : null,
      ),
      ...(drawBrushMode === 'pen' && pendingPenPoints.length >= 2
        ? [
            el('button', {
              className: 'bv-btn bv-btn-primary',
              text: `Commit Vector Path (${pendingPenPoints.length} pts)`,
              attrs: { type: 'button' },
              on: {
                click: () => {
                  const created = createPathLayer(activeTargetFace(), pendingPenPoints, {
                    name: `Vector Path ${(cover.pathLayers?.length ?? 0) + 1}`,
                    closed: drawClosedPath,
                    strokeColor: drawStrokeColor,
                    strokeWidth: drawStrokeWidth,
                    fillColor: drawClosedPath ? fillColIn.value : 'transparent',
                    blendMode: drawBlendMode,
                  });
                  pendingPenPoints = [];
                  activeSelectionKind = 'path';
                  activeLayerId = created.id;
                  mutateCover(actions, (c) => ({
                    ...c,
                    pathLayers: [...(c.pathLayers ?? []), created],
                  }));
                },
              },
            }),
          ]
        : []),
      el('div', { className: 'bv-field' }, el('label', { className: 'bv-label', text: 'Stroke Color' }), strokeColIn),
      el('div', { className: 'bv-field' }, el('label', { className: 'bv-label', text: `Stroke Width (${drawStrokeWidth}px)` }), strokeWIn),
      el('label', { className: 'bv-check-row' }, closedChk, el('span', { text: 'Close Path & Fill Interior' })),
      el(
        'div',
        { className: 'bv-field' },
        el('label', { className: 'bv-label', text: 'Fill Color' }),
        el(
          'div',
          { style: { display: 'flex', gap: '6px', alignItems: 'center' } },
          fillColIn,
          el('button', {
            className: 'bv-mini-btn',
            text: 'No Fill',
            attrs: { type: 'button' },
            on: { click: () => { drawFillColor = 'transparent'; } },
          }),
        ),
      ),
      el('div', { className: 'bv-field' }, el('label', { className: 'bv-label', text: 'Layer Blend Mode' }), blendSel),
    );
  } else if (isDesktopProCover && activeToolTab === 'variants') {
    const variantNameIn = el('input', {
      className: 'bv-input',
      attrs: { type: 'text', placeholder: `Draft Concept ${variants.length + 1}` },
    });

    const openCompareModal = () => {
      if (variants.length < 1) {
        actions.notify('Save at least 1 cover draft variant first to compare side-by-side.');
        return;
      }
      document.getElementById('qv-cover-compare-modal')?.remove();
      const allOptions = [
        { id: '__current__', name: 'Current Working Cover', snap: createCoverVariantSnapshot(cover) },
        ...variants.map((v) => ({ id: v.id, name: v.name, snap: v.snapshot })),
      ];
      if (!compareLeftVariantId || !allOptions.some((o) => o.id === compareLeftVariantId)) {
        compareLeftVariantId = allOptions[0].id;
      }
      if (!compareRightVariantId || !allOptions.some((o) => o.id === compareRightVariantId)) {
        compareRightVariantId = allOptions[Math.min(1, allOptions.length - 1)].id;
      }

      const previewHost = el('div', { className: 'qv-cover-compare-grid' });
      const closeCmp = () => cmpBackdrop.remove();

      const renderMiniCoverCard = (titleLabel: string, snap: Omit<BookCoverConfig, 'variants' | 'comments'>, canPromote: boolean, onPromote?: () => void) => {
        const card = el(
          'div',
          { className: 'qv-cover-compare-col' },
          el('div', { className: 'qv-cover-compare-preview', style: { background: computeCoverBackgroundCss({ ...cover, ...snap }, snap.backgroundColor), color: snap.textColor } },
            snap.backgroundImageDataUrl
              ? el('img', {
                  attrs: { src: snap.backgroundImageDataUrl, alt: titleLabel },
                  style: { position: 'absolute', inset: '0', width: '100%', height: '100%', objectFit: 'cover', opacity: String(1 - (snap.imageOverlayOpacity ?? 0.45)) },
                })
              : null,
            el('div', { className: 'qv-cover-compare-meta' },
              el('span', { style: { fontSize: '10px', letterSpacing: '0.14em', textTransform: 'uppercase', color: snap.accentColor }, text: snap.editionLabel }),
              el('strong', { style: { fontSize: '18px', lineHeight: '1.2' }, text: project.title }),
              project.subtitle ? el('span', { style: { fontSize: '11px', opacity: '0.85' }, text: project.subtitle }) : null,
              el('span', { style: { fontSize: '11px', marginTop: 'auto', letterSpacing: '0.1em' }, text: penName.toUpperCase() }),
            ),
          ),
          el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' } },
            el('div', {},
              el('strong', { text: titleLabel, style: { fontSize: '12.5px' } }),
              el('div', { className: 'bv-mono-tag', text: `Template: ${snap.template} (${(snap.shapeLayers?.length ?? 0) + (snap.textLayers?.length ?? 0) + (snap.graphicLayers?.length ?? 0) + (snap.pathLayers?.length ?? 0)} layers)` }),
            ),
            canPromote && onPromote
              ? el('button', {
                  className: 'bv-mini-btn bv-btn-primary',
                  text: 'Promote Winner',
                  attrs: { type: 'button' },
                  on: {
                    click: () => {
                      onPromote();
                      closeCmp();
                    },
                  },
                })
              : null,
          ),
        );
        return card;
      };

      const rebuildCompare = () => {
        previewHost.textContent = '';
        const leftItem = allOptions.find((o) => o.id === compareLeftVariantId) ?? allOptions[0];
        const rightItem = allOptions.find((o) => o.id === compareRightVariantId) ?? allOptions[allOptions.length - 1];
        previewHost.append(
          renderMiniCoverCard(leftItem.name, leftItem.snap, leftItem.id !== '__current__', () => {
            mutateCover(actions, (c) => ({ ...structuredClone(leftItem.snap), variants: c.variants, comments: c.comments }));
            actions.notify(`Promoted “${leftItem.name}” to active cover`);
          }),
          renderMiniCoverCard(rightItem.name, rightItem.snap, rightItem.id !== '__current__', () => {
            mutateCover(actions, (c) => ({ ...structuredClone(rightItem.snap), variants: c.variants, comments: c.comments }));
            actions.notify(`Promoted “${rightItem.name}” to active cover`);
          }),
        );
      };

      const leftSel = el(
        'select',
        { className: 'bv-input', on: { change: () => { compareLeftVariantId = leftSel.value; rebuildCompare(); } } },
        ...allOptions.map((o) => el('option', { text: o.name, attrs: { value: o.id, selected: compareLeftVariantId === o.id } })),
      );
      const rightSel = el(
        'select',
        { className: 'bv-input', on: { change: () => { compareRightVariantId = rightSel.value; rebuildCompare(); } } },
        ...allOptions.map((o) => el('option', { text: o.name, attrs: { value: o.id, selected: compareRightVariantId === o.id } })),
      );

      const cmpModal = el(
        'div',
        { className: 'bv-modal', style: { maxWidth: '820px' }, attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Compare Cover Design Variants' } },
        el('div', { className: 'bv-panel-head' },
          el('span', { className: 'bv-panel-title', text: 'Side-by-Side Cover Comparison' }),
          el('button', { className: 'bv-mini-btn', text: 'Close', attrs: { type: 'button' }, on: { click: closeCmp } }),
        ),
        el('div', { className: 'bv-modal-body', style: { gap: '12px' } },
          el('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' } },
            el('div', { className: 'bv-field' }, el('label', { className: 'bv-label', text: 'Left Concept' }), leftSel),
            el('div', { className: 'bv-field' }, el('label', { className: 'bv-label', text: 'Right Concept' }), rightSel),
          ),
          previewHost,
        ),
      );
      const cmpBackdrop = el(
        'div',
        { className: 'bv-modal-backdrop', id: 'qv-cover-compare-modal', on: { click: (e) => { if (e.target === cmpBackdrop) closeCmp(); } } },
        cmpModal,
      );
      document.body.appendChild(cmpBackdrop);
      rebuildCompare();
    };

    leftBody.append(
      el('span', { className: 'bv-panel-title', text: 'Drafts & Side-by-Side Compare' }),
      variantNameIn,
      el(
        'div',
        { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } },
        el('button', {
          className: 'bv-btn bv-btn-primary',
          text: 'Save Current as Draft',
          attrs: { type: 'button' },
          on: {
            click: () => {
              const name = variantNameIn.value.trim() || `Draft Concept ${variants.length + 1}`;
              const variant = {
                id: newId('cvar'),
                name,
                createdAt: new Date().toISOString(),
                snapshot: createCoverVariantSnapshot(cover),
              };
              variantNameIn.value = '';
              mutateCover(actions, (c) => ({ ...c, variants: [...(c.variants ?? []), variant] }));
              actions.notify(`Saved cover variant “${name}”`);
            },
          },
        }),
        el('button', {
          className: 'bv-btn',
          text: 'Compare Side-by-Side',
          attrs: { type: 'button' },
          on: { click: openCompareModal },
        }),
      ),
      ...variants.map((v) =>
        el(
          'div',
          { className: 'bv-list-card', style: { flexDirection: 'column', alignItems: 'stretch', gap: '6px' } },
          el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
            el('strong', { text: v.name, style: { fontSize: '12.5px' } }),
            el('span', { className: 'bv-mono-tag', text: v.snapshot.template }),
          ),
          el('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } },
            el('button', {
              className: 'bv-mini-btn bv-btn-primary',
              text: 'Load',
              attrs: { type: 'button' },
              on: {
                click: () => {
                  mutateCover(actions, (c) => ({ ...structuredClone(v.snapshot), variants: c.variants, comments: c.comments }));
                  actions.notify(`Loaded cover draft “${v.name}”`);
                },
              },
            }),
            el('button', {
              className: 'bv-mini-btn',
              text: 'Delete',
              attrs: { type: 'button' },
              on: {
                click: () => mutateCover(actions, (c) => ({ ...c, variants: (c.variants ?? []).filter((x) => x.id !== v.id) })),
              },
            }),
          ),
        ),
      ),
    );
  } else if (isDesktopProCover && activeToolTab === 'collab') {
    const designImportInput = el('input', {
      attrs: { type: 'file', accept: '.qvdesign' },
      style: { display: 'none' },
      on: {
        change: async () => {
          const f = designImportInput.files?.[0];
          designImportInput.value = '';
          if (!f) return;
          try {
            const bytes = new Uint8Array(await f.arrayBuffer());
            const res = await importCoverDesignArchive(bytes, project, { filenameHint: f.name });
            actions.mutateProject(() => res.project);
            actions.notify(res.summaryMessage);
          } catch (err) {
            actions.notify(err instanceof Error ? err.message : 'Unable to import .qvdesign package.');
          }
        },
      },
    });
    const mergeCommentsInput = el('input', {
      attrs: { type: 'file', accept: '.qvdesign' },
      style: { display: 'none' },
      on: {
        change: async () => {
          const f = mergeCommentsInput.files?.[0];
          mergeCommentsInput.value = '';
          if (!f) return;
          try {
            const bytes = new Uint8Array(await f.arrayBuffer());
            const res = await importCoverDesignArchive(bytes, project, { mergeCommentsOnly: true, filenameHint: f.name });
            actions.mutateProject(() => res.project);
            actions.notify(res.summaryMessage);
          } catch (err) {
            actions.notify(err instanceof Error ? err.message : 'Unable to merge review comments.');
          }
        },
      },
    });
    const pinAuthorIn = el('input', {
      className: 'bv-input',
      attrs: { type: 'text', value: project.activeAuthorLabel || penName || 'Reviewer', placeholder: 'Reviewer Name' },
    });
    const pinNoteIn = el('input', {
      className: 'bv-input',
      attrs: { type: 'text', placeholder: 'Note for the next pin (or add directly)…' },
    });

    leftBody.append(
      el('span', { className: 'bv-panel-title', text: 'Cover Design Collaboration (.qvdesign)' }),
      el('p', {
        className: 'bv-label',
        text: 'Export a standalone .qvdesign package to share editable layers with co-authors or cover designers, or drop review pins directly on the artwork.',
      }),
      el(
        'div',
        { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } },
        el('button', {
          className: 'bv-btn bv-btn-primary',
          attrs: { type: 'button' },
          on: {
            click: async () => {
              const bytes = await exportCoverDesignArchive(project);
              const saved = await exportGenericFile({
                suggestedName: `${project.title || 'cover'}-design`,
                extension: 'qvdesign',
                description: 'Quillvibe Cover Design (.qvdesign)',
                mimeType: 'application/vnd.quillvibe.design',
                binaryBytes: bytes,
              });
              if (saved) actions.notify('Exported .qvdesign cover package');
            },
          },
        }, icon('download', 13), 'Export .qvdesign'),
        el('button', {
          className: 'bv-btn',
          text: 'Import .qvdesign…',
          attrs: { type: 'button' },
          on: { click: () => designImportInput.click() },
        }),
        el('button', {
          className: 'bv-mini-btn',
          text: 'Merge Pins Only…',
          attrs: { type: 'button' },
          on: { click: () => mergeCommentsInput.click() },
        }),
      ),
      designImportInput,
      mergeCommentsInput,
      el('hr', { style: { border: '0', borderTop: '1px solid var(--border-subtle)', margin: '8px 0' } }),
      el('span', { className: 'bv-panel-title', text: `Canvas Review Pins (${comments.length})` }),
      pinAuthorIn,
      pinNoteIn,
      el(
        'div',
        { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } },
        el('button', {
          className: `bv-mini-btn${commentPinMode ? ' is-active' : ''}`,
          text: commentPinMode ? 'Click Cover to Drop Pin (Active)' : 'Click Cover to Drop Pin',
          attrs: { type: 'button' },
          on: {
            click: () => {
              commentPinMode = !commentPinMode;
              drawBrushMode = 'off';
              renderCoverStudio(container, actions);
            },
          },
        }),
        el('button', {
          className: 'bv-mini-btn',
          text: 'Drop Center Pin',
          attrs: { type: 'button' },
          on: {
            click: () => {
              const text = pinNoteIn.value.trim() || 'Review note on cover layout';
              const author = pinAuthorIn.value.trim() || penName || 'Reviewer';
              pinNoteIn.value = '';
              mutateCover(actions, (c) => ({
                ...c,
                comments: [
                  ...(c.comments ?? []),
                  { id: newId('cpin'), face: activeTargetFace(), xPct: 50, yPct: 50, author, text, resolved: false, createdAt: new Date().toISOString() },
                ],
              }));
            },
          },
        }),
      ),
      ...comments.map((cm, idx) =>
        el(
          'div',
          { className: `bv-list-card${cm.resolved ? ' is-resolved' : ''}`, style: { flexDirection: 'column', alignItems: 'stretch', gap: '4px', opacity: cm.resolved ? '0.65' : '1' } },
          el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
            el('strong', { text: `#${idx + 1}: ${cm.author} (${cm.face})`, style: { fontSize: '12px' } }),
            el('span', { className: 'bv-mono-tag', text: cm.resolved ? 'Resolved' : 'Open' }),
          ),
          el('p', { className: 'bv-label', text: cm.text, style: { margin: '0', color: 'var(--text-primary)' } }),
          el('div', { style: { display: 'flex', gap: '6px' } },
            el('button', {
              className: 'bv-mini-btn',
              text: cm.resolved ? 'Reopen' : 'Resolve',
              attrs: { type: 'button' },
              on: { click: () => mutateCover(actions, (c) => ({ ...c, comments: (c.comments ?? []).map((x) => x.id === cm.id ? { ...x, resolved: !x.resolved } : x) })) },
            }),
            el('button', {
              className: 'bv-mini-btn',
              text: 'Remove',
              attrs: { type: 'button' },
              on: { click: () => mutateCover(actions, (c) => ({ ...c, comments: (c.comments ?? []).filter((x) => x.id !== cm.id) })) },
            }),
          ),
        ),
      ),
    );
  } else if (activeToolTab === 'background') {
    const bgModeSel = el(
      'select',
      {
        className: 'bv-input',
        on: {
          change: () =>
            mutateCover(actions, (c) => ({
              ...c,
              bgMode: bgModeSel.value as 'solid' | 'linear-gradient' | 'radial-gradient',
            })),
        },
      },
      el('option', { text: 'Solid Color', attrs: { value: 'solid', selected: (cover.bgMode ?? 'solid') === 'solid' } }),
      el('option', { text: 'Linear Gradient', attrs: { value: 'linear-gradient', selected: cover.bgMode === 'linear-gradient' } }),
      el('option', { text: 'Radial Vignette', attrs: { value: 'radial-gradient', selected: cover.bgMode === 'radial-gradient' } }),
    );
    const gradEndIn = el('input', {
      attrs: { type: 'color', value: cover.bgGradientEnd || cover.accentColor },
      style: { width: '100%', height: '30px', border: '1px solid var(--border-hairline)', background: 'transparent', borderRadius: '4px' },
      on: { change: () => mutateCover(actions, (c) => ({ ...c, bgGradientEnd: gradEndIn.value })) },
    });

    let dimLabelEl: HTMLElement | null = null;
    const overlayRange = el('input', {
      attrs: { type: 'range', min: 0, max: 0.85, step: 0.05, value: cover.imageOverlayOpacity },
      on: {
        input: () => {
          const val = Number(overlayRange.value);
          if (dimLabelEl) dimLabelEl.textContent = `Overlay Dim (${Math.round(val * 100)}%)`;
          container.querySelectorAll<HTMLElement>('.bv-cover-bg-dim').forEach((n) => {
            n.style.opacity = String(val);
          });
          mutateCover(actions, (c) => ({ ...c, imageOverlayOpacity: val }), false, false);
        },
        change: () =>
          mutateCover(actions, (c) => ({ ...c, imageOverlayOpacity: Number(overlayRange.value) }), true),
      },
    });

    const brightIn = el('input', {
      attrs: { type: 'range', min: 60, max: 140, step: 5, value: cover.bgBrightnessPct ?? 100 },
      on: { change: () => mutateCover(actions, (c) => ({ ...c, bgBrightnessPct: Number(brightIn.value) })) },
    });
    const contrastIn = el('input', {
      attrs: { type: 'range', min: 70, max: 140, step: 5, value: cover.bgContrastPct ?? 100 },
      on: { change: () => mutateCover(actions, (c) => ({ ...c, bgContrastPct: Number(contrastIn.value) })) },
    });
    const blurIn = el('input', {
      attrs: { type: 'range', min: 0, max: 12, step: 1, value: cover.bgBlurPx ?? 0 },
      on: { change: () => mutateCover(actions, (c) => ({ ...c, bgBlurPx: Number(blurIn.value) })) },
    });

    leftBody.append(
      el('span', { className: 'bv-panel-title', text: 'Backdrop & Photo FX' }),
      el('div', { className: 'bv-field' }, el('label', { className: 'bv-label', text: 'Fill Style' }), bgModeSel),
      el('div', { className: 'bv-field' }, el('label', { className: 'bv-label', text: 'Gradient Secondary Color' }), gradEndIn),
      el('div', { className: 'bv-field' }, (dimLabelEl = el('label', { className: 'bv-label', text: `Overlay Dim (${Math.round(cover.imageOverlayOpacity * 100)}%)` })), overlayRange),
      el('div', { className: 'bv-field' }, el('label', { className: 'bv-label', text: `Photo Brightness (${cover.bgBrightnessPct ?? 100}%)` }), brightIn),
      el('div', { className: 'bv-field' }, el('label', { className: 'bv-label', text: `Photo Contrast (${cover.bgContrastPct ?? 100}%)` }), contrastIn),
      el('div', { className: 'bv-field' }, el('label', { className: 'bv-label', text: `Background Blur (${cover.bgBlurPx ?? 0}px)` }), blurIn),
      el('div', { className: 'bv-field' }, el('label', { className: 'bv-label', text: 'Grid Spacing' }), el('input', {
        attrs: { type: 'range', min: 2, max: 10, step: 1, value: gridStepPct },
        on: { change: (e) => mutateCover(actions, (c) => ({ ...c, gridSizePx: Number((e.target as HTMLInputElement).value) })) },
      })),
    );
  } else {
    const spineTitleIn = el('input', {
      className: 'bv-input',
      attrs: { type: 'text', value: cover.spineTitle || '', placeholder: project.title },
      on: { change: () => mutateCover(actions, (c) => ({ ...c, spineTitle: spineTitleIn.value })) },
    });
    const backHeadIn = el('input', {
      className: 'bv-input',
      attrs: { type: 'text', value: cover.backHeadline || '' },
      on: { change: () => mutateCover(actions, (c) => ({ ...c, backHeadline: backHeadIn.value })) },
    });
    const blurbIn = el('textarea', {
      className: 'bv-textarea',
      attrs: { rows: 3, placeholder: 'Back cover synopsis blurb…' },
      on: { change: () => mutateCover(actions, (c) => ({ ...c, backBlurb: blurbIn.value })) },
    });
    blurbIn.value = cover.backBlurb;
    const bioIn = el('textarea', {
      className: 'bv-textarea',
      attrs: { rows: 2, placeholder: 'Author biography…' },
      on: { change: () => mutateCover(actions, (c) => ({ ...c, authorBio: bioIn.value })) },
    });
    bioIn.value = cover.authorBio || '';
    const frontFlapIn = el('textarea', {
      className: 'bv-textarea',
      attrs: { rows: 2 },
      on: { change: () => mutateCover(actions, (c) => ({ ...c, frontFlapText: frontFlapIn.value })) },
    });
    frontFlapIn.value = cover.frontFlapText || '';
    const backFlapIn = el('textarea', {
      className: 'bv-textarea',
      attrs: { rows: 2 },
      on: { change: () => mutateCover(actions, (c) => ({ ...c, backFlapText: backFlapIn.value })) },
    });
    backFlapIn.value = cover.backFlapText || '';
    const barcodeChk = el('input', {
      className: 'bv-lever',
      attrs: { type: 'checkbox', role: 'switch', checked: cover.showBarcodeBox !== false },
      on: { change: () => mutateCover(actions, (c) => ({ ...c, showBarcodeBox: barcodeChk.checked })) },
    });

    leftBody.append(
      el('span', { className: 'bv-panel-title', text: 'Back, Spine, Flaps & Exports' }),
      el('div', { className: 'bv-field' }, el('label', { className: 'bv-label', text: 'Spine Title Override' }), spineTitleIn),
      el('div', { className: 'bv-field' }, el('label', { className: 'bv-label', text: 'Back Headline' }), backHeadIn),
      el('div', { className: 'bv-field' }, el('label', { className: 'bv-label', text: 'Back Blurb' }), blurbIn),
      el('div', { className: 'bv-field' }, el('label', { className: 'bv-label', text: 'Author Bio' }), bioIn),
      el('label', { className: 'bv-check-row' }, barcodeChk, el('span', { text: 'Include ISBN Barcode Box' })),
      el('div', { className: 'bv-field' }, el('label', { className: 'bv-label', text: 'Front Jacket Flap' }), frontFlapIn),
      el('div', { className: 'bv-field' }, el('label', { className: 'bv-label', text: 'Back Jacket Flap' }), backFlapIn),
      el('button', {
        className: 'bv-btn bv-btn-primary',
        attrs: { type: 'button' },
        on: { click: () => void actions.exportCoverPng() },
      }, icon('download', 14), 'Export Front Cover PNG'),
      el('button', {
        className: 'bv-btn',
        attrs: { type: 'button' },
        on: { click: () => void actions.exportFullWrapPng() },
      }, icon('download', 14), 'Export Full Print Wrap PNG'),
      el('button', {
        className: 'bv-btn',
        attrs: { type: 'button' },
        on: { click: () => void actions.exportEpub() },
      }, icon('book', 14), 'Export EPUB 3 with Cover'),
    );
  }

  const leftDock = el('aside', { className: 'qv-studio-left' }, rail, leftBody);

  // --- Center Interactive Artboard Stage ---
  const fontCss = cover.customFontFamily
    ? resolveEffectiveFontCss(project.typography.fontFamily, cover.customFontFamily)
    : resolveEffectiveFontCss(project.typography.fontFamily, project.typography.customFontFamily);

  const stageWrap = el('div', { className: 'qv-studio-stage-wrap' });
  const stageScroll = el('div', { className: 'qv-studio-canvas-scroll' });
  const guideV = el('div', { className: 'qv-smart-guide qv-smart-guide-v' });
  const guideH = el('div', { className: 'qv-smart-guide qv-smart-guide-h' });
  const badgeOverlay = el('div', {
    className: 'qv-snap-badge-layer',
    style: { position: 'absolute', inset: '0', pointerEvents: 'none', zIndex: '11' },
  });

  const renderSmartGuidesAndBadges = (guides: SnapGuideLine[], badges: SpacingBadgeIndicator[]) => {
    const vGuide = guides.find((g) => g.orientation === 'vertical');
    const hGuide = guides.find((g) => g.orientation === 'horizontal');
    guideV.style.display = vGuide ? 'block' : 'none';
    if (vGuide) guideV.style.left = `${vGuide.positionPct}%`;
    guideH.style.display = hGuide ? 'block' : 'none';
    if (hGuide) guideH.style.top = `${hGuide.positionPct}%`;

    clearNode(badgeOverlay);
    for (const b of badges) {
      const mid = (b.startPct + b.endPct) / 2;
      const badge = el('span', {
        className: 'qv-snap-badge',
        text: `${b.gapPx}px`,
        style:
          b.orientation === 'horizontal'
            ? { left: `${mid}%`, top: `${b.crossPct}%` }
            : { left: `${b.crossPct}%`, top: `${mid}%` },
      });
      badgeOverlay.appendChild(badge);
    }
  };

  const getSelectedLayersList = () => {
    const keys = Array.from(selectedLayerKeys);
    if (keys.length === 0 && activeLayerId && activeSelectionKind !== 'none') {
      keys.push(layerKeyOf(activeSelectionKind, activeLayerId));
    }
    return keys;
  };

  const applyAlignToSelected = (mode: AlignMode) => {
    const face = activeTargetFace();
    const keys = new Set(getSelectedLayersList());
    const boxes: WorldBox[] = [];
    for (const s of shapeLayers) {
      if (s.face === face && keys.has(layerKeyOf('shape', s.id))) {
        boxes.push({ id: layerKeyOf('shape', s.id), left: s.xPct - s.widthPct / 2, top: s.yPct - s.heightPct / 2, width: s.widthPct, height: s.heightPct });
      }
    }
    for (const g of graphicLayers) {
      if (g.face === face && keys.has(layerKeyOf('graphic', g.id))) {
        boxes.push({ id: layerKeyOf('graphic', g.id), left: g.xPct - g.widthPct / 2, top: g.yPct - 10, width: g.widthPct, height: 20 });
      }
    }
    for (const tl of textLayers) {
      if (tl.face === face && keys.has(layerKeyOf('text', tl.id))) {
        boxes.push({ id: layerKeyOf('text', tl.id), left: tl.xPct - 14, top: tl.yPct - 4, width: 28, height: 8 });
      }
    }
    if (boxes.length === 0) return;
    const aligned = alignBoxes(boxes, mode);
    mutateCover(actions, (c) => ({
      ...c,
      shapeLayers: (c.shapeLayers ?? []).map((s) => {
        const res = aligned.get(layerKeyOf('shape', s.id));
        return res ? { ...s, xPct: Number((res.left + s.widthPct / 2).toFixed(2)), yPct: Number((res.top + s.heightPct / 2).toFixed(2)) } : s;
      }),
      graphicLayers: (c.graphicLayers ?? []).map((g) => {
        const res = aligned.get(layerKeyOf('graphic', g.id));
        return res ? { ...g, xPct: Number((res.left + g.widthPct / 2).toFixed(2)), yPct: Number((res.top + 10).toFixed(2)) } : g;
      }),
      textLayers: (c.textLayers ?? []).map((tl) => {
        const res = aligned.get(layerKeyOf('text', tl.id));
        return res ? { ...tl, xPct: Number((res.left + 14).toFixed(2)), yPct: Number((res.top + 4).toFixed(2)) } : tl;
      }),
    }));
  };

  const duplicateSelectedLayers = () => {
    const keys = new Set(getSelectedLayersList());
    const nextSel = new Set<string>();
    mutateCover(actions, (c) => {
      const addShapes: CoverShapeLayer[] = [];
      const addGraphics: CoverGraphicLayer[] = [];
      const addTexts: CoverTextLayer[] = [];
      for (const s of c.shapeLayers ?? []) {
        if (keys.has(layerKeyOf('shape', s.id))) {
          const nid = newId('dup');
          addShapes.push({ ...s, id: nid, groupId: undefined, xPct: Math.min(94, s.xPct + 4), yPct: Math.min(94, s.yPct + 4) });
          nextSel.add(layerKeyOf('shape', nid));
          activeSelectionKind = 'shape';
          activeLayerId = nid;
        }
      }
      for (const g of c.graphicLayers ?? []) {
        if (keys.has(layerKeyOf('graphic', g.id))) {
          const nid = newId('dup');
          addGraphics.push({ ...g, id: nid, groupId: undefined, xPct: Math.min(94, g.xPct + 4), yPct: Math.min(94, g.yPct + 4) });
          nextSel.add(layerKeyOf('graphic', nid));
          activeSelectionKind = 'graphic';
          activeLayerId = nid;
        }
      }
      for (const t of c.textLayers ?? []) {
        if (keys.has(layerKeyOf('text', t.id))) {
          const nid = newId('dup');
          addTexts.push({ ...t, id: nid, groupId: undefined, xPct: Math.min(94, t.xPct + 4), yPct: Math.min(94, t.yPct + 4) });
          nextSel.add(layerKeyOf('text', nid));
          activeSelectionKind = 'text';
          activeLayerId = nid;
        }
      }
      if (nextSel.size > 0) {
        selectedLayerKeys.clear();
        nextSel.forEach((k) => selectedLayerKeys.add(k));
      }
      return {
        ...c,
        shapeLayers: [...(c.shapeLayers ?? []), ...addShapes],
        graphicLayers: [...(c.graphicLayers ?? []), ...addGraphics],
        textLayers: [...(c.textLayers ?? []), ...addTexts],
      };
    });
  };

  const deleteSelectedLayers = () => {
    const keys = new Set(getSelectedLayersList());
    const hasCustom = Array.from(keys).some((k) => !k.startsWith('element:'));
    if (!hasCustom) return;
    selectedLayerKeys.clear();
    selectedLayerKeys.add('element:title');
    activeSelectionKind = 'element';
    activeElementKey = 'title';
    activeLayerId = '';
    mutateCover(actions, (c) => ({
      ...c,
      shapeLayers: (c.shapeLayers ?? []).filter((s) => !keys.has(layerKeyOf('shape', s.id))),
      graphicLayers: (c.graphicLayers ?? []).filter((g) => !keys.has(layerKeyOf('graphic', g.id))),
      textLayers: (c.textLayers ?? []).filter((t) => !keys.has(layerKeyOf('text', t.id))),
    }));
  };

  const groupSelectedLayers = (ungroup = false) => {
    const keys = new Set(getSelectedLayersList());
    const customKeys = Array.from(keys).filter((k) => !k.startsWith('element:'));
    if (customKeys.length < (ungroup ? 1 : 2)) {
      actions.notify(ungroup ? 'Select a grouped layer to ungroup.' : 'Shift+Click or marquee 2+ layers to group.');
      return;
    }
    const gid = ungroup ? undefined : newId('grp');
    mutateCover(actions, (c) => ({
      ...c,
      shapeLayers: (c.shapeLayers ?? []).map((s) => (keys.has(layerKeyOf('shape', s.id)) ? { ...s, groupId: gid } : s)),
      graphicLayers: (c.graphicLayers ?? []).map((g) => (keys.has(layerKeyOf('graphic', g.id)) ? { ...g, groupId: gid } : g)),
      textLayers: (c.textLayers ?? []).map((t) => (keys.has(layerKeyOf('text', t.id)) ? { ...t, groupId: gid } : t)),
    }));
    actions.notify(ungroup ? 'Ungrouped selected layers' : `Grouped ${customKeys.length} layers`);
  };

  const copySelectedLayers = () => {
    const keys = new Set(getSelectedLayersList());
    const copied: typeof studioClipboard = [];
    for (const s of shapeLayers) if (keys.has(layerKeyOf('shape', s.id))) copied.push({ kind: 'shape', layer: structuredClone(s) });
    for (const g of graphicLayers) if (keys.has(layerKeyOf('graphic', g.id))) copied.push({ kind: 'graphic', layer: structuredClone(g) });
    for (const t of textLayers) if (keys.has(layerKeyOf('text', t.id))) copied.push({ kind: 'text', layer: structuredClone(t) });
    if (copied.length > 0) {
      studioClipboard = copied;
      actions.notify(`Copied ${copied.length} cover layer${copied.length > 1 ? 's' : ''}`);
    }
  };

  const pasteCopiedLayers = () => {
    if (studioClipboard.length === 0) return;
    const face = activeTargetFace();
    const nextSel = new Set<string>();
    mutateCover(actions, (c) => {
      const addShapes: CoverShapeLayer[] = [];
      const addGraphics: CoverGraphicLayer[] = [];
      const addTexts: CoverTextLayer[] = [];
      for (const item of studioClipboard) {
        const nid = newId('pst');
        if (item.kind === 'shape') {
          addShapes.push({ ...structuredClone(item.layer), id: nid, face, xPct: Math.min(94, item.layer.xPct + 4), yPct: Math.min(94, item.layer.yPct + 4) });
          nextSel.add(layerKeyOf('shape', nid));
          activeSelectionKind = 'shape';
          activeLayerId = nid;
        } else if (item.kind === 'graphic') {
          addGraphics.push({ ...structuredClone(item.layer), id: nid, face, xPct: Math.min(94, item.layer.xPct + 4), yPct: Math.min(94, item.layer.yPct + 4) });
          nextSel.add(layerKeyOf('graphic', nid));
          activeSelectionKind = 'graphic';
          activeLayerId = nid;
        } else {
          addTexts.push({ ...structuredClone(item.layer), id: nid, face, xPct: Math.min(94, item.layer.xPct + 4), yPct: Math.min(94, item.layer.yPct + 4) });
          nextSel.add(layerKeyOf('text', nid));
          activeSelectionKind = 'text';
          activeLayerId = nid;
        }
      }
      selectedLayerKeys.clear();
      nextSel.forEach((k) => selectedLayerKeys.add(k));
      return {
        ...c,
        shapeLayers: [...(c.shapeLayers ?? []), ...addShapes],
        graphicLayers: [...(c.graphicLayers ?? []), ...addGraphics],
        textLayers: [...(c.textLayers ?? []), ...addTexts],
      };
    });
  };

  const nudgeSelectedLayers = (dxPct: number, dyPct: number) => {
    const keys = new Set(getSelectedLayersList());
    mutateCover(actions, (c) => {
      const clampX = (v: number) => Number(Math.max(4, Math.min(96, v + dxPct)).toFixed(2));
      const clampY = (v: number) => Number(Math.max(4, Math.min(96, v + dyPct)).toFixed(2));
      const nextElements = { ...c.elements };
      for (const key of ['edition', 'title', 'subtitle', 'author', 'signature'] as CoverElementKey[]) {
        if (keys.has(layerKeyOf('element', key))) {
          nextElements[key] = { ...nextElements[key], xPct: clampX(nextElements[key].xPct), yPct: clampY(nextElements[key].yPct) };
        }
      }
      return {
        ...c,
        elements: nextElements,
        shapeLayers: (c.shapeLayers ?? []).map((s) => (keys.has(layerKeyOf('shape', s.id)) ? { ...s, xPct: clampX(s.xPct), yPct: clampY(s.yPct) } : s)),
        graphicLayers: (c.graphicLayers ?? []).map((g) => (keys.has(layerKeyOf('graphic', g.id)) ? { ...g, xPct: clampX(g.xPct), yPct: clampY(g.yPct) } : g)),
        textLayers: (c.textLayers ?? []).map((t) => (keys.has(layerKeyOf('text', t.id)) ? { ...t, xPct: clampX(t.xPct), yPct: clampY(t.yPct) } : t)),
      };
    });
  };

  const startInlineTextEdit = (
    faceEl: HTMLElement,
    initialText: string,
    xPct: number,
    yPct: number,
    fontSize: number,
    fontFamily: string,
    color: string,
    align: 'left' | 'center' | 'right',
    onCommit: (nextVal: string) => void,
  ) => {
    const existing = faceEl.querySelector('.qv-inline-text-editor');
    if (existing) existing.remove();
    const editor = el('textarea', {
      className: 'qv-inline-text-editor',
      attrs: { rows: 2 },
      style: {
        left: `${xPct}%`,
        top: `${yPct}%`,
        fontSize: `${fontSize}px`,
        fontFamily,
        color,
        textAlign: align,
        width: '76%',
      },
    });
    editor.value = initialText;
    let finished = false;
    const finish = (save: boolean) => {
      if (finished) return;
      finished = true;
      const val = editor.value;
      editor.remove();
      if (save && val !== initialText) onCommit(val);
    };
    editor.addEventListener('pointerdown', (e) => e.stopPropagation());
    editor.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') {
        finish(false);
      } else if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        finish(true);
      }
    });
    editor.addEventListener('blur', () => finish(true));
    faceEl.appendChild(editor);
    requestAnimationFrame(() => {
      editor.focus();
      editor.select();
    });
  };

  const renderFaceLayers = (faceEl: HTMLElement, face: CoverFaceId) => {
    faceEl.addEventListener('dragover', (e) => {
      if (e.dataTransfer?.types.includes('Files')) e.preventDefault();
    });
    faceEl.addEventListener('drop', async (e) => {
      const file = e.dataTransfer?.files?.[0];
      if (!file) return;
      e.preventDefault();
      await addDroppedGraphicToFace(face, file);
    });

    if (showGridOverlay) {
      faceEl.appendChild(
        el('div', {
          className: 'qv-cover-grid-overlay',
          style: {
            backgroundSize: `${gridStepPct}% ${gridStepPct}%`,
          },
        }),
      );
    }

    if (showBleedGuides) {
      faceEl.appendChild(
        el('div', {
          className: 'qv-cover-bleed-guide',
          attrs: { 'aria-hidden': 'true' },
        }),
      );
    }

    const getSiblingBoxesForFace = (excludeKey: string): WorldBox[] => {
      const boxes: WorldBox[] = [];
      for (const s of shapeLayers) {
        if (s.face !== face || s.visible === false) continue;
        const k = layerKeyOf('shape', s.id);
        if (k === excludeKey) continue;
        boxes.push({ id: k, left: s.xPct - s.widthPct / 2, top: s.yPct - s.heightPct / 2, width: s.widthPct, height: s.heightPct });
      }
      for (const g of graphicLayers) {
        if (g.face !== face || g.visible === false) continue;
        const k = layerKeyOf('graphic', g.id);
        if (k === excludeKey) continue;
        boxes.push({ id: k, left: g.xPct - g.widthPct / 2, top: g.yPct - 10, width: g.widthPct, height: 20 });
      }
      for (const tl of textLayers) {
        if (tl.face !== face || tl.visible === false) continue;
        const k = layerKeyOf('text', tl.id);
        if (k === excludeKey) continue;
        boxes.push({ id: k, left: tl.xPct - 14, top: tl.yPct - 4, width: 28, height: 8 });
      }
      return boxes;
    };

    const bindMagneticDrag = (
      node: HTMLElement,
      layerKey: string,
      boxW: number,
      boxH: number,
      isLocked: boolean | undefined,
      getRot: () => number,
      getFlip: () => [boolean, boolean],
      onSelect: (additive: boolean) => void,
      onCommit: (xPct: number, yPct: number) => void,
    ) => {
      let dragging = false;
      let startX = 0;
      let startY = 0;
      let lastX = 50;
      let lastY = 50;
      node.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        e.stopPropagation();
        const additive = e.shiftKey;
        onSelect(additive);
        if (isLocked) {
          actions.notify('Layer is locked. Unlock it in Layers or right-click menu.');
          return;
        }
        dragging = true;
        startX = e.clientX;
        startY = e.clientY;
        lastX = parseFloat(node.style.left) || 50;
        lastY = parseFloat(node.style.top) || 50;
        try {
          node.setPointerCapture(e.pointerId);
        } catch {
          // Ignore
        }
      });
      node.addEventListener('pointermove', (e) => {
        if (!dragging) return;
        const rect = faceEl.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;
        const rawCenterX = Math.max(4, Math.min(96, ((e.clientX - rect.left) / rect.width) * 100));
        const rawCenterY = Math.max(4, Math.min(96, ((e.clientY - rect.top) / rect.height) * 100));
        const coord = new CoordinateSystem({
          artboardWidth: rect.width / studioZoom,
          artboardHeight: rect.height / studioZoom,
          zoom: studioZoom,
        });
        const snapRes = computeStudioSmartSnap(
          {
            id: layerKey,
            left: rawCenterX - boxW / 2,
            top: rawCenterY - boxH / 2,
            width: boxW,
            height: boxH,
          },
          getSiblingBoxesForFace(layerKey),
          coord,
          { disabled: e.ctrlKey || e.metaKey || !snapGridEnabled },
        );
        lastX = Math.max(4, Math.min(96, snapRes.snappedLeftPct + boxW / 2));
        lastY = Math.max(4, Math.min(96, snapRes.snappedTopPct + boxH / 2));
        const [fx, fy] = getFlip();
        applyDragToStyle(node, lastX, lastY, getRot(), fx, fy);
        renderSmartGuidesAndBadges(snapRes.guides, snapRes.spacingBadges);
      });
      node.addEventListener('pointerup', (e) => {
        if (!dragging) return;
        dragging = false;
        renderSmartGuidesAndBadges([], []);
        if (Math.hypot(e.clientX - startX, e.clientY - startY) < 2) {
          renderCoverStudio(container, actions);
          return;
        }
        onCommit(lastX, lastY);
      });
      node.addEventListener('pointercancel', () => {
        dragging = false;
        renderSmartGuidesAndBadges([], []);
      });
    };

    const appendSelectionHandles = (
      node: HTMLElement,
      opts?: {
        initialW?: number;
        initialH?: number;
        initialRot?: number;
        onResize?: (wPct: number, hPct: number) => void;
        onRotate?: (deg: number, commit: boolean) => void;
      },
    ) => {
      const box = el('div', { className: 'qv-cover-sel-box' });
      const dirs = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const;
      for (const dir of dirs) {
        box.appendChild(
          el('span', {
            className: `qv-cover-handle is-${dir}`,
            attrs: { title: opts?.onResize ? 'Drag to resize (Shift: free stretch, Alt: from center)' : '' },
            on: opts?.onResize
              ? {
                  pointerdown: (e) => {
                    e.stopPropagation();
                    const startX = e.clientX;
                    const startY = e.clientY;
                    const faceRect = faceEl.getBoundingClientRect();
                    const bw = opts.initialW ?? 30;
                    const bh = opts.initialH ?? 20;
                    const target = e.currentTarget as HTMLElement;
                    target.setPointerCapture?.(e.pointerId);
                    const onMove = (mv: PointerEvent) => {
                      if (faceRect.width <= 0 || faceRect.height <= 0) return;
                      const symMul = mv.altKey ? 2 : 1;
                      const dxPct = (((mv.clientX - startX) / faceRect.width) * 100) * symMul;
                      const dyPct = (((mv.clientY - startY) / faceRect.height) * 100) * symMul;
                      const signX = dir.includes('w') ? -1 : dir === 'n' || dir === 's' ? 0 : 1;
                      const signY = dir.includes('n') ? -1 : dir === 'e' || dir === 'w' ? 0 : 1;
                      let nw = Math.max(4, Math.min(100, bw + dxPct * signX));
                      let nh = Math.max(2, Math.min(100, bh + dyPct * signY));
                      // Keep proportional scale on corner drag unless Shift is held
                      if (!mv.shiftKey && signX !== 0 && signY !== 0 && bh > 0) {
                        const scale = nw / Math.max(1, bw);
                        nh = Math.max(2, Math.min(100, bh * scale));
                      }
                      opts.onResize?.(Number(nw.toFixed(1)), Number(nh.toFixed(1)));
                    };
                    const onUp = () => {
                      window.removeEventListener('pointermove', onMove);
                      window.removeEventListener('pointerup', onUp);
                      renderCoverStudio(container, actions);
                    };
                    window.addEventListener('pointermove', onMove);
                    window.addEventListener('pointerup', onUp);
                  },
                }
              : undefined,
          }),
        );
      }
      if (opts?.onRotate) {
        const stem = el('span', { className: 'qv-cover-rot-stem' });
        const knob = el('span', {
          className: 'qv-cover-handle-rot',
          attrs: { title: 'Drag to rotate (Shift snaps to 15°)' },
          on: {
            pointerdown: (e) => {
              e.stopPropagation();
              const nodeRect = node.getBoundingClientRect();
              const cx = nodeRect.left + nodeRect.width / 2;
              const cy = nodeRect.top + nodeRect.height / 2;
              const startDeg = opts.initialRot ?? 0;
              const startAng = Math.atan2(e.clientY - cy, e.clientX - cx);
              const tip = el('div', { className: 'qv-rot-tooltip', text: `${Math.round(startDeg)}°` });
              document.body.appendChild(tip);
              let lastDeg = startDeg;
              const target = e.currentTarget as HTMLElement;
              target.setPointerCapture?.(e.pointerId);
              const onMove = (mv: PointerEvent) => {
                const curAng = Math.atan2(mv.clientY - cy, mv.clientX - cx);
                let delta = ((curAng - startAng) * 180) / Math.PI;
                let deg = startDeg + delta;
                if (mv.shiftKey) deg = Math.round(deg / 15) * 15;
                lastDeg = Math.round(((deg + 180) % 360 + 360) % 360 - 180);
                tip.textContent = `${lastDeg}°`;
                tip.style.left = `${Math.round(mv.clientX + 12)}px`;
                tip.style.top = `${Math.round(mv.clientY - 10)}px`;
                opts.onRotate?.(lastDeg, false);
              };
              const onUp = () => {
                tip.remove();
                window.removeEventListener('pointermove', onMove);
                window.removeEventListener('pointerup', onUp);
                opts.onRotate?.(lastDeg, true);
              };
              window.addEventListener('pointermove', onMove);
              window.addEventListener('pointerup', onUp);
            },
          },
        });
        box.append(stem, knob);
      }
      node.appendChild(box);
    };

    const buildVectorShapeGraphic = (s: CoverShapeLayer): SVGSVGElement => {
      const svg = svgEl('svg', { viewBox: '0 0 100 100', preserveAspectRatio: 'none' });
      svg.style.width = '100%';
      svg.style.height = '100%';
      svg.style.display = 'block';
      const fill = !s.fillColor || s.fillColor === 'transparent' ? 'none' : s.fillColor;
      const stroke = s.strokeWidth > 0 && s.strokeColor ? s.strokeColor : 'none';
      const sw = String(Math.max(0, s.strokeWidth));
      let points = '50,4 96,96 4,96';
      if (s.shape === 'arrow') {
        points = '4,30 62,30 62,10 96,50 62,90 62,70 4,70';
      } else if (s.shape === 'star') {
        const pts: string[] = [];
        for (let i = 0; i < 10; i++) {
          const ang = (i * Math.PI * 2) / 10 - Math.PI / 2;
          const r = i % 2 === 0 ? 46 : 20;
          pts.push(`${(50 + Math.cos(ang) * r).toFixed(1)},${(50 + Math.sin(ang) * r).toFixed(1)}`);
        }
        points = pts.join(' ');
      } else if (s.shape === 'polygon') {
        const pts: string[] = [];
        for (let i = 0; i < 6; i++) {
          const ang = (i * Math.PI * 2) / 6 - Math.PI / 2;
          pts.push(`${(50 + Math.cos(ang) * 46).toFixed(1)},${(50 + Math.sin(ang) * 46).toFixed(1)}`);
        }
        points = pts.join(' ');
      }
      svg.appendChild(svgEl('polygon', { points, fill, stroke, 'stroke-width': sw, 'vector-effect': 'non-scaling-stroke' }));
      return svg;
    };

    // Vector Shape Layers (sorted by zIndex)
    for (const s of [...shapeLayers]
      .filter((item) => item.face === face && item.visible !== false)
      .sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0))) {
      const k = layerKeyOf('shape', s.id);
      const isSelected = selectedLayerKeys.has(k) || (activeSelectionKind === 'shape' && activeLayerId === s.id);
      const isPolyVector = s.shape === 'triangle' || s.shape === 'arrow' || s.shape === 'star' || s.shape === 'polygon';
      const shapeNode = el('div', {
        className: `bv-cover-drag-item qv-cover-shape${isSelected ? ' is-selected' : ''}`,
        attrs: { 'data-shape-id': s.id, 'data-layer-key': k },
        style: {
          left: `${s.xPct}%`,
          top: `${s.yPct}%`,
          width: `${s.widthPct}%`,
          height: s.shape === 'line' ? `${Math.max(2, s.strokeWidth || 2)}px` : `${s.heightPct}%`,
          opacity: String(s.opacity),
          mixBlendMode: s.blendMode || 'normal',
          zIndex: String(2 + (s.zIndex ?? 0)),
          transform: `translate(-50%, -50%) rotate(${s.rotationDeg}deg)`,
          borderRadius: isPolyVector ? '0px' : s.shape === 'circle' || s.shape === 'badge' ? '999px' : `${s.cornerRadius}px`,
          background: isPolyVector
            ? 'transparent'
            : s.shape === 'line'
              ? s.strokeColor
              : s.gradientEndColor
                ? `linear-gradient(135deg, ${s.fillColor}, ${s.gradientEndColor})`
                : s.fillColor,
          border: !isPolyVector && s.shape !== 'line' && s.strokeWidth > 0 ? `${s.strokeWidth}px solid ${s.strokeColor}` : 'none',
          padding: isPolyVector ? '0' : undefined,
        },
      });
      if (isPolyVector) {
        shapeNode.appendChild(buildVectorShapeGraphic(s));
      }
      if (isSelected) {
        appendSelectionHandles(shapeNode, {
          initialW: s.widthPct,
          initialH: s.heightPct,
          initialRot: s.rotationDeg,
          onResize: (nw, nh) => {
            shapeNode.style.width = `${nw}%`;
            if (s.shape !== 'line') shapeNode.style.height = `${nh}%`;
            mutateCover(actions, (c) => ({
              ...c,
              shapeLayers: (c.shapeLayers ?? []).map((item) =>
                item.id === s.id ? { ...item, widthPct: nw, heightPct: nh } : item,
              ),
            }), false, false);
          },
          onRotate: (deg, commit) => {
            applyDragToStyle(shapeNode, s.xPct, s.yPct, deg, false, false);
            mutateCover(actions, (c) => ({
              ...c,
              shapeLayers: (c.shapeLayers ?? []).map((item) =>
                item.id === s.id ? { ...item, rotationDeg: deg } : item,
              ),
            }), commit, commit);
          },
        });
      }
      bindMagneticDrag(
        shapeNode,
        k,
        s.widthPct,
        s.heightPct,
        s.locked,
        () => s.rotationDeg,
        () => [false, false],
        (additive) => {
          setSingleSelection(cover, 'shape', s.id, additive);
          activeInspectorTab = 'properties';
        },
        (nx, ny) =>
          mutateCover(actions, (c) => ({
            ...c,
            shapeLayers: (c.shapeLayers ?? []).map((item) =>
              item.id === s.id ? { ...item, xPct: nx, yPct: ny } : item,
            ),
          })),
      );
      attachLayerContextMenu(shapeNode, 'shape', s.id, s.locked ?? false);
      faceEl.appendChild(shapeNode);
    }

    // Graphic SVG / PNG Layers (sorted by zIndex)
    for (const gLayer of [...graphicLayers]
      .filter((item) => item.face === face && item.visible !== false)
      .sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0))) {
      const k = layerKeyOf('graphic', gLayer.id);
      const isSelected = selectedLayerKeys.has(k) || (activeSelectionKind === 'graphic' && activeLayerId === gLayer.id);
      const sx = gLayer.flipX ? -1 : 1;
      const sy = gLayer.flipY ? -1 : 1;
      const filterStr = `brightness(${gLayer.brightnessPct ?? 100}%) contrast(${gLayer.contrastPct ?? 100}%) saturate(${gLayer.saturationPct ?? 100}%) blur(${gLayer.blurPx ?? 0}px)`;
      const gNode = el(
        'div',
        {
          className: `bv-cover-drag-item bv-cover-graphic-layer${isSelected ? ' is-selected' : ''}`,
          attrs: { 'data-graphic-id': gLayer.id, 'data-layer-key': k },
          style: {
            left: `${gLayer.xPct}%`,
            top: `${gLayer.yPct}%`,
            width: `${gLayer.widthPct}%`,
            opacity: String(gLayer.opacity),
            mixBlendMode: gLayer.blendMode || 'normal',
            zIndex: String(2 + (gLayer.zIndex ?? 0)),
            transform: `translate(-50%, -50%) rotate(${gLayer.rotationDeg}deg) scale(${sx}, ${sy})`,
            filter: filterStr,
            borderRadius: gLayer.borderRadiusPct ? `${gLayer.borderRadiusPct}%` : undefined,
            overflow: gLayer.borderRadiusPct ? 'hidden' : undefined,
          },
        },
        el('img', {
          attrs: { src: gLayer.dataUrl, alt: gLayer.name },
          style: { width: '100%', height: 'auto', display: 'block', pointerEvents: 'none' },
        }),
      );
      if (isSelected) {
        appendSelectionHandles(gNode, {
          initialW: gLayer.widthPct,
          initialH: gLayer.widthPct,
          initialRot: gLayer.rotationDeg,
          onResize: (nw) => {
            const clamped = Math.max(8, Math.min(95, nw));
            gNode.style.width = `${clamped}%`;
            mutateCover(actions, (c) => ({
              ...c,
              graphicLayers: (c.graphicLayers ?? []).map((item) =>
                item.id === gLayer.id ? { ...item, widthPct: clamped } : item,
              ),
            }), false, false);
          },
          onRotate: (deg, commit) => {
            applyDragToStyle(gNode, gLayer.xPct, gLayer.yPct, deg, Boolean(gLayer.flipX), Boolean(gLayer.flipY));
            mutateCover(actions, (c) => ({
              ...c,
              graphicLayers: (c.graphicLayers ?? []).map((item) =>
                item.id === gLayer.id ? { ...item, rotationDeg: deg } : item,
              ),
            }), commit, commit);
          },
        });
      }
      bindMagneticDrag(
        gNode,
        k,
        gLayer.widthPct,
        20,
        gLayer.locked,
        () => gLayer.rotationDeg,
        () => [Boolean(gLayer.flipX), Boolean(gLayer.flipY)],
        (additive) => {
          setSingleSelection(cover, 'graphic', gLayer.id, additive);
          activeInspectorTab = 'properties';
        },
        (nx, ny) =>
          mutateCover(actions, (c) => ({
            ...c,
            graphicLayers: (c.graphicLayers ?? []).map((item) =>
              item.id === gLayer.id ? { ...item, xPct: nx, yPct: ny } : item,
            ),
          })),
      );
      attachLayerContextMenu(gNode, 'graphic', gLayer.id, gLayer.locked ?? false);
      faceEl.appendChild(gNode);
    }

    // Custom Typography Layers (sorted by zIndex + live artboard double-click edit)
    for (const tl of [...textLayers]
      .filter((item) => item.face === face && item.visible !== false)
      .sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0))) {
      const k = layerKeyOf('text', tl.id);
      const isSelected = selectedLayerKeys.has(k) || (activeSelectionKind === 'text' && activeLayerId === tl.id);
      const layerFont = tl.fontFamily ? resolveEffectiveFontCss('garamond', tl.fontFamily) : fontCss;
      const tNode = el('div', {
        className: `bv-cover-drag-item${isSelected ? ' is-selected' : ''}`,
        attrs: { 'data-text-id': tl.id, 'data-layer-key': k },
        text: tl.uppercase ? tl.text.toUpperCase() : tl.text,
        style: {
          left: `${tl.xPct}%`,
          top: `${tl.yPct}%`,
          fontSize: `${tl.fontSize}px`,
          fontFamily: layerFont,
          color: tl.color,
          backgroundColor: tl.backgroundColor && tl.backgroundColor !== 'transparent' ? tl.backgroundColor : undefined,
          textDecoration: tl.textDecoration || 'none',
          textAlign: tl.align,
          fontWeight: tl.fontWeight,
          fontStyle: tl.italic ? 'italic' : 'normal',
          letterSpacing: `${tl.letterSpacingEm}em`,
          lineHeight: String(tl.lineHeight),
          opacity: String(tl.opacity),
          mixBlendMode: tl.blendMode || 'normal',
          zIndex: String(2 + (tl.zIndex ?? 0)),
          transform: `translate(-50%, -50%) rotate(${tl.rotationDeg}deg)`,
          textShadow: tl.shadowBlur ? `0 2px ${tl.shadowBlur}px rgba(0,0,0,0.6)` : 'none',
          webkitTextStroke: tl.strokeWidth ? `${tl.strokeWidth}px ${tl.strokeColor || '#000'}` : undefined,
        },
        on: {
          dblclick: (e) => {
            e.stopPropagation();
            setSingleSelection(cover, 'text', tl.id, false);
            startInlineTextEdit(
              faceEl,
              tl.text,
              tl.xPct,
              tl.yPct,
              tl.fontSize,
              layerFont,
              tl.color,
              tl.align,
              (nextText) =>
                mutateCover(actions, (c) => ({
                  ...c,
                  textLayers: (c.textLayers ?? []).map((item) => (item.id === tl.id ? { ...item, text: nextText } : item)),
                })),
            );
          },
        },
      });
      if (isSelected) {
        appendSelectionHandles(tNode, {
          initialW: tl.fontSize * 2,
          initialH: tl.fontSize * 2,
          initialRot: tl.rotationDeg,
          onResize: (nw) => {
            const nextFont = Math.max(8, Math.min(72, Math.round(nw / 2)));
            tNode.style.fontSize = `${nextFont}px`;
            mutateCover(actions, (c) => ({
              ...c,
              textLayers: (c.textLayers ?? []).map((item) =>
                item.id === tl.id ? { ...item, fontSize: nextFont } : item,
              ),
            }), false, false);
          },
          onRotate: (deg, commit) => {
            applyDragToStyle(tNode, tl.xPct, tl.yPct, deg, false, false);
            mutateCover(actions, (c) => ({
              ...c,
              textLayers: (c.textLayers ?? []).map((item) =>
                item.id === tl.id ? { ...item, rotationDeg: deg } : item,
              ),
            }), commit, commit);
          },
        });
      }
      bindMagneticDrag(
        tNode,
        k,
        28,
        8,
        tl.locked,
        () => tl.rotationDeg,
        () => [false, false],
        (additive) => {
          setSingleSelection(cover, 'text', tl.id, additive);
          activeInspectorTab = 'properties';
        },
        (nx, ny) =>
          mutateCover(actions, (c) => ({
            ...c,
            textLayers: (c.textLayers ?? []).map((item) =>
              item.id === tl.id ? { ...item, xPct: nx, yPct: ny } : item,
            ),
          })),
      );
      attachLayerContextMenu(tNode, 'text', tl.id, tl.locked ?? false);
      faceEl.appendChild(tNode);
    }

    // Vector Path / Freehand Layers + Desktop Interactive Drawing
    const facePaths = [...pathLayers]
      .filter((p) => p.face === face && p.visible !== false && p.points.length >= 2)
      .sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));

    if (drawBrushMode === 'off') {
      for (const pl of facePaths) {
        const layerSvg = svgEl('svg', {
          className: 'qv-cover-path-overlay',
          viewBox: '0 0 100 100',
          preserveAspectRatio: 'none',
        });
        layerSvg.style.position = 'absolute';
        layerSvg.style.inset = '0';
        layerSvg.style.width = '100%';
        layerSvg.style.height = '100%';
        layerSvg.style.zIndex = String(2 + (pl.zIndex ?? 0));
        layerSvg.style.pointerEvents = 'none';

        const d =
          pl.points.map((pt, idx) => `${idx === 0 ? 'M' : 'L'} ${pt.xPct.toFixed(2)} ${pt.yPct.toFixed(2)}`).join(' ') +
          (pl.closed ? ' Z' : '');
        const isSel = activeSelectionKind === 'path' && activeLayerId === pl.id;
        const pNode = svgEl('path', {
          d,
          fill: pl.fillColor && pl.fillColor !== 'transparent' ? pl.fillColor : 'none',
          stroke: pl.strokeColor,
          'stroke-width': String(Math.max(0.4, pl.strokeWidth * 0.35)),
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
          opacity: String(pl.opacity),
          'vector-effect': 'non-scaling-stroke',
        });
        if (pl.blendMode && pl.blendMode !== 'normal') {
          pNode.style.mixBlendMode = pl.blendMode;
        }
        pNode.style.pointerEvents = 'stroke';
        pNode.style.cursor = 'pointer';
        if (isSel) {
          pNode.setAttribute('filter', 'drop-shadow(0 0 2px #3b82f6)');
        }
        pNode.addEventListener('pointerdown', (e) => {
          e.stopPropagation();
          setSingleSelection(cover, 'path', pl.id, false);
          activeInspectorTab = 'properties';
          renderCoverStudio(container, actions);
        });
        layerSvg.appendChild(pNode);
        faceEl.appendChild(layerSvg);
      }
    }

    if (isDesktopProCover && drawBrushMode !== 'off' && activeTargetFace() === face) {
      const pathOverlaySvg = svgEl('svg', {
        className: 'qv-cover-path-overlay',
        viewBox: '0 0 100 100',
        preserveAspectRatio: 'none',
      });
      pathOverlaySvg.style.position = 'absolute';
      pathOverlaySvg.style.inset = '0';
      pathOverlaySvg.style.width = '100%';
      pathOverlaySvg.style.height = '100%';
      pathOverlaySvg.style.zIndex = '500';
      pathOverlaySvg.style.pointerEvents = 'auto';
      pathOverlaySvg.style.cursor = 'crosshair';

      for (const pl of facePaths) {
        const d =
          pl.points.map((pt, idx) => `${idx === 0 ? 'M' : 'L'} ${pt.xPct.toFixed(2)} ${pt.yPct.toFixed(2)}`).join(' ') +
          (pl.closed ? ' Z' : '');
        const pNode = svgEl('path', {
          d,
          fill: pl.fillColor && pl.fillColor !== 'transparent' ? pl.fillColor : 'none',
          stroke: pl.strokeColor,
          'stroke-width': String(Math.max(0.4, pl.strokeWidth * 0.35)),
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
          opacity: String(pl.opacity),
          'vector-effect': 'non-scaling-stroke',
        });
        pathOverlaySvg.appendChild(pNode);
      }

      if (drawBrushMode === 'pen' && pendingPenPoints.length > 0 && activeTargetFace() === face) {
        const draftD = pendingPenPoints.map((pt, idx) => `${idx === 0 ? 'M' : 'L'} ${pt.xPct.toFixed(2)} ${pt.yPct.toFixed(2)}`).join(' ');
        pathOverlaySvg.appendChild(
          svgEl('path', {
            d: draftD,
            fill: 'none',
            stroke: drawStrokeColor,
            'stroke-width': String(Math.max(1, drawStrokeWidth)),
            'stroke-dasharray': '3 3',
            'vector-effect': 'non-scaling-stroke',
          }),
        );
        for (const pt of pendingPenPoints) {
          pathOverlaySvg.appendChild(
            svgEl('circle', {
              cx: pt.xPct,
              cy: pt.yPct,
              r: '1.1',
              fill: '#ffffff',
              stroke: drawStrokeColor,
              'stroke-width': '0.4',
            }),
          );
        }
      }

      const toPct = (ev: PointerEvent): CoverPathPoint => {
        const rect = pathOverlaySvg.getBoundingClientRect();
        return {
          xPct: Math.max(0, Math.min(100, ((ev.clientX - rect.left) / Math.max(1, rect.width)) * 100)),
          yPct: Math.max(0, Math.min(100, ((ev.clientY - rect.top) / Math.max(1, rect.height)) * 100)),
        };
      };

      if (drawBrushMode === 'pen') {
        pathOverlaySvg.addEventListener('pointerdown', (e) => {
          e.stopPropagation();
          pendingPenPoints.push(toPct(e));
          renderCoverStudio(container, actions);
        });
      } else if (drawBrushMode === 'freehand') {
        let activeStroke: CoverPathPoint[] = [];
        let liveEl: SVGPathElement | null = null;
        pathOverlaySvg.addEventListener('pointerdown', (e) => {
          e.stopPropagation();
          pathOverlaySvg.setPointerCapture?.(e.pointerId);
          activeStroke = [toPct(e)];
          liveEl = svgEl('path', {
            d: `M ${activeStroke[0].xPct.toFixed(2)} ${activeStroke[0].yPct.toFixed(2)}`,
            fill: 'none',
            stroke: drawStrokeColor,
            'stroke-width': String(Math.max(1, drawStrokeWidth)),
            'stroke-linecap': 'round',
            'stroke-linejoin': 'round',
            'vector-effect': 'non-scaling-stroke',
          });
          pathOverlaySvg.appendChild(liveEl);
          const onMove = (mv: PointerEvent) => {
            const pt = toPct(mv);
            const last = activeStroke[activeStroke.length - 1];
            if (Math.hypot(pt.xPct - last.xPct, pt.yPct - last.yPct) >= 1.1) {
              activeStroke.push(pt);
              liveEl?.setAttribute(
                'd',
                activeStroke.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.xPct.toFixed(2)} ${p.yPct.toFixed(2)}`).join(' '),
              );
            }
          };
          const onUp = () => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
            if (activeStroke.length >= 2) {
              const created = createPathLayer(face, activeStroke, {
                name: `Brush Stroke ${pathLayers.length + 1}`,
                closed: drawClosedPath,
                strokeColor: drawStrokeColor,
                strokeWidth: drawStrokeWidth,
                fillColor: drawClosedPath ? drawFillColor : 'transparent',
                blendMode: drawBlendMode,
              });
              activeSelectionKind = 'path';
              activeLayerId = created.id;
              mutateCover(actions, (c) => ({ ...c, pathLayers: [...(c.pathLayers ?? []), created] }));
            }
          };
          window.addEventListener('pointermove', onMove);
          window.addEventListener('pointerup', onUp);
        });
      }
      faceEl.appendChild(pathOverlaySvg);
    }

    if (isDesktopProCover) {
      if (commentPinMode && activeTargetFace() === face) {
        faceEl.style.cursor = 'crosshair';
        faceEl.addEventListener(
          'click',
          (ev) => {
            if (!commentPinMode) return;
            const rect = faceEl.getBoundingClientRect();
            const xPct = Math.max(4, Math.min(96, Math.round(((ev.clientX - rect.left) / Math.max(1, rect.width)) * 100)));
            const yPct = Math.max(4, Math.min(96, Math.round(((ev.clientY - rect.top) / Math.max(1, rect.height)) * 100)));
            const author = project.activeAuthorLabel || penName || 'Reviewer';
            commentPinMode = false;
            mutateCover(actions, (c) => ({
              ...c,
              comments: [
                ...(c.comments ?? []),
                {
                  id: newId('cpin'),
                  face,
                  xPct,
                  yPct,
                  author,
                  text: `Cover feedback pin (${xPct}%, ${yPct}%)`,
                  resolved: false,
                  createdAt: new Date().toISOString(),
                },
              ],
            }));
          },
          { once: true },
        );
      }

      comments.forEach((cm, idx) => {
        if (cm.face !== face) return;
        const pin = el('button', {
          className: `qv-cover-pin${cm.resolved ? ' is-resolved' : ''}`,
          text: String(idx + 1),
          attrs: { type: 'button', title: `${cm.author}: ${cm.text}` },
          style: { left: `${cm.xPct}%`, top: `${cm.yPct}%` },
          on: {
            click: (e) => {
              e.stopPropagation();
              activeToolTab = 'collab';
              renderCoverStudio(container, actions);
            },
          },
        });
        faceEl.appendChild(pin);
      });
    }
  };

  const bumpLayerZ = (kind: 'text' | 'shape' | 'graphic' | 'path', id: string, delta: number) => {
    mutateCover(actions, (c) => ({
      ...c,
      textLayers: (c.textLayers ?? []).map((l) => (kind === 'text' && l.id === id ? { ...l, zIndex: (l.zIndex ?? 0) + delta } : l)),
      shapeLayers: (c.shapeLayers ?? []).map((l) => (kind === 'shape' && l.id === id ? { ...l, zIndex: (l.zIndex ?? 0) + delta } : l)),
      graphicLayers: (c.graphicLayers ?? []).map((l) => (kind === 'graphic' && l.id === id ? { ...l, zIndex: (l.zIndex ?? 0) + delta } : l)),
      pathLayers: (c.pathLayers ?? []).map((l) => (kind === 'path' && l.id === id ? { ...l, zIndex: (l.zIndex ?? 0) + delta } : l)),
    }));
  };

  function attachLayerContextMenu(
    node: HTMLElement,
    kind: 'text' | 'shape' | 'graphic',
    id: string,
    locked: boolean,
  ): void {
    attachContextMenu(node, () => [
      {
        heading: 'Cover Layer Actions',
        items: [
          {
            label: 'Bring Forward',
            icon: 'bring-front',
            onSelect: () => bumpLayerZ(kind, id, 1),
          },
          {
            label: 'Send Backward',
            icon: 'send-back',
            onSelect: () => bumpLayerZ(kind, id, -1),
          },
          {
            label: 'Align Center Horizontally',
            icon: 'align-center',
            onSelect: () => {
              if (kind === 'text') {
                mutateCover(actions, (c) => ({
                  ...c,
                  textLayers: (c.textLayers ?? []).map((l) => (l.id === id ? { ...l, xPct: 50 } : l)),
                }));
              } else if (kind === 'shape') {
                mutateCover(actions, (c) => ({
                  ...c,
                  shapeLayers: (c.shapeLayers ?? []).map((l) => (l.id === id ? { ...l, xPct: 50 } : l)),
                }));
              } else {
                mutateCover(actions, (c) => ({
                  ...c,
                  graphicLayers: (c.graphicLayers ?? []).map((l) => (l.id === id ? { ...l, xPct: 50 } : l)),
                }));
              }
            },
          },
          {
            label: 'Duplicate Layer',
            icon: 'copy-layer',
            onSelect: () => {
              const dupId = newId('dup');
              activeSelectionKind = kind;
              activeLayerId = dupId;
              mutateCover(actions, (c) => {
                if (kind === 'text') {
                  const src = (c.textLayers ?? []).find((l) => l.id === id);
                  if (!src) return c;
                  return {
                    ...c,
                    textLayers: [...(c.textLayers ?? []), { ...src, id: dupId, xPct: Math.min(92, src.xPct + 4), yPct: Math.min(92, src.yPct + 4) }],
                  };
                }
                if (kind === 'shape') {
                  const src = (c.shapeLayers ?? []).find((l) => l.id === id);
                  if (!src) return c;
                  return {
                    ...c,
                    shapeLayers: [...(c.shapeLayers ?? []), { ...src, id: dupId, xPct: Math.min(92, src.xPct + 4), yPct: Math.min(92, src.yPct + 4) }],
                  };
                }
                const src = (c.graphicLayers ?? []).find((l) => l.id === id);
                if (!src) return c;
                return {
                  ...c,
                  graphicLayers: [...(c.graphicLayers ?? []), { ...src, id: dupId, xPct: Math.min(92, src.xPct + 4), yPct: Math.min(92, src.yPct + 4) }],
                };
              });
            },
          },
          {
            label: locked ? 'Unlock Position' : 'Lock Position',
            icon: locked ? 'unlock' : 'lock',
            onSelect: () => {
              mutateCover(actions, (c) => ({
                ...c,
                textLayers: (c.textLayers ?? []).map((l) => (kind === 'text' && l.id === id ? { ...l, locked: !locked } : l)),
                shapeLayers: (c.shapeLayers ?? []).map((l) => (kind === 'shape' && l.id === id ? { ...l, locked: !locked } : l)),
                graphicLayers: (c.graphicLayers ?? []).map((l) => (kind === 'graphic' && l.id === id ? { ...l, locked: !locked } : l)),
              }));
            },
          },
        ],
      },
      {
        items: [
          {
            label: 'Delete Layer',
            icon: 'trash',
            danger: true,
            onSelect: () => {
              activeSelectionKind = 'element';
              activeElementKey = 'title';
              activeLayerId = '';
              mutateCover(actions, (c) => ({
                ...c,
                textLayers: (c.textLayers ?? []).filter((l) => !(kind === 'text' && l.id === id)),
                shapeLayers: (c.shapeLayers ?? []).filter((l) => !(kind === 'shape' && l.id === id)),
                graphicLayers: (c.graphicLayers ?? []).filter((l) => !(kind === 'graphic' && l.id === id)),
              }));
            },
          },
        ],
      },
    ]);
  }

  const buildFrontFace = (): HTMLElement => {
    const isWrapMulti = coverWrapMode === 'full-wrap' || coverWrapMode === 'dust-jacket';
    const frontCanvas = el('div', {
      className: `bv-cover-front${isWrapMulti && activeTargetFace() === 'front' ? ' bv-cover-face-active' : ''}`,
      style: {
        width: `${frontW}px`,
        height: `${frontH}px`,
        background: computeCoverBackgroundCss(cover, cover.backgroundColor),
        color: cover.textColor,
        fontFamily: fontCss,
      },
      on: {
        pointerdown: (e) => {
          const tgt = e.target as HTMLElement;
          if (tgt.closest('.bv-cover-drag-item') || tgt.closest('.qv-cover-handle') || tgt.closest('.qv-cover-pin')) return;
          activeEditFace = 'front';
        },
      },
    });

    if (cover.backgroundImageDataUrl) {
      frontCanvas.appendChild(
        el('img', {
          attrs: { src: cover.backgroundImageDataUrl, alt: 'Cover artwork' },
          style: {
            position: 'absolute',
            inset: '0',
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            pointerEvents: 'none',
            filter: `brightness(${cover.bgBrightnessPct ?? 100}%) contrast(${cover.bgContrastPct ?? 100}%) blur(${cover.bgBlurPx ?? 0}px)`,
          },
        }),
      );
      frontCanvas.appendChild(
        el('div', {
          className: 'bv-cover-bg-dim',
          style: { position: 'absolute', inset: '0', background: cover.backgroundColor, opacity: String(cover.imageOverlayOpacity), pointerEvents: 'none' },
        }),
      );
    }

    if (cover.template === 'obsidian-foil' || cover.template === 'ivory-classic') {
      frontCanvas.appendChild(
        el('div', {
          style: { position: 'absolute', inset: '24px', border: `1.5px solid ${cover.accentColor}`, pointerEvents: 'none' },
        }),
      );
    } else if (cover.template === 'editorial-band') {
      frontCanvas.appendChild(
        el('div', {
          style: { position: 'absolute', left: '0', right: '0', top: '62%', height: '6px', background: cover.accentColor, pointerEvents: 'none' },
        }),
      );
    } else if (cover.template === 'minimal-spine') {
      frontCanvas.appendChild(
        el('div', {
          style: { position: 'absolute', left: '24px', top: '24px', bottom: '24px', width: '5px', background: cover.accentColor, pointerEvents: 'none' },
        }),
      );
    }

    renderFaceLayers(frontCanvas, 'front');
    frontCanvas.append(guideV, guideH, badgeOverlay);

    const makeDraggableElement = (key: CoverElementKey, content: HTMLElement | string) => {
      const placement = cover.elements[key];
      if (!placement.visible) return;
      let dragging = false;
      let startX = 0;
      let startY = 0;
      const isElemSelected = activeSelectionKind === 'element' && activeElementKey === key;
      const selFrame = isElemSelected
        ? el(
            'div',
            { className: 'qv-cover-sel-box' },
            el('span', { className: 'qv-cover-handle is-nw' }),
            el('span', { className: 'qv-cover-handle is-ne' }),
            el('span', { className: 'qv-cover-handle is-se' }),
            el('span', { className: 'qv-cover-handle is-sw' }),
          )
        : null;
      const node = el(
        'div',
        {
          className: `bv-cover-drag-item${isElemSelected ? ' is-selected' : ''}`,
          attrs: { 'data-cover-el': key },
          style: {
            left: `${placement.xPct}%`,
            top: `${placement.yPct}%`,
            fontSize: `${placement.fontSize}px`,
            textAlign: placement.align,
            color: placement.color,
            opacity: String(placement.opacity ?? 1),
            letterSpacing: placement.letterSpacingEm !== undefined ? `${placement.letterSpacingEm}em` : undefined,
          },
          on: {
            pointerdown: (e) => {
              if (e.button !== 0) return;
              e.stopPropagation();
              activeEditFace = 'front';
              activeFaceElementKey = '';
              activeSelectionKind = 'element';
              activeElementKey = key;
              activeLayerId = '';
              activeInspectorTab = 'properties';
              if (placement.locked) {
                setSingleSelection(cover, 'element', key, e.shiftKey);
                renderCoverStudio(container, actions);
                return;
              }
              dragging = true;
              startX = e.clientX;
              startY = e.clientY;
              try {
                node.setPointerCapture(e.pointerId);
              } catch {
                // Ignore
              }
            },
            pointermove: (e) => {
              if (!dragging) return;
              const rect = frontCanvas.getBoundingClientRect();
              const rawX = Math.max(8, Math.min(92, ((e.clientX - rect.left) / rect.width) * 100));
              const rawY = Math.max(6, Math.min(94, ((e.clientY - rect.top) / rect.height) * 100));
              const snapped = computeSmartAlignSnap(rawX, rawY, { snapGrid: snapGridEnabled, gridStepPct });
              applyDragToStyle(node, snapped.xPct, snapped.yPct);
              placement.xPct = snapped.xPct;
              placement.yPct = snapped.yPct;
              guideV.style.display = snapped.guideX !== null ? 'block' : 'none';
              if (snapped.guideX !== null) guideV.style.left = `${snapped.guideX}%`;
              guideH.style.display = snapped.guideY !== null ? 'block' : 'none';
              if (snapped.guideY !== null) guideH.style.top = `${snapped.guideY}%`;
            },
            pointerup: (e) => {
              if (!dragging) return;
              dragging = false;
              guideV.style.display = 'none';
              guideH.style.display = 'none';
              if (Math.hypot(e.clientX - startX, e.clientY - startY) < 2) {
                setSingleSelection(cover, 'element', key, e.shiftKey);
                renderCoverStudio(container, actions);
                return;
              }
              mutateCover(actions, (c) => ({
                ...c,
                elements: { ...c.elements, [key]: { ...c.elements[key], xPct: placement.xPct, yPct: placement.yPct } },
              }));
            },
            dblclick: (e) => {
              if (key === 'signature') return;
              e.stopPropagation();
              const initialVal =
                key === 'title'
                  ? project.title
                  : key === 'subtitle'
                    ? project.subtitle
                    : key === 'author'
                      ? penName
                      : cover.editionLabel;
              startInlineTextEdit(
                frontCanvas,
                initialVal,
                placement.xPct,
                placement.yPct,
                placement.fontSize,
                fontCss,
                placement.color || cover.textColor,
                placement.align,
                (nextVal) => {
                  if (key === 'edition') {
                    mutateCover(actions, (c) => ({ ...c, editionLabel: nextVal }));
                  } else {
                    actions.mutateProject((prev) => {
                      if (key === 'title') return { ...prev, title: nextVal };
                      if (key === 'subtitle') return { ...prev, subtitle: nextVal };
                      const next = normalizeProjectDefaults(prev);
                      if (next.authorIdentity) next.authorIdentity.penName = nextVal;
                      return { ...next, author: nextVal };
                    });
                  }
                },
              );
            },
          },
        },
        content,
      );
      attachContextMenu(node, () => [
        {
          heading: `Element: ${key}`,
          items: [
            {
              label: 'Center Horizontally',
              icon: 'align-center',
              onSelect: () =>
                mutateCover(actions, (c) => ({
                  ...c,
                  elements: { ...c.elements, [key]: { ...c.elements[key], xPct: 50 } },
                })),
            },
            {
              label: placement.locked ? 'Unlock Position' : 'Lock Position',
              icon: placement.locked ? 'unlock' : 'lock',
              onSelect: () =>
                mutateCover(actions, (c) => ({
                  ...c,
                  elements: { ...c.elements, [key]: { ...c.elements[key], locked: !placement.locked } },
                })),
            },
            {
              label: 'Hide Element',
              icon: 'eye-off',
              onSelect: () =>
                mutateCover(actions, (c) => ({
                  ...c,
                  elements: { ...c.elements, [key]: { ...c.elements[key], visible: false } },
                })),
            },
          ],
        },
      ]);
      if (selFrame) node.appendChild(selFrame);
      frontCanvas.appendChild(node);
    };

    makeDraggableElement(
      'edition',
      el('div', {
        text: cover.editionLabel,
        style: { letterSpacing: '0.16em', textTransform: 'uppercase', color: cover.elements.edition.color || cover.accentColor, fontWeight: '600' },
      }),
    );
    makeDraggableElement('title', el('div', { text: project.title, style: { fontWeight: cover.elements.title.fontWeight || '600', lineHeight: '1.12' } }));
    makeDraggableElement('subtitle', el('div', { text: project.subtitle, style: { fontStyle: 'italic', opacity: '0.88' } }));
    makeDraggableElement(
      'author',
      el('div', { text: penName, style: { letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: '600' } }),
    );
    if (identity.signatureSvgDataUrl) {
      makeDraggableElement(
        'signature',
        el('img', {
          attrs: { src: identity.signatureSvgDataUrl, alt: `${penName} signature` },
          style: { maxWidth: '120px', maxHeight: '48px', pointerEvents: 'none' },
        }),
      );
    } else if (identity.signatureText) {
      makeDraggableElement(
        'signature',
        el('div', { text: identity.signatureText, style: { fontStyle: 'italic', color: cover.accentColor } }),
      );
    }

    return frontCanvas;
  };

  const buildBackFace = (): HTMLElement => {
    const isWrapMulti = coverWrapMode === 'full-wrap' || coverWrapMode === 'dust-jacket';
    const selectFaceField = (fieldKey: FaceEditableFieldKey, ev: Event) => {
      ev.stopPropagation();
      clearCoverSelection();
      activeEditFace = 'back';
      activeFaceElementKey = fieldKey;
      activeInspectorTab = 'properties';
      renderCoverStudio(container, actions);
    };
    const back = el('div', {
      className: `bv-cover-back${isWrapMulti && activeTargetFace() === 'back' ? ' bv-cover-face-active' : ''}`,
      style: {
        width: `${frontW}px`,
        height: `${frontH}px`,
        background: cover.backBackgroundColor || cover.backgroundColor,
        color: cover.textColor,
        fontFamily: fontCss,
      },
      on: {
        pointerdown: (e) => {
          const tgt = e.target as HTMLElement;
          if (tgt.closest('.bv-cover-drag-item') || tgt.closest('.bv-cover-editable-block') || tgt.closest('.qv-cover-handle') || tgt.closest('.qv-cover-pin')) return;
          activeEditFace = 'back';
        },
      },
    });
    renderFaceLayers(back, 'back');
    back.append(
      el('div', {
        className: `bv-cover-editable-block${activeFaceElementKey === 'back-headline' ? ' is-selected' : ''}`,
        text: cover.backHeadline || project.title,
        style: { fontSize: '18px', fontWeight: '600', color: cover.accentColor, lineHeight: '1.2', position: 'relative', zIndex: '3' },
        on: { click: (e) => selectFaceField('back-headline', e) },
      }),
      el('p', {
        className: `bv-cover-editable-block${activeFaceElementKey === 'back-blurb' ? ' is-selected' : ''}`,
        text: cover.backBlurb || 'Click to edit back cover blurb…',
        style: { margin: '0', fontSize: '13px', lineHeight: '1.6', opacity: cover.backBlurb ? '0.9' : '0.45', position: 'relative', zIndex: '3' },
        on: { click: (e) => selectFaceField('back-blurb', e) },
      }),
      el('p', {
        className: `bv-cover-editable-block${activeFaceElementKey === 'author-bio' ? ' is-selected' : ''}`,
        text: cover.authorBio || 'Click to add author bio…',
        style: {
          margin: 'auto 0 0',
          fontSize: '11.5px',
          lineHeight: '1.5',
          opacity: cover.authorBio ? '0.72' : '0.42',
          borderTop: '1px solid rgba(255,255,255,0.12)',
          paddingTop: '10px',
          position: 'relative',
          zIndex: '3',
        },
        on: { click: (e) => selectFaceField('author-bio', e) },
      }),
      ...(cover.showBarcodeBox !== false
        ? [
            el(
              'div',
              { className: 'bv-cover-barcode', style: { position: 'relative', zIndex: '3' } },
              el('div', { className: 'bv-barcode-bars' }),
              el('span', { text: project.publishing?.isbn || '978-0-000-00000-0' }),
            ),
          ]
        : []),
    );
    return back;
  };

  const buildSpineFace = (): HTMLElement => {
    const spineW = Math.max(38, Math.round(spineInches * 64));
    const isWrapMulti = coverWrapMode === 'full-wrap' || coverWrapMode === 'dust-jacket';
    const spine = el(
      'div',
      {
        className: `bv-cover-spine${isWrapMulti && activeTargetFace() === 'spine' ? ' bv-cover-face-active' : ''}`,
        style: {
          width: `${spineW}px`,
          height: `${frontH}px`,
          background: cover.spineBackgroundColor || cover.backgroundColor,
          color: cover.accentColor,
          fontFamily: fontCss,
        },
        on: {
          pointerdown: (e) => {
            const tgt = e.target as HTMLElement;
            if (tgt.closest('.bv-cover-drag-item') || tgt.closest('.bv-cover-editable-block') || tgt.closest('.qv-cover-handle') || tgt.closest('.qv-cover-pin')) return;
            activeEditFace = 'spine';
          },
        },
      },
      el('span', {
        className: `bv-cover-editable-block${activeFaceElementKey === 'spine-title' ? ' is-selected' : ''}`,
        text: `${cover.spineTitle || project.title}  —  ${penName}`,
        on: {
          click: (e) => {
            e.stopPropagation();
            clearCoverSelection();
            activeEditFace = 'spine';
            activeFaceElementKey = 'spine-title';
            activeInspectorTab = 'properties';
            renderCoverStudio(container, actions);
          },
        },
      }),
    );
    renderFaceLayers(spine, 'spine');
    return spine;
  };

  const buildFlapFace = (side: 'front-flap' | 'back-flap'): HTMLElement => {
    const isWrapMulti = coverWrapMode === 'dust-jacket';
    const flap = el(
      'div',
      {
        className: `bv-cover-flap${isWrapMulti && activeTargetFace() === side ? ' bv-cover-face-active' : ''}`,
        style: {
          position: 'relative',
          width: `${Math.round(frontW * 0.44)}px`,
          height: `${frontH}px`,
          background: cover.backBackgroundColor || cover.backgroundColor,
          color: cover.textColor,
          fontFamily: fontCss,
        },
        on: {
          pointerdown: (e) => {
            const tgt = e.target as HTMLElement;
            if (tgt.closest('.bv-cover-drag-item') || tgt.closest('.bv-cover-editable-block') || tgt.closest('.qv-cover-handle') || tgt.closest('.qv-cover-pin')) return;
            activeEditFace = side;
          },
        },
      },
      el('span', { className: 'bv-mono-tag', text: side === 'front-flap' ? 'FRONT FLAP' : 'BACK FLAP', style: { color: cover.accentColor } }),
      el('p', {
        className: `bv-cover-editable-block${activeFaceElementKey === side ? ' is-selected' : ''}`,
        text: (side === 'front-flap' ? cover.frontFlapText : cover.backFlapText) || `Click to edit ${side === 'front-flap' ? 'front flap' : 'back flap'} copy…`,
        style: { fontSize: '11.5px', lineHeight: '1.55', opacity: '0.88' },
        on: {
          click: (e) => {
            e.stopPropagation();
            clearCoverSelection();
            activeEditFace = side;
            activeFaceElementKey = side;
            activeInspectorTab = 'properties';
            renderCoverStudio(container, actions);
          },
        },
      }),
    );
    renderFaceLayers(flap, side);
    return flap;
  };

  const wrap = el('div', {
    className: 'bv-cover-wrap',
    style: {
      transform: `translate(${Math.round(studioPanX)}px, ${Math.round(studioPanY)}px) scale(${studioZoom})`,
      transformOrigin: 'top center',
    },
  });
  wrap.style.setProperty('--qv-inv-zoom', String(Number((1 / Math.max(0.1, studioZoom)).toFixed(3))));

  if (coverWrapMode === 'front') {
    wrap.appendChild(buildFrontFace());
  } else if (coverWrapMode === 'back') {
    wrap.appendChild(buildBackFace());
  } else if (coverWrapMode === 'spine') {
    wrap.appendChild(buildSpineFace());
  } else if (coverWrapMode === 'full-wrap') {
    wrap.append(buildBackFace(), buildSpineFace(), buildFrontFace());
  } else {
    wrap.append(
      buildFlapFace('back-flap'),
      buildBackFace(),
      buildSpineFace(),
      buildFrontFace(),
      buildFlapFace('front-flap'),
    );
  }

  const syncZoomUiState = () => {
    wrap.style.transform = `translate(${Math.round(studioPanX)}px, ${Math.round(studioPanY)}px) scale(${studioZoom})`;
    wrap.style.setProperty('--qv-inv-zoom', String(Number((1 / Math.max(0.1, studioZoom)).toFixed(3))));
    const pctText = `${Math.round(studioZoom * 100)}%`;
    const readoutBtn = container.querySelector<HTMLButtonElement>('[data-cover-zoom-readout="1"]');
    if (readoutBtn) readoutBtn.textContent = pctText;
    const zoomSel = container.querySelector<HTMLSelectElement>('[data-cover-zoom-select="1"]');
    if (zoomSel) {
      const matchedPreset = COVER_ZOOM_PRESETS.find((preset) => Math.abs(preset - studioZoom) < 0.005);
      const customOpt = zoomSel.querySelector<HTMLOptionElement>('option[value="custom"]');
      if (matchedPreset !== undefined) {
        if (customOpt) customOpt.hidden = true;
        zoomSel.value = String(matchedPreset);
      } else {
        if (customOpt) {
          customOpt.textContent = pctText;
          customOpt.hidden = false;
        }
        zoomSel.value = 'custom';
      }
    }
    const statusZoom = stageWrap.querySelector('.qv-studio-status-strip .bv-mono-tag');
    if (statusZoom) {
      statusZoom.textContent = `Trim ${trim.label} | Spine ${spineInches}" | Zoom ${pctText}`;
    }
  };

  const applyStudioZoom = (nextZoom: number, anchorClientX?: number, anchorClientY?: number) => {
    const rect = stageScroll.getBoundingClientRect();
    const padTop = Number.parseFloat(getComputedStyle(stageScroll).paddingTop || '36') || 36;
    const defaultAnchorX = rect.width > 0 ? rect.left + rect.width / 2 : undefined;
    const defaultAnchorY = rect.height > 0 ? rect.top + rect.height / 2 : undefined;
    const ax = typeof anchorClientX === 'number' ? anchorClientX : defaultAnchorX;
    const ay = typeof anchorClientY === 'number' ? anchorClientY : defaultAnchorY;
    const result = computeCursorAnchoredZoom({
      currentZoom: studioZoom,
      nextZoom,
      panX: studioPanX,
      panY: studioPanY,
      anchorX: rect.width > 0 ? ax : undefined,
      anchorY: rect.height > 0 ? ay : undefined,
      originX: rect.left + rect.width / 2 - stageScroll.scrollLeft,
      originY: rect.top + padTop - stageScroll.scrollTop,
    });
    studioZoom = result.zoom;
    studioPanX = result.panX;
    studioPanY = result.panY;
    syncZoomUiState();
  };

  const fitCoverArtboard = () => {
    const faceUnits = coverWrapMode === 'full-wrap' ? 2.2 : coverWrapMode === 'dust-jacket' ? 3.1 : coverWrapMode === 'spine' ? 0.3 : 1;
    const boardW = wrap.offsetWidth > 40 ? wrap.offsetWidth : frontW * faceUnits;
    const boardH = wrap.offsetHeight > 40 ? wrap.offsetHeight : frontH;
    studioZoom = computeFitZoom(stageScroll.clientWidth || 640, stageScroll.clientHeight || 620, boardW, boardH);
    studioPanX = 0;
    studioPanY = 0;
    syncZoomUiState();
  };

  const fitCoverArtwork = () => {
    const faceLayerBoxes = [
      ...(cover.shapeLayers ?? []).map((s) => ({ x: s.xPct, y: s.yPct, w: s.widthPct, h: s.heightPct })),
      ...(cover.graphicLayers ?? []).map((g) => ({ x: g.xPct, y: g.yPct, w: g.widthPct, h: g.widthPct })),
      ...(cover.textLayers ?? []).map((t) => ({ x: t.xPct, y: t.yPct, w: 28, h: Math.max(8, t.fontSize * 0.45) })),
    ];
    if (faceLayerBoxes.length === 0) {
      fitCoverArtboard();
      return;
    }
    let minX = 100;
    let minY = 100;
    let maxX = 0;
    let maxY = 0;
    for (const box of faceLayerBoxes) {
      minX = Math.min(minX, Math.max(0, box.x - box.w / 2));
      minY = Math.min(minY, Math.max(0, box.y - box.h / 2));
      maxX = Math.max(maxX, Math.min(100, box.x + box.w / 2));
      maxY = Math.max(maxY, Math.min(100, box.y + box.h / 2));
    }
    const artW = Math.max(frontW * 0.25, ((maxX - minX) / 100) * frontW);
    const artH = Math.max(frontH * 0.25, ((maxY - minY) / 100) * frontH);
    studioZoom = computeFitZoom(stageScroll.clientWidth || 640, stageScroll.clientHeight || 620, artW, artH, 96);
    studioPanX = 0;
    studioPanY = 0;
    syncZoomUiState();
  };

  const resetCoverView = () => {
    studioZoom = 1;
    studioPanX = 0;
    studioPanY = 0;
    syncZoomUiState();
  };

  zoomNavController = {
    applyZoom: applyStudioZoom,
    fitArtboard: fitCoverArtboard,
    fitArtwork: fitCoverArtwork,
    resetView: resetCoverView,
  };

  // Trackpad pinch (ctrlKey=true), Ctrl/Cmd + Wheel zoom, and two-finger pan
  if (activeCoverWheelHandler) {
    window.removeEventListener('wheel', activeCoverWheelHandler);
  }
  activeCoverWheelHandler = (e: WheelEvent) => {
    if (!document.body.contains(stageScroll)) {
      window.removeEventListener('wheel', activeCoverWheelHandler!);
      activeCoverWheelHandler = null;
      return;
    }
    const target = e.target as Node | null;
    if (!target || (!stageWrap.contains(target) && !container.contains(target))) return;
    const gesture = classifyCanvasWheelGesture({
      deltaX: e.deltaX,
      deltaY: e.deltaY,
      deltaMode: e.deltaMode,
      ctrlKey: e.ctrlKey,
      metaKey: e.metaKey,
      shiftKey: e.shiftKey,
    });
    if (gesture.kind === 'zoom') {
      e.preventDefault();
      applyStudioZoom(studioZoom * gesture.zoomFactor, e.clientX, e.clientY);
      return;
    }
    if (stageScroll.contains(target)) {
      e.preventDefault();
      studioPanX += gesture.panDeltaX;
      studioPanY += gesture.panDeltaY;
      syncZoomUiState();
    }
  };
  window.addEventListener('wheel', activeCoverWheelHandler, { passive: false });

  let gestureBaseZoom = studioZoom;
  stageScroll.addEventListener(
    'gesturestart' as keyof HTMLElementEventMap,
    ((e: Event & { scale?: number }) => {
      e.preventDefault();
      gestureBaseZoom = studioZoom;
    }) as EventListener,
    { passive: false },
  );
  stageScroll.addEventListener(
    'gesturechange' as keyof HTMLElementEventMap,
    ((e: Event & { scale?: number; clientX?: number; clientY?: number }) => {
      e.preventDefault();
      if (typeof e.scale === 'number' && Number.isFinite(e.scale) && e.scale > 0) {
        applyStudioZoom(gestureBaseZoom * e.scale, e.clientX, e.clientY);
      }
    }) as EventListener,
    { passive: false },
  );

  // Panning (Space+Drag or Middle-Mouse) and Empty-Stage Marquee Box Multi-Select
  let spaceHeld = false;
  let lastContextClientX: number | undefined;
  let lastContextClientY: number | undefined;
  stageScroll.addEventListener('contextmenu', (ev) => {
    lastContextClientX = ev.clientX;
    lastContextClientY = ev.clientY;
  });

  stageScroll.addEventListener('pointerdown', (e) => {
    if (e.button === 2) return;
    const target = e.target as HTMLElement;
    const isMiddlePan = e.button === 1;
    const isSpacePan = e.button === 0 && spaceHeld;
    if (isMiddlePan || isSpacePan) {
      e.preventDefault();
      const sx = e.clientX;
      const sy = e.clientY;
      const origX = studioPanX;
      const origY = studioPanY;
      stageScroll.classList.add('is-panning');
      const cleanupPan = () => {
        stageScroll.classList.remove('is-panning');
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', cleanupPan);
        window.removeEventListener('pointercancel', cleanupPan);
        window.removeEventListener('blur', cleanupPan);
      };
      const onMove = (mv: PointerEvent) => {
        studioPanX = origX + (mv.clientX - sx);
        studioPanY = origY + (mv.clientY - sy);
        syncZoomUiState();
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', cleanupPan);
      window.addEventListener('pointercancel', cleanupPan);
      window.addEventListener('blur', cleanupPan);
      return;
    }

    if (
      e.button === 0 &&
      !target.closest('.bv-cover-drag-item') &&
      !target.closest('.bv-cover-editable-block') &&
      !target.closest('.qv-inline-text-editor') &&
      !target.closest('.qv-cover-pin')
    ) {
      const startX = e.clientX;
      const startY = e.clientY;
      const box = el('div', { className: 'qv-marquee-rect' });
      let started = false;
      const onMove = (mv: PointerEvent) => {
        if (!started && Math.hypot(mv.clientX - startX, mv.clientY - startY) < 5) return;
        if (!started) {
          started = true;
          document.body.appendChild(box);
        }
        const left = Math.min(startX, mv.clientX);
        const top = Math.min(startY, mv.clientY);
        const w = Math.abs(mv.clientX - startX);
        const h = Math.abs(mv.clientY - startY);
        box.style.left = `${left}px`;
        box.style.top = `${top}px`;
        box.style.width = `${w}px`;
        box.style.height = `${h}px`;
      };
      const onUp = (up: PointerEvent) => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        if (started) {
          box.remove();
          const mLeft = Math.min(startX, up.clientX);
          const mTop = Math.min(startY, up.clientY);
          const mRight = Math.max(startX, up.clientX);
          const mBottom = Math.max(startY, up.clientY);
          if (!up.shiftKey) selectedLayerKeys.clear();
          wrap.querySelectorAll<HTMLElement>('[data-layer-key]').forEach((itemEl) => {
            const r = itemEl.getBoundingClientRect();
            const hits = !(r.right < mLeft || r.left > mRight || r.bottom < mTop || r.top > mBottom);
            const lk = itemEl.dataset.layerKey;
            if (hits && lk) {
              selectedLayerKeys.add(lk);
              const [kind, id] = lk.split(':') as ['shape' | 'graphic' | 'text', string];
              activeSelectionKind = kind;
              activeLayerId = id;
            }
          });
          renderCoverStudio(container, actions);
        } else {
          clearCoverSelection();
          renderCoverStudio(container, actions);
        }
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    }
  });

  // Contextual Floating Action Bar
  const selectedKeysCount = getSelectedLayersList().length;
  const contextualStrip = el(
    'div',
    { className: 'qv-contextual-strip' },
    el('span', { className: 'bv-mono-tag', text: selectedKeysCount > 1 ? `${selectedKeysCount} Selected` : 'Selection Tools' }),
    el('button', { className: 'bv-mini-btn', text: 'Duplicate', attrs: { type: 'button', title: 'Ctrl+D' }, on: { click: duplicateSelectedLayers } }),
    el('button', { className: 'bv-mini-btn', text: 'Align L', attrs: { type: 'button' }, on: { click: () => applyAlignToSelected('left') } }),
    el('button', { className: 'bv-mini-btn', text: 'Center X', attrs: { type: 'button' }, on: { click: () => applyAlignToSelected('center-x') } }),
    el('button', { className: 'bv-mini-btn', text: 'Align R', attrs: { type: 'button' }, on: { click: () => applyAlignToSelected('right') } }),
    el('button', { className: 'bv-mini-btn', text: 'Middle Y', attrs: { type: 'button' }, on: { click: () => applyAlignToSelected('middle-y') } }),
    el('button', { className: 'bv-mini-btn', text: 'Tidy', attrs: { type: 'button' }, on: { click: () => applyAlignToSelected('tidy') } }),
    el('button', { className: 'bv-mini-btn', text: 'Group', attrs: { type: 'button', title: 'Ctrl+G' }, on: { click: () => groupSelectedLayers(false) } }),
    el('button', { className: 'bv-mini-btn', text: 'Ungroup', attrs: { type: 'button', title: 'Ctrl+Shift+G' }, on: { click: () => groupSelectedLayers(true) } }),
    el('button', { className: 'bv-mini-btn', text: 'Forward', attrs: { type: 'button', title: ']' }, on: { click: () => activeLayerId && activeSelectionKind !== 'none' && activeSelectionKind !== 'element' && bumpLayerZ(activeSelectionKind, activeLayerId, 1) } }),
    el('button', { className: 'bv-mini-btn', text: 'Back', attrs: { type: 'button', title: '[' }, on: { click: () => activeLayerId && activeSelectionKind !== 'none' && activeSelectionKind !== 'element' && bumpLayerZ(activeSelectionKind, activeLayerId, -1) } }),
    el('button', { className: 'bv-mini-btn', text: 'Delete', attrs: { type: 'button', title: 'Delete' }, on: { click: deleteSelectedLayers } }),
  );

  // Scoped keyboard shortcuts for Cover Studio (cleaned cleanly across renders)
  if (activeCoverKeyHandler) {
    window.removeEventListener('keydown', activeCoverKeyHandler);
  }
  const onKeyUp = (e: KeyboardEvent) => {
    if (e.code === 'Space') spaceHeld = false;
  };
  activeCoverKeyHandler = (e: KeyboardEvent) => {
    if (!document.body.contains(stageScroll)) {
      window.removeEventListener('keydown', activeCoverKeyHandler!);
      window.removeEventListener('keyup', onKeyUp);
      activeCoverKeyHandler = null;
      return;
    }
    const ae = document.activeElement as HTMLElement | null;
    if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.tagName === 'SELECT' || ae.isContentEditable)) {
      return;
    }
    if (e.code === 'Space') {
      spaceHeld = true;
      return;
    }
    const mod = e.ctrlKey || e.metaKey;
    if (mod && (e.key === '=' || e.key === '+' || e.code === 'Equal' || e.code === 'NumpadAdd')) {
      e.preventDefault();
      applyStudioZoom(studioZoom * 1.15);
    } else if (mod && (e.key === '-' || e.key === '_' || e.code === 'Minus' || e.code === 'NumpadSubtract')) {
      e.preventDefault();
      applyStudioZoom(studioZoom / 1.15);
    } else if (mod && (e.key === '0' || e.code === 'Digit0' || e.code === 'Numpad0')) {
      e.preventDefault();
      studioPanX = 0;
      studioPanY = 0;
      applyStudioZoom(1);
    } else if (mod && e.key.toLowerCase() === 'd') {
      e.preventDefault();
      duplicateSelectedLayers();
    } else if (mod && e.key.toLowerCase() === 'c') {
      e.preventDefault();
      copySelectedLayers();
    } else if (mod && e.key.toLowerCase() === 'x') {
      e.preventDefault();
      copySelectedLayers();
      deleteSelectedLayers();
    } else if (mod && e.key.toLowerCase() === 'v') {
      e.preventDefault();
      pasteCopiedLayers();
    } else if (mod && e.key.toLowerCase() === 'g') {
      e.preventDefault();
      groupSelectedLayers(e.shiftKey);
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && activeSelectionKind !== 'none' && activeSelectionKind !== 'element') {
      e.preventDefault();
      deleteSelectedLayers();
    } else if (e.key === ']' && activeSelectionKind !== 'none' && activeSelectionKind !== 'element' && activeLayerId) {
      e.preventDefault();
      bumpLayerZ(activeSelectionKind, activeLayerId, mod ? 10 : 1);
    } else if (e.key === '[' && activeSelectionKind !== 'none' && activeSelectionKind !== 'element' && activeLayerId) {
      e.preventDefault();
      bumpLayerZ(activeSelectionKind, activeLayerId, mod ? -10 : -1);
    } else if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
      e.preventDefault();
      const step = e.shiftKey ? 2 : 0.25;
      const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
      const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
      nudgeSelectedLayers(dx, dy);
    }
  };
  window.addEventListener('keydown', activeCoverKeyHandler);
  window.addEventListener('keyup', onKeyUp);

  attachContextMenu(stageScroll, () => [
    {
      heading: 'View & Navigation',
      items: [
        {
          label: 'Zoom In',
          icon: 'zoom-in',
          onSelect: () => applyStudioZoom(studioZoom * 1.25, lastContextClientX, lastContextClientY),
        },
        {
          label: 'Zoom Out',
          icon: 'zoom-out',
          onSelect: () => applyStudioZoom(studioZoom / 1.25, lastContextClientX, lastContextClientY),
        },
        {
          label: 'Fit Artboard to Window',
          onSelect: () => fitCoverArtboard(),
        },
        {
          label: 'Fit Artwork to Window',
          onSelect: () => fitCoverArtwork(),
        },
        {
          label: 'Actual Size (100%)',
          onSelect: () => applyStudioZoom(1, lastContextClientX, lastContextClientY),
        },
        {
          label: 'Reset View',
          onSelect: () => resetCoverView(),
        },
      ],
    },
    {
      heading: 'Cover Canvas',
      items: [
        {
          label: showGridOverlay ? 'Hide Grid Overlay' : 'Show Grid Overlay',
          icon: 'grid-snap',
          checked: showGridOverlay,
          onSelect: () => mutateCover(actions, (c) => ({ ...c, showGrid: !showGridOverlay }), true, false),
        },
        {
          label: snapGridEnabled ? 'Disable Snap to Grid' : 'Enable Snap to Grid',
          icon: 'magnet',
          checked: snapGridEnabled,
          onSelect: () => mutateCover(actions, (c) => ({ ...c, snapToGrid: !snapGridEnabled }), true, false),
        },
        {
          label: showBleedGuides ? 'Hide Print Safe Guides' : 'Show Print Safe Guides',
          icon: 'guides',
          checked: showBleedGuides,
          onSelect: () => mutateCover(actions, (c) => ({ ...c, showGuides: !showBleedGuides }), true, false),
        },
        {
          label: 'Export Front Cover PNG',
          icon: 'download',
          onSelect: () => void actions.exportCoverPng(),
        },
      ],
    },
  ]);

  stageScroll.appendChild(wrap);
  const bottomStatusStrip = el(
    'div',
    { className: 'qv-studio-status-strip' },
    el('span', { className: 'bv-mono-tag', text: `Trim ${trim.label} | Spine ${spineInches}" | Zoom ${Math.round(studioZoom * 100)}%` }),
    el('span', { className: 'bv-mono-tag', text: 'Two-finger pan, Ctrl+Wheel / Pinch zoom, Space+Drag pan, Right-click View' }),
  );
  stageWrap.append(contextualStrip, stageScroll, bottomStatusStrip);

  // --- Right Contextual Properties + Layers Panel ---
  const rightDock = el('aside', { className: 'qv-studio-right' });
  const rightTabs = el(
    'div',
    { className: 'qv-studio-right-tabs' },
    el('button', {
      className: `bv-fmt-btn${activeInspectorTab === 'properties' ? ' is-active' : ''}`,
      text: 'Properties',
      attrs: { type: 'button' },
      on: {
        click: () => {
          activeInspectorTab = 'properties';
          renderCoverStudio(container, actions);
        },
      },
    }),
    el('button', {
      className: `bv-fmt-btn${activeInspectorTab === 'layers' ? ' is-active' : ''}`,
      text: `Layers (${5 + textLayers.length + shapeLayers.length + graphicLayers.length + pathLayers.length})`,
      attrs: { type: 'button' },
      on: {
        click: () => {
          activeInspectorTab = 'layers';
          renderCoverStudio(container, actions);
        },
      },
    }),
  );

  const rightBody = el('div', { className: 'qv-studio-right-body' });

  if (activeInspectorTab === 'layers') {
    type StackLayerItem = {
      kind: 'graphic' | 'text' | 'path' | 'shape';
      id: string;
      label: string;
      badge: string;
      zIndex: number;
      visible: boolean;
      locked: boolean;
    };

    const stackItems: StackLayerItem[] = [
      ...graphicLayers.map((g) => ({
        kind: 'graphic' as const,
        id: g.id,
        label: g.name,
        badge: `${g.kind.toUpperCase()} (${g.face})`,
        zIndex: g.zIndex ?? 0,
        visible: g.visible !== false,
        locked: Boolean(g.locked),
      })),
      ...textLayers.map((tl) => ({
        kind: 'text' as const,
        id: tl.id,
        label: tl.text.slice(0, 28) || 'Text Box',
        badge: `TEXT (${tl.face})`,
        zIndex: tl.zIndex ?? 0,
        visible: tl.visible !== false,
        locked: Boolean(tl.locked),
      })),
      ...pathLayers.map((pl) => ({
        kind: 'path' as const,
        id: pl.id,
        label: pl.name,
        badge: `PATH (${pl.face}, ${pl.points.length} pts)`,
        zIndex: pl.zIndex ?? 0,
        visible: pl.visible !== false,
        locked: Boolean(pl.locked),
      })),
      ...shapeLayers.map((sh) => ({
        kind: 'shape' as const,
        id: sh.id,
        label: sh.name,
        badge: `SHAPE (${sh.face})`,
        zIndex: sh.zIndex ?? 0,
        visible: sh.visible !== false,
        locked: Boolean(sh.locked),
      })),
    ].sort((a, b) => b.zIndex - a.zIndex);

    let draggedStackKey: string | null = null;
    const stackKey = (item: Pick<StackLayerItem, 'kind' | 'id'>) => `${item.kind}:${item.id}`;

    const applyZStackOrder = (orderedTopToBottom: StackLayerItem[]) => {
      const zByKey = new Map<string, number>();
      const total = orderedTopToBottom.length;
      orderedTopToBottom.forEach((item, idx) => {
        zByKey.set(stackKey(item), total - 1 - idx);
      });
      mutateCover(actions, (c) => ({
        ...c,
        graphicLayers: (c.graphicLayers ?? []).map((g) => {
          const z = zByKey.get(`graphic:${g.id}`);
          return z !== undefined ? { ...g, zIndex: z } : g;
        }),
        textLayers: (c.textLayers ?? []).map((t) => {
          const z = zByKey.get(`text:${t.id}`);
          return z !== undefined ? { ...t, zIndex: z } : t;
        }),
        pathLayers: (c.pathLayers ?? []).map((p) => {
          const z = zByKey.get(`path:${p.id}`);
          return z !== undefined ? { ...p, zIndex: z } : p;
        }),
        shapeLayers: (c.shapeLayers ?? []).map((s) => {
          const z = zByKey.get(`shape:${s.id}`);
          return z !== undefined ? { ...s, zIndex: z } : s;
        }),
      }));
    };

    const toggleCustomLayerVis = (item: StackLayerItem) => {
      mutateCover(actions, (c) => {
        if (item.kind === 'graphic') return { ...c, graphicLayers: (c.graphicLayers ?? []).map((x) => (x.id === item.id ? { ...x, visible: !item.visible } : x)) };
        if (item.kind === 'text') return { ...c, textLayers: (c.textLayers ?? []).map((x) => (x.id === item.id ? { ...x, visible: !item.visible } : x)) };
        if (item.kind === 'path') return { ...c, pathLayers: (c.pathLayers ?? []).map((x) => (x.id === item.id ? { ...x, visible: !item.visible } : x)) };
        return { ...c, shapeLayers: (c.shapeLayers ?? []).map((x) => (x.id === item.id ? { ...x, visible: !item.visible } : x)) };
      });
    };

    const toggleCustomLayerLock = (item: StackLayerItem) => {
      mutateCover(actions, (c) => {
        if (item.kind === 'graphic') return { ...c, graphicLayers: (c.graphicLayers ?? []).map((x) => (x.id === item.id ? { ...x, locked: !item.locked } : x)) };
        if (item.kind === 'text') return { ...c, textLayers: (c.textLayers ?? []).map((x) => (x.id === item.id ? { ...x, locked: !item.locked } : x)) };
        if (item.kind === 'path') return { ...c, pathLayers: (c.pathLayers ?? []).map((x) => (x.id === item.id ? { ...x, locked: !item.locked } : x)) };
        return { ...c, shapeLayers: (c.shapeLayers ?? []).map((x) => (x.id === item.id ? { ...x, locked: !item.locked } : x)) };
      });
    };

    const deleteCustomLayer = (item: StackLayerItem) => {
      if (activeSelectionKind === item.kind && activeLayerId === item.id) {
        clearCoverSelection();
      }
      mutateCover(actions, (c) => {
        if (item.kind === 'graphic') return { ...c, graphicLayers: (c.graphicLayers ?? []).filter((x) => x.id !== item.id) };
        if (item.kind === 'text') return { ...c, textLayers: (c.textLayers ?? []).filter((x) => x.id !== item.id) };
        if (item.kind === 'path') return { ...c, pathLayers: (c.pathLayers ?? []).filter((x) => x.id !== item.id) };
        return { ...c, shapeLayers: (c.shapeLayers ?? []).filter((x) => x.id !== item.id) };
      });
    };

    if (stackItems.length > 0) {
      rightBody.appendChild(el('span', { className: 'bv-label', text: 'Drag layers up/down to reorder visual stacking' }));
    }

    for (const item of stackItems) {
      const k = stackKey(item);
      const selected = activeSelectionKind === item.kind && activeLayerId === item.id;
      const row = el(
        'div',
        {
          className: `qv-layer-row${selected ? ' is-active' : ''}`,
          attrs: { draggable: 'true' },
          on: {
            click: () => {
              setSingleSelection(cover, item.kind, item.id, false);
              renderCoverStudio(container, actions);
            },
            dragstart: (e) => {
              draggedStackKey = k;
              if (e.dataTransfer) {
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', k);
              }
            },
            dragover: (e) => {
              if (!draggedStackKey || draggedStackKey === k) return;
              e.preventDefault();
              const rect = row.getBoundingClientRect();
              const topHalf = e.clientY < rect.top + rect.height / 2;
              row.classList.toggle('is-drag-over-top', topHalf);
              row.classList.toggle('is-drag-over-bottom', !topHalf);
            },
            dragleave: () => {
              row.classList.remove('is-drag-over-top', 'is-drag-over-bottom');
            },
            drop: (e) => {
              e.preventDefault();
              const rect = row.getBoundingClientRect();
              const insertAbove = e.clientY < rect.top + rect.height / 2;
              row.classList.remove('is-drag-over-top', 'is-drag-over-bottom');
              const srcKey = draggedStackKey || e.dataTransfer?.getData('text/plain') || '';
              draggedStackKey = null;
              if (!srcKey || srcKey === k) return;
              const nextOrder = [...stackItems];
              const fromIdx = nextOrder.findIndex((x) => stackKey(x) === srcKey);
              if (fromIdx === -1) return;
              const [moved] = nextOrder.splice(fromIdx, 1);
              let targetIdx = nextOrder.findIndex((x) => stackKey(x) === k);
              if (targetIdx === -1) return;
              if (!insertAbove) targetIdx += 1;
              nextOrder.splice(targetIdx, 0, moved);
              applyZStackOrder(nextOrder);
            },
            dragend: () => {
              draggedStackKey = null;
              row.classList.remove('is-drag-over-top', 'is-drag-over-bottom');
            },
          },
        },
        el('span', { className: 'qv-layer-grip', text: '⋮⋮', attrs: { title: 'Drag to reorder layer stacking' } }),
        el(
          'div',
          { style: { minWidth: '0', flex: '1' } },
          el('div', { text: item.label, style: { fontWeight: '600', fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }),
          el('span', { className: 'bv-mono-tag', text: item.badge }),
        ),
        el(
          'div',
          { style: { display: 'flex', gap: '3px', alignItems: 'center' } },
          el('button', {
            className: 'bv-icon-tiny',
            attrs: { type: 'button', 'aria-label': item.visible ? 'Hide layer' : 'Show layer' },
            on: { click: (e) => { e.stopPropagation(); toggleCustomLayerVis(item); } },
          }, icon(item.visible ? 'eye' : 'eye-off', 13)),
          el('button', {
            className: 'bv-icon-tiny',
            attrs: { type: 'button', 'aria-label': item.locked ? 'Unlock layer' : 'Lock layer' },
            on: { click: (e) => { e.stopPropagation(); toggleCustomLayerLock(item); } },
          }, icon(item.locked ? 'lock' : 'unlock', 13)),
          el('button', {
            className: 'bv-icon-tiny',
            attrs: { type: 'button', 'aria-label': 'Delete layer' },
            on: { click: (e) => { e.stopPropagation(); deleteCustomLayer(item); } },
          }, icon('trash', 13)),
        ),
      );
      rightBody.appendChild(row);
    }

    for (const key of ['edition', 'title', 'subtitle', 'author', 'signature'] as CoverElementKey[]) {
      const elCfg = cover.elements[key];
      rightBody.appendChild(
        el(
          'div',
          {
            className: `qv-layer-row${activeSelectionKind === 'element' && activeElementKey === key ? ' is-active' : ''}`,
            on: {
              click: () => {
                setSingleSelection(cover, 'element', key, false);
                renderCoverStudio(container, actions);
              },
            },
          },
          el(
            'div',
            { style: { minWidth: '0', flex: '1' } },
            el('div', { text: key.charAt(0).toUpperCase() + key.slice(1), style: { fontWeight: '600', fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }),
            el('span', { className: 'bv-mono-tag', text: 'FRONT FIELD' }),
          ),
          el(
            'div',
            { style: { display: 'flex', gap: '3px', alignItems: 'center' } },
            el('button', {
              className: 'bv-icon-tiny',
              attrs: { type: 'button', 'aria-label': elCfg.visible ? 'Hide field' : 'Show field' },
              on: {
                click: (e) => {
                  e.stopPropagation();
                  mutateCover(actions, (c) => ({ ...c, elements: { ...c.elements, [key]: { ...c.elements[key], visible: !c.elements[key].visible } } }));
                },
              },
            }, icon(elCfg.visible ? 'eye' : 'eye-off', 13)),
            el('button', {
              className: 'bv-icon-tiny',
              attrs: { type: 'button', 'aria-label': elCfg.locked ? 'Unlock field' : 'Lock field' },
              on: {
                click: (e) => {
                  e.stopPropagation();
                  mutateCover(actions, (c) => ({ ...c, elements: { ...c.elements, [key]: { ...c.elements[key], locked: !c.elements[key].locked } } }));
                },
              },
            }, icon(Boolean(elCfg.locked) ? 'lock' : 'unlock', 13)),
          ),
        ),
      );
    }
  } else {
    // Properties Inspector tailored to current selection
    const alignRow = (onAlign: (xPct: number | null, yPct: number | null) => void) =>
      el(
        'div',
        { className: 'bv-field' },
        el('label', { className: 'bv-label', text: 'Quick Align on Face' }),
        el(
          'div',
          { style: { display: 'flex', gap: '4px', flexWrap: 'wrap' } },
          el('button', { className: 'bv-mini-btn', text: 'Left', attrs: { type: 'button' }, on: { click: () => onAlign(18, null) } }),
          el('button', { className: 'bv-mini-btn', text: 'Center X', attrs: { type: 'button' }, on: { click: () => onAlign(50, null) } }),
          el('button', { className: 'bv-mini-btn', text: 'Right', attrs: { type: 'button' }, on: { click: () => onAlign(82, null) } }),
          el('button', { className: 'bv-mini-btn', text: 'Center Y', attrs: { type: 'button' }, on: { click: () => onAlign(null, 50) } }),
        ),
      );

    if (selectedTextLayer) {
      const txtVal = el('textarea', {
        className: 'bv-textarea',
        attrs: { rows: 2 },
        on: { change: () => mutateCover(actions, (c) => ({ ...c, textLayers: (c.textLayers ?? []).map((l) => l.id === selectedTextLayer.id ? { ...l, text: txtVal.value } : l) })) },
      });
      txtVal.value = selectedTextLayer.text;

      let sizeLbl: HTMLElement | null = null;
      const sizeRange = el('input', {
        attrs: { type: 'range', min: 8, max: 64, step: 1, value: selectedTextLayer.fontSize },
        on: {
          input: () => {
            const val = Number(sizeRange.value);
            if (sizeLbl) sizeLbl.textContent = `Font Size (${val}px)`;
            container.querySelectorAll<HTMLElement>(`[data-text-id="${selectedTextLayer.id}"]`).forEach((n) => {
              n.style.fontSize = `${val}px`;
            });
            mutateCover(actions, (c) => ({ ...c, textLayers: (c.textLayers ?? []).map((l) => l.id === selectedTextLayer.id ? { ...l, fontSize: val } : l) }), false, false);
          },
          change: () => mutateCover(actions, (c) => ({ ...c, textLayers: (c.textLayers ?? []).map((l) => l.id === selectedTextLayer.id ? { ...l, fontSize: Number(sizeRange.value) } : l) }), true),
        },
      });
      const colorIn = el('input', {
        attrs: { type: 'color', value: selectedTextLayer.color },
        on: { change: () => mutateCover(actions, (c) => ({ ...c, textLayers: (c.textLayers ?? []).map((l) => l.id === selectedTextLayer.id ? { ...l, color: colorIn.value } : l) })) },
      });
      const upperChk = el('input', {
        className: 'bv-lever',
        attrs: { type: 'checkbox', role: 'switch', checked: selectedTextLayer.uppercase },
        on: { change: () => mutateCover(actions, (c) => ({ ...c, textLayers: (c.textLayers ?? []).map((l) => l.id === selectedTextLayer.id ? { ...l, uppercase: upperChk.checked } : l) })) },
      });

      const fontSel = el(
        'select',
        {
          className: 'bv-input',
          on: {
            change: () =>
              mutateCover(actions, (c) => ({
                ...c,
                textLayers: (c.textLayers ?? []).map((l) =>
                  l.id === selectedTextLayer.id ? { ...l, fontFamily: fontSel.value || undefined } : l,
                ),
              })),
          },
        },
        el('option', { text: 'Cover Default Typeface', attrs: { value: '', selected: !selectedTextLayer.fontFamily } }),
        ...fontChoices.map((fc) =>
          el('option', {
            text: fc.label,
            attrs: { value: fc.id, selected: selectedTextLayer.fontFamily === fc.id },
          }),
        ),
      );
      const italicChk = el('input', {
        className: 'bv-lever',
        attrs: { type: 'checkbox', role: 'switch', checked: selectedTextLayer.italic },
        on: {
          change: () =>
            mutateCover(actions, (c) => ({
              ...c,
              textLayers: (c.textLayers ?? []).map((l) =>
                l.id === selectedTextLayer.id ? { ...l, italic: italicChk.checked } : l,
              ),
            })),
        },
      });
      const zRow = el(
        'div',
        { style: { display: 'flex', gap: '6px' } },
        el('button', {
          className: 'bv-mini-btn',
          text: 'Send Back',
          attrs: { type: 'button' },
          on: { click: () => bumpLayerZ('text', selectedTextLayer.id, -1) },
        }),
        el('button', {
          className: 'bv-mini-btn',
          text: 'Bring Forward',
          attrs: { type: 'button' },
          on: { click: () => bumpLayerZ('text', selectedTextLayer.id, 1) },
        }),
      );

      const bgPillIn = el('input', {
        attrs: { type: 'color', value: selectedTextLayer.backgroundColor && selectedTextLayer.backgroundColor !== 'transparent' ? selectedTextLayer.backgroundColor : '#11131a' },
        on: { change: () => mutateCover(actions, (c) => ({ ...c, textLayers: (c.textLayers ?? []).map((l) => l.id === selectedTextLayer.id ? { ...l, backgroundColor: bgPillIn.value } : l) })) },
      });
      const clearBgPillBtn = el('button', {
        className: 'bv-mini-btn',
        text: 'Clear Backdrop',
        attrs: { type: 'button' },
        on: { click: () => mutateCover(actions, (c) => ({ ...c, textLayers: (c.textLayers ?? []).map((l) => l.id === selectedTextLayer.id ? { ...l, backgroundColor: undefined } : l) })) },
      });
      const decoSel = el(
        'select',
        {
          className: 'bv-input',
          on: { change: () => mutateCover(actions, (c) => ({ ...c, textLayers: (c.textLayers ?? []).map((l) => l.id === selectedTextLayer.id ? { ...l, textDecoration: decoSel.value as 'none' | 'underline' | 'line-through' } : l) })) },
        },
        el('option', { text: 'None', attrs: { value: 'none', selected: !selectedTextLayer.textDecoration || selectedTextLayer.textDecoration === 'none' } }),
        el('option', { text: 'Underline', attrs: { value: 'underline', selected: selectedTextLayer.textDecoration === 'underline' } }),
        el('option', { text: 'Strikethrough', attrs: { value: 'line-through', selected: selectedTextLayer.textDecoration === 'line-through' } }),
      );
      const tBlendSel = el(
        'select',
        {
          className: 'bv-input',
          on: { change: () => mutateCover(actions, (c) => ({ ...c, textLayers: (c.textLayers ?? []).map((l) => l.id === selectedTextLayer.id ? { ...l, blendMode: tBlendSel.value as CoverBlendMode } : l) })) },
        },
        ...COVER_BLEND_MODES.map((m) =>
          el('option', { text: m.label, attrs: { value: m.id, selected: (selectedTextLayer.blendMode || 'normal') === m.id } }),
        ),
      );
      rightBody.append(
        el('span', { className: 'bv-panel-title', text: 'Custom Text Layer' }),
        el('div', { className: 'bv-field' }, el('label', { className: 'bv-label', text: 'Copy' }), txtVal),
        el('div', { className: 'bv-field' }, el('label', { className: 'bv-label', text: 'Font' }), fontSel),
        el('div', { className: 'bv-field' }, (sizeLbl = el('label', { className: 'bv-label', text: `Font Size (${selectedTextLayer.fontSize}px)` })), sizeRange),
        el('div', { className: 'bv-field' }, el('label', { className: 'bv-label', text: 'Text Color' }), colorIn),
        el('div', { className: 'bv-field' }, el('label', { className: 'bv-label', text: 'Text Decoration' }), decoSel),
        ...(isDesktopProCover ? [el('div', { className: 'bv-field' }, el('label', { className: 'bv-label', text: 'Blend Mode' }), tBlendSel)] : []),
        el('div', { className: 'bv-field' }, el('label', { className: 'bv-label', text: 'Backdrop Highlight' }), el('div', { style: { display: 'flex', gap: '6px', alignItems: 'center' } }, bgPillIn, clearBgPillBtn)),
        el('label', { className: 'bv-check-row' }, italicChk, el('span', { text: 'Italic Style' })),
        el('label', { className: 'bv-check-row' }, upperChk, el('span', { text: 'Uppercase Display' })),
        el('div', { className: 'bv-field' }, el('label', { className: 'bv-label', text: 'Layer Order' }), zRow),
        alignRow((nx, ny) =>
          mutateCover(actions, (c) => ({
            ...c,
            textLayers: (c.textLayers ?? []).map((l) =>
              l.id === selectedTextLayer.id
                ? { ...l, xPct: nx ?? l.xPct, yPct: ny ?? l.yPct }
                : l,
            ),
          })),
        ),
        el('button', {
          className: 'bv-mini-btn',
          text: 'Delete Text Layer',
          attrs: { type: 'button' },
          on: {
            click: () => {
              const delId = selectedTextLayer.id;
              activeSelectionKind = 'element';
              activeLayerId = '';
              mutateCover(actions, (c) => ({ ...c, textLayers: (c.textLayers ?? []).filter((l) => l.id !== delId) }));
            },
          },
        }),
      );
    } else if (selectedShapeLayer) {
      let wLbl: HTMLElement | null = null;
      const wRange = el('input', {
        attrs: { type: 'range', min: 5, max: 100, step: 1, value: selectedShapeLayer.widthPct },
        on: {
          input: () => {
            const val = Number(wRange.value);
            if (wLbl) wLbl.textContent = `Width (${val}%)`;
            container.querySelectorAll<HTMLElement>(`[data-shape-id="${selectedShapeLayer.id}"]`).forEach((n) => {
              n.style.width = `${val}%`;
            });
            mutateCover(actions, (c) => ({ ...c, shapeLayers: (c.shapeLayers ?? []).map((l) => l.id === selectedShapeLayer.id ? { ...l, widthPct: val } : l) }), false, false);
          },
          change: () => mutateCover(actions, (c) => ({ ...c, shapeLayers: (c.shapeLayers ?? []).map((l) => l.id === selectedShapeLayer.id ? { ...l, widthPct: Number(wRange.value) } : l) }), true),
        },
      });
      const fillIn = el('input', {
        attrs: { type: 'color', value: selectedShapeLayer.fillColor.startsWith('#') ? selectedShapeLayer.fillColor : cover.accentColor },
        on: { change: () => mutateCover(actions, (c) => ({ ...c, shapeLayers: (c.shapeLayers ?? []).map((l) => l.id === selectedShapeLayer.id ? { ...l, fillColor: fillIn.value } : l) })) },
      });
      const opRange = el('input', {
        attrs: { type: 'range', min: 0.05, max: 1, step: 0.05, value: selectedShapeLayer.opacity },
        on: { change: () => mutateCover(actions, (c) => ({ ...c, shapeLayers: (c.shapeLayers ?? []).map((l) => l.id === selectedShapeLayer.id ? { ...l, opacity: Number(opRange.value) } : l) })) },
      });
      const rotRange = el('input', {
        attrs: { type: 'range', min: -180, max: 180, step: 5, value: selectedShapeLayer.rotationDeg },
        on: { change: () => mutateCover(actions, (c) => ({ ...c, shapeLayers: (c.shapeLayers ?? []).map((l) => l.id === selectedShapeLayer.id ? { ...l, rotationDeg: Number(rotRange.value) } : l) })) },
      });

      let hLbl: HTMLElement | null = null;
      const hRange = el('input', {
        attrs: { type: 'range', min: 2, max: 100, step: 1, value: selectedShapeLayer.heightPct },
        on: {
          input: () => {
            const val = Number(hRange.value);
            if (hLbl) hLbl.textContent = `Height (${val}%)`;
            container.querySelectorAll<HTMLElement>(`[data-shape-id="${selectedShapeLayer.id}"]`).forEach((n) => {
              if (selectedShapeLayer.shape !== 'line') n.style.height = `${val}%`;
            });
            mutateCover(actions, (c) => ({ ...c, shapeLayers: (c.shapeLayers ?? []).map((l) => l.id === selectedShapeLayer.id ? { ...l, heightPct: val } : l) }), false, false);
          },
          change: () => mutateCover(actions, (c) => ({ ...c, shapeLayers: (c.shapeLayers ?? []).map((l) => l.id === selectedShapeLayer.id ? { ...l, heightPct: Number(hRange.value) } : l) }), true),
        },
      });
      const strokeColorIn = el('input', {
        attrs: { type: 'color', value: selectedShapeLayer.strokeColor || cover.accentColor },
        on: { change: () => mutateCover(actions, (c) => ({ ...c, shapeLayers: (c.shapeLayers ?? []).map((l) => l.id === selectedShapeLayer.id ? { ...l, strokeColor: strokeColorIn.value } : l) })) },
      });
      const strokeWRange = el('input', {
        attrs: { type: 'range', min: 0, max: 14, step: 1, value: selectedShapeLayer.strokeWidth },
        on: { change: () => mutateCover(actions, (c) => ({ ...c, shapeLayers: (c.shapeLayers ?? []).map((l) => l.id === selectedShapeLayer.id ? { ...l, strokeWidth: Number(strokeWRange.value) } : l) })) },
      });
      const radiusRange = el('input', {
        attrs: { type: 'range', min: 0, max: 48, step: 2, value: selectedShapeLayer.cornerRadius },
        on: { change: () => mutateCover(actions, (c) => ({ ...c, shapeLayers: (c.shapeLayers ?? []).map((l) => l.id === selectedShapeLayer.id ? { ...l, cornerRadius: Number(radiusRange.value) } : l) })) },
      });
      const gradEndIn = el('input', {
        attrs: { type: 'color', value: selectedShapeLayer.gradientEndColor || selectedShapeLayer.fillColor || cover.accentColor },
        on: { change: () => mutateCover(actions, (c) => ({ ...c, shapeLayers: (c.shapeLayers ?? []).map((l) => l.id === selectedShapeLayer.id ? { ...l, gradientEndColor: gradEndIn.value } : l) })) },
      });
      const shapeZRow = el(
        'div',
        { style: { display: 'flex', gap: '6px' } },
        el('button', {
          className: 'bv-mini-btn',
          text: 'Send Back',
          attrs: { type: 'button' },
          on: { click: () => bumpLayerZ('shape', selectedShapeLayer.id, -1) },
        }),
        el('button', {
          className: 'bv-mini-btn',
          text: 'Bring Forward',
          attrs: { type: 'button' },
          on: { click: () => bumpLayerZ('shape', selectedShapeLayer.id, 1) },
        }),
      );

      const shapeBlendSel = el(
        'select',
        {
          className: 'bv-input',
          on: { change: () => mutateCover(actions, (c) => ({ ...c, shapeLayers: (c.shapeLayers ?? []).map((l) => l.id === selectedShapeLayer.id ? { ...l, blendMode: shapeBlendSel.value as CoverBlendMode } : l) })) },
        },
        ...COVER_BLEND_MODES.map((m) =>
          el('option', { text: m.label, attrs: { value: m.id, selected: (selectedShapeLayer.blendMode || 'normal') === m.id } }),
        ),
      );
      rightBody.append(
        el('span', { className: 'bv-panel-title', text: `Shape: ${selectedShapeLayer.name}` }),
        el('div', { className: 'bv-field' }, (wLbl = el('label', { className: 'bv-label', text: `Width (${selectedShapeLayer.widthPct}%)` })), wRange),
        el('div', { className: 'bv-field' }, (hLbl = el('label', { className: 'bv-label', text: `Height (${selectedShapeLayer.heightPct}%)` })), hRange),
        el('div', { className: 'bv-field' }, el('label', { className: 'bv-label', text: 'Fill Color' }), fillIn),
        el('div', { className: 'bv-field' }, el('label', { className: 'bv-label', text: 'Gradient End (Optional)' }), gradEndIn),
        el('div', { className: 'bv-field' }, el('label', { className: 'bv-label', text: 'Border / Stroke Color' }), strokeColorIn),
        el('div', { className: 'bv-field' }, el('label', { className: 'bv-label', text: `Stroke Width (${selectedShapeLayer.strokeWidth}px)` }), strokeWRange),
        el('div', { className: 'bv-field' }, el('label', { className: 'bv-label', text: `Corner Radius (${selectedShapeLayer.cornerRadius}px)` }), radiusRange),
        el('div', { className: 'bv-field' }, el('label', { className: 'bv-label', text: `Opacity (${Math.round(selectedShapeLayer.opacity * 100)}%)` }), opRange),
        ...(isDesktopProCover ? [el('div', { className: 'bv-field' }, el('label', { className: 'bv-label', text: 'Blend Mode' }), shapeBlendSel)] : []),
        el('div', { className: 'bv-field' }, el('label', { className: 'bv-label', text: `Rotation (${selectedShapeLayer.rotationDeg}°)` }), rotRange),
        el('div', { className: 'bv-field' }, el('label', { className: 'bv-label', text: 'Layer Order' }), shapeZRow),
        alignRow((nx, ny) =>
          mutateCover(actions, (c) => ({
            ...c,
            shapeLayers: (c.shapeLayers ?? []).map((l) =>
              l.id === selectedShapeLayer.id ? { ...l, xPct: nx ?? l.xPct, yPct: ny ?? l.yPct } : l,
            ),
          })),
        ),
        el('button', {
          className: 'bv-mini-btn',
          text: 'Delete Shape Layer',
          attrs: { type: 'button' },
          on: {
            click: () => {
              const delId = selectedShapeLayer.id;
              clearCoverSelection();
              mutateCover(actions, (c) => ({ ...c, shapeLayers: (c.shapeLayers ?? []).filter((l) => l.id !== delId) }));
            },
          },
        }),
      );
    } else if (selectedGraphicLayer) {
      let widthLbl: HTMLElement | null = null;
      let rotLbl: HTMLElement | null = null;
      let opLbl: HTMLElement | null = null;
      let liveW = selectedGraphicLayer.widthPct;
      let liveRot = selectedGraphicLayer.rotationDeg;
      let liveOp = selectedGraphicLayer.opacity;

      const applyGraphicLive = () => {
        const sx = selectedGraphicLayer.flipX ? -1 : 1;
        const sy = selectedGraphicLayer.flipY ? -1 : 1;
        container.querySelectorAll<HTMLElement>(`[data-graphic-id="${selectedGraphicLayer.id}"]`).forEach((n) => {
          n.style.width = `${liveW}%`;
          n.style.opacity = String(liveOp);
          n.style.transform = `translate(-50%, -50%) rotate(${liveRot}deg) scale(${sx}, ${sy})`;
        });
      };

      const widthRange = el('input', {
        attrs: { type: 'range', min: 8, max: 95, step: 2, value: selectedGraphicLayer.widthPct },
        on: {
          input: () => {
            liveW = Number(widthRange.value);
            if (widthLbl) widthLbl.textContent = `Scale (${liveW}%)`;
            applyGraphicLive();
            mutateCover(actions, (c) => ({ ...c, graphicLayers: (c.graphicLayers ?? []).map((g) => g.id === selectedGraphicLayer.id ? { ...g, widthPct: liveW } : g) }), false, false);
          },
          change: () => mutateCover(actions, (c) => ({ ...c, graphicLayers: (c.graphicLayers ?? []).map((g) => g.id === selectedGraphicLayer.id ? { ...g, widthPct: Number(widthRange.value) } : g) }), true),
        },
      });
      const rotRange = el('input', {
        attrs: { type: 'range', min: -180, max: 180, step: 5, value: selectedGraphicLayer.rotationDeg },
        on: {
          input: () => {
            liveRot = Number(rotRange.value);
            if (rotLbl) rotLbl.textContent = `Rotation (${liveRot}°)`;
            applyGraphicLive();
            mutateCover(actions, (c) => ({ ...c, graphicLayers: (c.graphicLayers ?? []).map((g) => g.id === selectedGraphicLayer.id ? { ...g, rotationDeg: liveRot } : g) }), false, false);
          },
          change: () => mutateCover(actions, (c) => ({ ...c, graphicLayers: (c.graphicLayers ?? []).map((g) => g.id === selectedGraphicLayer.id ? { ...g, rotationDeg: Number(rotRange.value) } : g) }), true),
        },
      });
      const opRange = el('input', {
        attrs: { type: 'range', min: 0.1, max: 1, step: 0.05, value: selectedGraphicLayer.opacity },
        on: {
          input: () => {
            liveOp = Number(opRange.value);
            if (opLbl) opLbl.textContent = `Opacity (${Math.round(liveOp * 100)}%)`;
            applyGraphicLive();
            mutateCover(actions, (c) => ({ ...c, graphicLayers: (c.graphicLayers ?? []).map((g) => g.id === selectedGraphicLayer.id ? { ...g, opacity: liveOp } : g) }), false, false);
          },
          change: () => mutateCover(actions, (c) => ({ ...c, graphicLayers: (c.graphicLayers ?? []).map((g) => g.id === selectedGraphicLayer.id ? { ...g, opacity: Number(opRange.value) } : g) }), true),
        },
      });

      let satLbl: HTMLElement | null = null;
      const satRange = el('input', {
        attrs: { type: 'range', min: 0, max: 200, step: 5, value: selectedGraphicLayer.saturationPct ?? 100 },
        on: {
          pointerdown: () => recordSliderBaseline(cover),
          input: () => {
            const val = Number(satRange.value);
            if (satLbl) satLbl.textContent = `Saturation (${val}%)`;
            mutateCover(actions, (c) => ({ ...c, graphicLayers: (c.graphicLayers ?? []).map((g) => g.id === selectedGraphicLayer.id ? { ...g, saturationPct: val } : g) }), false, false);
          },
          change: () => {
            mutateCover(actions, (c) => ({ ...c, graphicLayers: (c.graphicLayers ?? []).map((g) => g.id === selectedGraphicLayer.id ? { ...g, saturationPct: Number(satRange.value) } : g) }), true, false);
            commitSliderBaseline();
          },
        },
      });
      let radLbl: HTMLElement | null = null;
      const radRange = el('input', {
        attrs: { type: 'range', min: 0, max: 50, step: 2, value: selectedGraphicLayer.borderRadiusPct ?? 0 },
        on: {
          pointerdown: () => recordSliderBaseline(cover),
          input: () => {
            const val = Number(radRange.value);
            if (radLbl) radLbl.textContent = `Corner Roundness (${val}%)`;
            mutateCover(actions, (c) => ({ ...c, graphicLayers: (c.graphicLayers ?? []).map((g) => g.id === selectedGraphicLayer.id ? { ...g, borderRadiusPct: val } : g) }), false, false);
          },
          change: () => {
            mutateCover(actions, (c) => ({ ...c, graphicLayers: (c.graphicLayers ?? []).map((g) => g.id === selectedGraphicLayer.id ? { ...g, borderRadiusPct: Number(radRange.value) } : g) }), true, false);
            commitSliderBaseline();
          },
        },
      });

      const gBlendSel = el(
        'select',
        {
          className: 'bv-input',
          on: { change: () => mutateCover(actions, (c) => ({ ...c, graphicLayers: (c.graphicLayers ?? []).map((g) => g.id === selectedGraphicLayer.id ? { ...g, blendMode: gBlendSel.value as CoverBlendMode } : g) })) },
        },
        ...COVER_BLEND_MODES.map((m) =>
          el('option', { text: m.label, attrs: { value: m.id, selected: (selectedGraphicLayer.blendMode || 'normal') === m.id } }),
        ),
      );
      rightBody.append(
        el('span', { className: 'bv-panel-title', text: `Graphic: ${selectedGraphicLayer.name}` }),
        el('div', { className: 'bv-field' }, (widthLbl = el('label', { className: 'bv-label', text: `Scale (${selectedGraphicLayer.widthPct}%)` })), widthRange),
        el('div', { className: 'bv-field' }, (rotLbl = el('label', { className: 'bv-label', text: `Rotation (${selectedGraphicLayer.rotationDeg}°)` })), rotRange),
        el('div', { className: 'bv-field' }, (opLbl = el('label', { className: 'bv-label', text: `Opacity (${Math.round(selectedGraphicLayer.opacity * 100)}%)` })), opRange),
        ...(isDesktopProCover ? [el('div', { className: 'bv-field' }, el('label', { className: 'bv-label', text: 'Blend Mode' }), gBlendSel)] : []),
        el('div', { className: 'bv-field' }, (satLbl = el('label', { className: 'bv-label', text: `Saturation (${selectedGraphicLayer.saturationPct ?? 100}%)` })), satRange),
        el('div', { className: 'bv-field' }, (radLbl = el('label', { className: 'bv-label', text: `Corner Roundness (${selectedGraphicLayer.borderRadiusPct ?? 0}%)` })), radRange),
        el(
          'div',
          { style: { display: 'flex', gap: '6px' } },
          el('button', {
            className: `bv-mini-btn${selectedGraphicLayer.flipX ? ' is-active' : ''}`,
            attrs: { type: 'button' },
            on: { click: () => mutateCover(actions, (c) => ({ ...c, graphicLayers: (c.graphicLayers ?? []).map((g) => g.id === selectedGraphicLayer.id ? { ...g, flipX: !g.flipX } : g) })) },
          }, icon('flip-h', 12), 'Flip H'),
          el('button', {
            className: `bv-mini-btn${selectedGraphicLayer.flipY ? ' is-active' : ''}`,
            attrs: { type: 'button' },
            on: { click: () => mutateCover(actions, (c) => ({ ...c, graphicLayers: (c.graphicLayers ?? []).map((g) => g.id === selectedGraphicLayer.id ? { ...g, flipY: !g.flipY } : g) })) },
          }, icon('flip-v', 12), 'Flip V'),
        ),
        alignRow((nx, ny) =>
          mutateCover(actions, (c) => ({
            ...c,
            graphicLayers: (c.graphicLayers ?? []).map((g) =>
              g.id === selectedGraphicLayer.id ? { ...g, xPct: nx ?? g.xPct, yPct: ny ?? g.yPct } : g,
            ),
          })),
        ),
        el('button', {
          className: 'bv-mini-btn',
          attrs: { type: 'button' },
          on: {
            click: () => {
              const delId = selectedGraphicLayer.id;
              activeSelectionKind = 'element';
              activeLayerId = '';
              mutateCover(actions, (c) => ({ ...c, graphicLayers: (c.graphicLayers ?? []).filter((g) => g.id !== delId) }));
            },
          },
        }, icon('trash', 12), 'Remove Layer'),
      );
    } else if (selectedPathLayer) {
      const pNameIn = el('input', {
        className: 'bv-input',
        attrs: { type: 'text', value: selectedPathLayer.name },
        on: {
          change: () =>
            mutateCover(actions, (c) => ({
              ...c,
              pathLayers: (c.pathLayers ?? []).map((p) => (p.id === selectedPathLayer.id ? { ...p, name: pNameIn.value.trim() || p.name } : p)),
            })),
        },
      });
      const pStrokeColIn = el('input', {
        attrs: { type: 'color', value: selectedPathLayer.strokeColor || '#c7a97b' },
        on: {
          change: () =>
            mutateCover(actions, (c) => ({
              ...c,
              pathLayers: (c.pathLayers ?? []).map((p) => (p.id === selectedPathLayer.id ? { ...p, strokeColor: pStrokeColIn.value } : p)),
            })),
        },
      });
      const pStrokeWRange = el('input', {
        attrs: { type: 'range', min: 1, max: 24, step: 1, value: selectedPathLayer.strokeWidth },
        on: {
          change: () =>
            mutateCover(actions, (c) => ({
              ...c,
              pathLayers: (c.pathLayers ?? []).map((p) => (p.id === selectedPathLayer.id ? { ...p, strokeWidth: Number(pStrokeWRange.value) } : p)),
            })),
        },
      });
      const pFillColIn = el('input', {
        attrs: { type: 'color', value: selectedPathLayer.fillColor && selectedPathLayer.fillColor.startsWith('#') ? selectedPathLayer.fillColor : cover.accentColor },
        on: {
          change: () =>
            mutateCover(actions, (c) => ({
              ...c,
              pathLayers: (c.pathLayers ?? []).map((p) => (p.id === selectedPathLayer.id ? { ...p, fillColor: pFillColIn.value } : p)),
            })),
        },
      });
      const pOpRange = el('input', {
        attrs: { type: 'range', min: 0.05, max: 1, step: 0.05, value: selectedPathLayer.opacity },
        on: {
          change: () =>
            mutateCover(actions, (c) => ({
              ...c,
              pathLayers: (c.pathLayers ?? []).map((p) => (p.id === selectedPathLayer.id ? { ...p, opacity: Number(pOpRange.value) } : p)),
            })),
        },
      });
      const pBlendSel = el(
        'select',
        {
          className: 'bv-input',
          on: {
            change: () =>
              mutateCover(actions, (c) => ({
                ...c,
                pathLayers: (c.pathLayers ?? []).map((p) => (p.id === selectedPathLayer.id ? { ...p, blendMode: pBlendSel.value as CoverBlendMode } : p)),
              })),
          },
        },
        ...COVER_BLEND_MODES.map((m) =>
          el('option', { text: m.label, attrs: { value: m.id, selected: (selectedPathLayer.blendMode || 'normal') === m.id } }),
        ),
      );
      const pClosedChk = el('input', {
        className: 'bv-lever',
        attrs: { type: 'checkbox', role: 'switch', checked: selectedPathLayer.closed },
        on: {
          change: () =>
            mutateCover(actions, (c) => ({
              ...c,
              pathLayers: (c.pathLayers ?? []).map((p) => (p.id === selectedPathLayer.id ? { ...p, closed: pClosedChk.checked } : p)),
            })),
        },
      });
      rightBody.append(
        el('span', { className: 'bv-panel-title', text: `Vector Path (${selectedPathLayer.points.length} pts)` }),
        el('div', { className: 'bv-field' }, el('label', { className: 'bv-label', text: 'Layer Name' }), pNameIn),
        el('div', { className: 'bv-field' }, el('label', { className: 'bv-label', text: 'Stroke Color' }), pStrokeColIn),
        el('div', { className: 'bv-field' }, el('label', { className: 'bv-label', text: `Stroke Width (${selectedPathLayer.strokeWidth}px)` }), pStrokeWRange),
        el('label', { className: 'bv-check-row' }, pClosedChk, el('span', { text: 'Closed Shape & Fill' })),
        el(
          'div',
          { className: 'bv-field' },
          el('label', { className: 'bv-label', text: 'Fill Color' }),
          el('div', { style: { display: 'flex', gap: '6px', alignItems: 'center' } },
            pFillColIn,
            el('button', {
              className: 'bv-mini-btn',
              text: 'Transparent',
              attrs: { type: 'button' },
              on: {
                click: () =>
                  mutateCover(actions, (c) => ({
                    ...c,
                    pathLayers: (c.pathLayers ?? []).map((p) => (p.id === selectedPathLayer.id ? { ...p, fillColor: 'transparent' } : p)),
                  })),
              },
            }),
          ),
        ),
        el('div', { className: 'bv-field' }, el('label', { className: 'bv-label', text: `Opacity (${Math.round(selectedPathLayer.opacity * 100)}%)` }), pOpRange),
        el('div', { className: 'bv-field' }, el('label', { className: 'bv-label', text: 'Blend Mode' }), pBlendSel),
        el('button', {
          className: 'bv-mini-btn',
          attrs: { type: 'button' },
          on: {
            click: () => {
              const delId = selectedPathLayer.id;
              clearCoverSelection();
              mutateCover(actions, (c) => ({ ...c, pathLayers: (c.pathLayers ?? []).filter((p) => p.id !== delId) }));
            },
          },
        }, icon('trash', 12), 'Delete Vector Path'),
      );
    } else if (activeFaceElementKey) {
      const faceFieldMap: Record<
        Exclude<FaceEditableFieldKey, ''>,
        { title: string; get: () => string; multiline?: boolean; patch: (val: string) => Partial<BookCoverConfig> }
      > = {
        'back-headline': {
          title: 'Back Cover Headline',
          get: () => cover.backHeadline || '',
          patch: (v) => ({ backHeadline: v }),
        },
        'back-blurb': {
          title: 'Back Cover Blurb',
          multiline: true,
          get: () => cover.backBlurb || '',
          patch: (v) => ({ backBlurb: v }),
        },
        'author-bio': {
          title: 'Back Cover Author Bio',
          multiline: true,
          get: () => cover.authorBio || '',
          patch: (v) => ({ authorBio: v }),
        },
        'spine-title': {
          title: 'Spine Title',
          get: () => cover.spineTitle || '',
          patch: (v) => ({ spineTitle: v }),
        },
        'front-flap': {
          title: 'Dust Jacket Front Flap Copy',
          multiline: true,
          get: () => cover.frontFlapText || '',
          patch: (v) => ({ frontFlapText: v }),
        },
        'back-flap': {
          title: 'Dust Jacket Back Flap Copy',
          multiline: true,
          get: () => cover.backFlapText || '',
          patch: (v) => ({ backFlapText: v }),
        },
      };
      const meta = faceFieldMap[activeFaceElementKey];
      const fieldInput = meta.multiline
        ? el('textarea', {
            className: 'bv-textarea',
            attrs: { rows: 5 },
            on: { change: () => mutateCover(actions, (c) => ({ ...c, ...meta.patch((fieldInput as HTMLTextAreaElement).value) })) },
          })
        : el('input', {
            className: 'bv-input',
            attrs: { type: 'text', value: meta.get() },
            on: { change: () => mutateCover(actions, (c) => ({ ...c, ...meta.patch((fieldInput as HTMLInputElement).value) })) },
          });
      if (meta.multiline) (fieldInput as HTMLTextAreaElement).value = meta.get();

      rightBody.append(
        el('span', { className: 'bv-panel-title', text: meta.title }),
        el('div', { className: 'bv-field' }, el('label', { className: 'bv-label', text: 'Copy / Text' }), fieldInput),
        el('span', {
          className: 'bv-label',
          text: `Target face: ${activeTargetFace().toUpperCase()}. New text, shapes, or graphics added from the left tools will be placed on this face.`,
        }),
      );
    } else if (activeSelectionKind === 'none') {
      const targetFaceLabel = activeTargetFace().replace('-', ' ').toUpperCase();
      rightBody.append(
        el('span', { className: 'bv-panel-title', text: 'No Selection' }),
        el('p', {
          className: 'bv-label',
          text: 'Click any object, title, text box, shape, vector path, or back/spine copy on the artboard to inspect and edit its properties. Click the board outside to clear selection.',
        }),
        el('div', { className: 'bv-field' },
          el('label', { className: 'bv-label', text: `Active Placement Face (${targetFaceLabel})` }),
          el('select', {
            className: 'bv-input',
            on: {
              change: (ev) => {
                activeEditFace = (ev.target as HTMLSelectElement).value as CoverFaceId;
                renderCoverStudio(container, actions);
              },
            },
          },
            el('option', { text: 'Front Cover', attrs: { value: 'front', selected: activeTargetFace() === 'front' } }),
            el('option', { text: 'Back Cover', attrs: { value: 'back', selected: activeTargetFace() === 'back' } }),
            el('option', { text: 'Spine', attrs: { value: 'spine', selected: activeTargetFace() === 'spine' } }),
            el('option', { text: 'Front Flap', attrs: { value: 'front-flap', selected: activeTargetFace() === 'front-flap' } }),
            el('option', { text: 'Back Flap', attrs: { value: 'back-flap', selected: activeTargetFace() === 'back-flap' } }),
          ),
        ),
      );
    } else {
      const activeEl = cover.elements[activeElementKey];
      const elKeySel = el(
        'select',
        {
          className: 'bv-input',
          on: {
            change: () => {
              activeElementKey = elKeySel.value as CoverElementKey;
              renderCoverStudio(container, actions);
            },
          },
        },
        el('option', { text: 'Title', attrs: { value: 'title', selected: activeElementKey === 'title' } }),
        el('option', { text: 'Subtitle', attrs: { value: 'subtitle', selected: activeElementKey === 'subtitle' } }),
        el('option', { text: 'Pen Name / Author', attrs: { value: 'author', selected: activeElementKey === 'author' } }),
        el('option', { text: 'Edition Banner', attrs: { value: 'edition', selected: activeElementKey === 'edition' } }),
        el('option', { text: 'Author Signature', attrs: { value: 'signature', selected: activeElementKey === 'signature' } }),
      );

      let elFontSizeLbl: HTMLElement | null = null;
      const elFontSizeIn = el('input', {
        attrs: { type: 'range', min: 10, max: 54, step: 1, value: activeEl.fontSize },
        on: {
          input: () => {
            const val = Number(elFontSizeIn.value);
            if (elFontSizeLbl) elFontSizeLbl.textContent = `Size (${val}px)`;
            container.querySelectorAll<HTMLElement>(`[data-cover-el="${activeElementKey}"]`).forEach((n) => {
              n.style.fontSize = `${val}px`;
            });
            mutateCover(
              actions,
              (c) => ({
                ...c,
                elements: { ...c.elements, [activeElementKey]: { ...c.elements[activeElementKey], fontSize: val } },
              }),
              false,
              false,
            );
          },
          change: () =>
            mutateCover(actions, (c) => ({
              ...c,
              elements: { ...c.elements, [activeElementKey]: { ...c.elements[activeElementKey], fontSize: Number(elFontSizeIn.value) } },
            }), true),
        },
      });
      const editionIn = el('input', {
        className: 'bv-input',
        attrs: { type: 'text', value: cover.editionLabel },
        on: { change: () => mutateCover(actions, (c) => ({ ...c, editionLabel: editionIn.value })) },
      });
      const elColorIn = el('input', {
        attrs: { type: 'color', value: activeEl.color || cover.textColor },
        on: {
          change: () =>
            mutateCover(actions, (c) => ({
              ...c,
              elements: { ...c.elements, [activeElementKey]: { ...c.elements[activeElementKey], color: elColorIn.value } },
            })),
        },
      });
      const elAlignSel = el(
        'select',
        {
          className: 'bv-input',
          on: {
            change: () =>
              mutateCover(actions, (c) => ({
                ...c,
                elements: { ...c.elements, [activeElementKey]: { ...c.elements[activeElementKey], align: elAlignSel.value as 'left' | 'center' | 'right' } },
              })),
          },
        },
        el('option', { text: 'Left', attrs: { value: 'left', selected: activeEl.align === 'left' } }),
        el('option', { text: 'Center', attrs: { value: 'center', selected: activeEl.align === 'center' } }),
        el('option', { text: 'Right', attrs: { value: 'right', selected: activeEl.align === 'right' } }),
      );
      const bookFieldVal =
        activeElementKey === 'title'
          ? project.title
          : activeElementKey === 'subtitle'
            ? project.subtitle
            : activeElementKey === 'author'
              ? penName
              : '';
      const bookFieldInput =
        activeElementKey === 'title' || activeElementKey === 'subtitle' || activeElementKey === 'author'
          ? el('input', {
              className: 'bv-input',
              attrs: { type: 'text', value: bookFieldVal },
              on: {
                change: (ev) => {
                  const val = (ev.target as HTMLInputElement).value;
                  actions.mutateProject((prev) => {
                    if (activeElementKey === 'title') return { ...prev, title: val };
                    if (activeElementKey === 'subtitle') return { ...prev, subtitle: val };
                    const next = normalizeProjectDefaults(prev);
                    if (next.authorIdentity) next.authorIdentity.penName = val;
                    return { ...next, author: val };
                  });
                },
              },
            })
          : null;
      const elVisibleChk = el('input', {
        className: 'bv-lever',
        attrs: { type: 'checkbox', role: 'switch', checked: activeEl.visible },
        on: {
          change: () =>
            mutateCover(actions, (c) => ({
              ...c,
              elements: { ...c.elements, [activeElementKey]: { ...c.elements[activeElementKey], visible: elVisibleChk.checked } },
            })),
        },
      });

      rightBody.append(
        el('span', { className: 'bv-panel-title', text: 'Front Text Element' }),
        el('div', { className: 'bv-field' }, el('label', { className: 'bv-label', text: 'Layer' }), elKeySel),
        ...(bookFieldInput
          ? [el('div', { className: 'bv-field' }, el('label', { className: 'bv-label', text: `${activeElementKey === 'author' ? 'Author / Pen Name' : activeElementKey.charAt(0).toUpperCase() + activeElementKey.slice(1)} Text` }), bookFieldInput)]
          : []),
        el('div', { className: 'bv-field' }, el('label', { className: 'bv-label', text: 'Edition Banner Text' }), editionIn),
        el('div', { className: 'bv-field' }, (elFontSizeLbl = el('label', { className: 'bv-label', text: `Size (${activeEl.fontSize}px)` })), elFontSizeIn),
        el('div', { className: 'bv-field' }, el('label', { className: 'bv-label', text: 'Text Color' }), elColorIn),
        el('div', { className: 'bv-field' }, el('label', { className: 'bv-label', text: 'Alignment' }), elAlignSel),
        el('label', { className: 'bv-check-row' }, elVisibleChk, el('span', { text: 'Visible on Front Cover' })),
        alignRow((nx, ny) =>
          mutateCover(actions, (c) => ({
            ...c,
            elements: {
              ...c.elements,
              [activeElementKey]: {
                ...c.elements[activeElementKey],
                xPct: nx ?? c.elements[activeElementKey].xPct,
                yPct: ny ?? c.elements[activeElementKey].yPct,
              },
            },
          })),
        ),
      );
    }
  }

  rightDock.append(rightTabs, rightBody);

  const leftResizer = createVerticalResizer({
    side: 'left',
    minWidth: 220,
    maxWidth: 440,
    cssVarName: '--qv-studio-left-w',
    ariaLabel: 'Resize Cover Studio tool panel',
    getWidth: () => actions.getState().settings.studioLeftWidthPx,
    onResizeEnd: (w) => actions.updateSettings({ studioLeftWidthPx: w }),
    onDoubleClickReset: () => 296,
  });

  const rightResizer = createVerticalResizer({
    side: 'right',
    minWidth: 220,
    maxWidth: 440,
    cssVarName: '--qv-studio-right-w',
    ariaLabel: 'Resize Cover Studio properties panel',
    getWidth: () => actions.getState().settings.studioRightWidthPx,
    onResizeEnd: (w) => actions.updateSettings({ studioRightWidthPx: w }),
    onDoubleClickReset: () => 276,
  });

  const workspace = el(
    'div',
    { className: 'qv-studio-layout' },
    leftDock,
    leftResizer,
    stageWrap,
    rightResizer,
    rightDock,
  );

  const shell = el('div', { className: 'qv-studio-shell' }, studioBar, workspace);
  container.appendChild(shell);

  leftBody.scrollTop = savedStudioLeftScroll;
  rightBody.scrollTop = savedStudioRightScroll;
  stageScroll.scrollTop = savedStudioStageScrollTop;
  requestAnimationFrame(() => {
    leftBody.scrollTop = savedStudioLeftScroll;
    rightBody.scrollTop = savedStudioRightScroll;
    stageScroll.scrollTop = savedStudioStageScrollTop;
  });
}
