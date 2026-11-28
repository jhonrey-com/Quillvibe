import type { AppActions } from '../core/app-context';
import { exportGenericFile } from '../core/bridge';
import { getActiveSessionPermissions } from '../core/collab';
import { routeConnector, type RectBox } from '../core/connector-router';
import {
  DEFAULT_FORCE_PARAMS,
  findShortestNarrativePath,
  ForceGraphSimulation,
  getNeighborhoodIds,
  resolveNodeColorByRules,
  type ForceParams,
} from '../core/force-engine';
import {
  addGraphEdge,
  addGraphGroup,
  addGraphNode,
  applyAutoLayout,
  applyRadialLayout,
  applyTimelineFlowLayout,
  changeGraphNodeKind,
  deleteGraphEdge,
  deleteGraphGroup,
  deleteGraphNode,
  exportGraphAsSvgString,
  GRAPH_KIND_LABELS,
  reverseGraphEdge,
  seedGraphFromProject,
  syncGraphNodeBackToBook,
  updateGraphEdge,
  updateGraphGroup,
  updateGraphNode,
} from '../core/graph';
import {
  exportStoryGraphToJsonCanvas,
  importJsonCanvasToStoryGraph,
  syncWikilinkEdgesInGraph,
} from '../core/graph-canvas-io';
import { normalizeProjectDefaults } from '../core/library';
import { newId } from '../core/manuscript';
import type {
  GraphAnchorSide,
  GraphArrowHead,
  GraphBoardTheme,
  GraphLineStyle,
  GraphNodeKind,
  GraphRoutingMode,
  StoryGraph,
  StoryGraphEdge,
  StoryGraphGroup,
  StoryGraphNode,
} from '../core/types';
import { attachContextMenu } from '../ui/context-menu';
import { clearNode, el, icon, svgEl } from '../ui/dom';

type GraphViewMode = 'storyboard' | 'force';
type GraphDensity = 'detailed' | 'standard' | 'compact';
type GraphLayoutMode = 'columns' | 'radial' | 'flow';

const ALL_GRAPH_KINDS: readonly GraphNodeKind[] = [
  'character',
  'plot',
  'scene',
  'storyline',
  'faction',
  'location',
  'item',
  'lore',
  'note',
  'custom',
];

let graphViewMode: GraphViewMode = 'storyboard';
let zoomScale = 1;
let panX = 0;
let panY = 0;
let selectedEdgeId = '';
let selectedGroupId = '';
const selectedNodeIds = new Set<string>();
let connectMode = false;
let connectSourceId = '';
let activeKindFilter: GraphNodeKind | 'all' = 'all';
let graphDensity: GraphDensity = 'detailed';
let edgeRouting: GraphRoutingMode = 'elbow';
let snapToGrid = true;
let showEdgeLabels = true;
let graphSearchQuery = '';
let propsCollapsed = false;
let propsDetached = false;
let propsFloatX = 24;
let propsFloatY = 24;

// Force-directed simulation controls
let forceParams: ForceParams = { ...DEFAULT_FORCE_PARAMS };
let hopDepthFilter: 0 | 1 | 2 | 3 = 0;
let pathSourceId = '';
let pathTargetId = '';
let activeForceRafId: number | null = null;
let activeGraphKeyHandler: ((e: KeyboardEvent) => void) | null = null;
let activeGraphWheelHandler: ((e: WheelEvent) => void) | null = null;

function withGraph(
  actions: AppActions,
  mutator: (g: StoryGraph) => StoryGraph,
  recordUndo = true,
): void {
  actions.mutateProject((prev) => {
    const base = normalizeProjectDefaults(prev);
    return {
      ...base,
      storyGraph: mutator(base.storyGraph!),
    };
  }, recordUndo);
}

function nodeCardBox(node: StoryGraphNode, cardEl?: HTMLElement): { w: number; h: number } {
  if (cardEl && cardEl.offsetWidth > 0 && cardEl.offsetHeight > 0) {
    return { w: cardEl.offsetWidth, h: cardEl.offsetHeight };
  }
  const w = node.width ?? (graphDensity === 'compact' ? 156 : graphDensity === 'standard' ? 174 : 196);
  const h = node.height ?? (graphDensity === 'compact' ? 50 : graphDensity === 'standard' ? 72 : 96);
  return { w, h };
}

function edgeDashArray(style: GraphLineStyle): string {
  if (style === 'dashed') return '6 4';
  if (style === 'dotted') return '2 4';
  return '';
}

function markerUrlFor(head: GraphArrowHead | undefined, pos: 'start' | 'end'): string {
  const h = head ?? (pos === 'end' ? 'arrow' : 'none');
  if (h === 'none') return '';
  if (h === 'diamond') return 'url(#bv-diamond)';
  if (h === 'circle') return 'url(#bv-circle)';
  return pos === 'start' ? 'url(#bv-arrow-start)' : 'url(#bv-arrow)';
}

function isPointInGroup(x: number, y: number, g: StoryGraphGroup): boolean {
  return x >= g.x && x <= g.x + g.width && y >= g.y && y <= g.y + g.height;
}

export function renderGraphView(container: HTMLElement, rawActions: AppActions): void {
  if (activeForceRafId !== null) {
    cancelAnimationFrame(activeForceRafId);
    activeForceRafId = null;
  }
  clearNode(container);

  const initialState = rawActions.getState();
  const graphPerms = getActiveSessionPermissions(initialState.project);
  const actions: AppActions = graphPerms.canEditBibleAndGraph
    ? rawActions
    : {
        ...rawActions,
        mutateProject: () => {
          rawActions.notify('Story Graph editing is disabled for your collaborator role.');
        },
      };

  const state = actions.getState();
  const project = normalizeProjectDefaults(state.project);
  const rawGraph = project.storyGraph!;
  const graph = rawGraph.autoSyncWithBook !== false ? seedGraphFromProject(project) : rawGraph;

  if (state.activeGraphNodeId && !graph.nodes.some((n) => n.id === state.activeGraphNodeId)) {
    state.activeGraphNodeId = graph.nodes[0]?.id ?? '';
  }

  // Hidden .canvas file uploader
  const canvasImportInput = el('input', {
    attrs: { type: 'file', accept: '.canvas,application/json' },
    style: { display: 'none' },
    on: {
      change: async () => {
        const f = canvasImportInput.files?.[0];
        canvasImportInput.value = '';
        if (!f) return;
        try {
          const text = await f.text();
          const imported = importJsonCanvasToStoryGraph(text);
          withGraph(actions, () => imported);
          actions.notify(`Imported ${imported.nodes.length} nodes from ${f.name}`);
        } catch (err) {
          actions.notify(err instanceof Error ? err.message : 'Invalid .canvas JSON file.');
        }
      },
    },
  });

  // Compute path highlighting & neighborhood filter sets
  const highlightedPath =
    pathSourceId && pathTargetId ? findShortestNarrativePath(graph, pathSourceId, pathTargetId) : null;
  const pathNodeSet = new Set(highlightedPath?.nodeIds ?? []);
  const pathEdgeSet = new Set(highlightedPath?.edgeIds ?? []);

  const hopAllowedIds =
    hopDepthFilter > 0 && state.activeGraphNodeId
      ? getNeighborhoodIds(graph, state.activeGraphNodeId, hopDepthFilter)
      : null;

  const visibleNodes = graph.nodes.filter((n) => {
    if (activeKindFilter !== 'all' && n.kind !== activeKindFilter) return false;
    if (hopAllowedIds && !hopAllowedIds.has(n.id)) return false;
    return true;
  });
  const visibleIds = new Set(visibleNodes.map((n) => n.id));
  const visibleEdges = graph.edges.filter(
    (e) => visibleIds.has(e.sourceId) && visibleIds.has(e.targetId),
  );
  const edgeCounts = new Map<string, number>();
  for (const e of graph.edges) {
    edgeCounts.set(e.sourceId, (edgeCounts.get(e.sourceId) ?? 0) + 1);
    edgeCounts.set(e.targetId, (edgeCounts.get(e.targetId) ?? 0) + 1);
  }

  // Mode toggle buttons
  const modeToggle = el(
    'div',
    { className: 'bv-subbar-group', style: { gap: '2px' } },
    el('button', {
      className: `bv-fmt-btn${graphViewMode === 'storyboard' ? ' is-active' : ''}`,
      text: 'Storyboard',
      attrs: { type: 'button', title: 'Spatial infinite storyboard cards, groups & smart connectors' },
      on: {
        click: () => {
          graphViewMode = 'storyboard';
          renderGraphView(container, actions);
        },
      },
    }),
    el('button', {
      className: `bv-fmt-btn${graphViewMode === 'force' ? ' is-active' : ''}`,
      text: 'Force Graph',
      attrs: { type: 'button', title: 'Interactive physics constellation, depth filter & pathfinder' },
      on: {
        click: () => {
          graphViewMode = 'force';
          renderGraphView(container, actions);
        },
      },
    }),
  );

  const filterSelect = el(
    'select',
    {
      className: 'bv-select',
      attrs: { 'aria-label': 'Filter graph node types' },
      on: {
        change: () => {
          activeKindFilter = filterSelect.value as GraphNodeKind | 'all';
          renderGraphView(container, actions);
        },
      },
    },
    el('option', { text: 'All Types', attrs: { value: 'all', selected: activeKindFilter === 'all' } }),
    ...ALL_GRAPH_KINDS.map((k) =>
      el('option', { text: GRAPH_KIND_LABELS[k], attrs: { value: k, selected: activeKindFilter === k } }),
    ),
  );

  const densitySelect = el(
    'select',
    {
      className: 'bv-select',
      attrs: { 'aria-label': 'Graph card density' },
      on: {
        change: () => {
          graphDensity = densitySelect.value as GraphDensity;
          renderGraphView(container, actions);
        },
      },
    },
    el('option', { text: 'View: Detailed', attrs: { value: 'detailed', selected: graphDensity === 'detailed' } }),
    el('option', { text: 'View: Standard', attrs: { value: 'standard', selected: graphDensity === 'standard' } }),
    el('option', { text: 'View: Compact', attrs: { value: 'compact', selected: graphDensity === 'compact' } }),
  );

  const edgeStyleSel = el(
    'select',
    {
      className: 'bv-select',
      attrs: { 'aria-label': 'Connector routing mode' },
      on: {
        change: () => {
          edgeRouting = edgeStyleSel.value as GraphRoutingMode;
          renderGraphView(container, actions);
        },
      },
    },
    el('option', { text: 'Lines: Elbow', attrs: { value: 'elbow', selected: edgeRouting === 'elbow' } }),
    el('option', { text: 'Lines: Curved', attrs: { value: 'curved', selected: edgeRouting === 'curved' } }),
    el('option', { text: 'Lines: Straight', attrs: { value: 'straight', selected: edgeRouting === 'straight' } }),
  );

  const layoutSelect = el(
    'select',
    {
      className: 'bv-select',
      attrs: { 'aria-label': 'Auto-arrange graph layout' },
      on: {
        change: () => {
          const val = layoutSelect.value as GraphLayoutMode;
          panX = 0;
          panY = 0;
          zoomScale = 1;
          withGraph(actions, (g) =>
            val === 'radial'
              ? applyRadialLayout(g)
              : val === 'flow'
                ? applyTimelineFlowLayout(g)
                : applyAutoLayout(g),
          );
        },
      },
    },
    el('option', { text: 'Layout…', attrs: { value: '', selected: true, disabled: true } }),
    el('option', { text: 'Arrange Columns', attrs: { value: 'columns' } }),
    el('option', { text: 'Radial Cast Hub', attrs: { value: 'radial' } }),
    el('option', { text: 'Timeline Story Flow', attrs: { value: 'flow' } }),
  );

  const newKindSelect = el(
    'select',
    { className: 'bv-select', attrs: { 'aria-label': 'New node type' } },
    ...ALL_GRAPH_KINDS.map((k) => el('option', { text: GRAPH_KIND_LABELS[k], attrs: { value: k } })),
  );

  const newLabelInput = el('input', {
    className: 'bv-input',
    style: { width: '124px', height: '26px' },
    attrs: { type: 'text', placeholder: 'Add node…', 'aria-label': 'New graph node title' },
  });

  let applySearchHighlight = () => {};
  const searchInput = el('input', {
    className: 'bv-input',
    style: { width: '122px', height: '26px' },
    attrs: { type: 'search', value: graphSearchQuery, placeholder: 'Find node/#tag…', 'aria-label': 'Search graph nodes' },
    on: {
      input: () => {
        graphSearchQuery = searchInput.value;
        applySearchHighlight();
      },
    },
  });

  let canvasWrap!: HTMLElement;
  let storyboardViewportEl: HTMLElement | null = null;
  let storyboardSyncGrid: (() => void) | null = null;

  const applyGraphZoom = (nextZoom: number, anchorClientX?: number, anchorClientY?: number) => {
    const prevZoom = Math.max(0.25, zoomScale);
    const clampedZoom = Math.max(0.25, Math.min(2.5, Number(nextZoom.toFixed(3))));
    if (canvasWrap) {
      const rect = canvasWrap.getBoundingClientRect();
      const cx = typeof anchorClientX === 'number' ? anchorClientX : rect.left + rect.width / 2;
      const cy = typeof anchorClientY === 'number' ? anchorClientY : rect.top + rect.height / 2;
      const wx = (cx - rect.left - panX) / prevZoom;
      const wy = (cy - rect.top - panY) / prevZoom;
      panX = Math.round(cx - rect.left - wx * clampedZoom);
      panY = Math.round(cy - rect.top - wy * clampedZoom);
    }
    zoomScale = clampedZoom;
    if (storyboardViewportEl) {
      storyboardViewportEl.style.transform = `translate(${panX}px, ${panY}px) scale(${zoomScale})`;
      storyboardSyncGrid?.();
    }
  };

  const fitCanvas = (nodesSubset?: StoryGraphNode[]) => {
    const list = nodesSubset && nodesSubset.length > 0 ? nodesSubset : visibleNodes;
    if (list.length === 0) {
      panX = 0;
      panY = 0;
      zoomScale = 1;
    } else {
      const minX = Math.min(...list.map((n) => n.x)) - 60;
      const maxX = Math.max(...list.map((n) => n.x + 220)) + 60;
      const minY = Math.min(...list.map((n) => n.y)) - 60;
      const maxY = Math.max(...list.map((n) => n.y + 120)) + 60;
      const cw = Math.max(480, canvasWrap?.clientWidth || 720);
      const ch = Math.max(360, canvasWrap?.clientHeight || 480);
      const bw = Math.max(240, maxX - minX);
      const bh = Math.max(200, maxY - minY);
      zoomScale = Math.max(0.3, Math.min(1.3, Number(Math.min(cw / bw, ch / bh).toFixed(2))));
      panX = Math.round((cw - bw * zoomScale) / 2 - minX * zoomScale);
      panY = Math.round((ch - bh * zoomScale) / 2 - minY * zoomScale);
    }
    renderGraphView(container, actions);
  };

  const exportCanvasJson = () => {
    const payload = exportStoryGraphToJsonCanvas(graph);
    void exportGenericFile({
      suggestedName: `${project.title || 'story'}-board`,
      extension: 'canvas',
      description: 'Spatial Storyboard (.canvas)',
      mimeType: 'application/json;charset=utf-8',
      textContent: payload,
    }).then((out) => {
      if (out) actions.notify('Exported .canvas board file');
    });
  };

  const exportHighResPng = () => {
    const nodes = graph.nodes;
    const minX = Math.min(0, ...nodes.map((n) => n.x - 40));
    const minY = Math.min(0, ...nodes.map((n) => n.y - 40));
    const maxX = Math.max(960, ...nodes.map((n) => n.x + 260));
    const maxY = Math.max(640, ...nodes.map((n) => n.y + 160));
    const w = Math.round((maxX - minX) * 2);
    const h = Math.round((maxY - minY) * 2);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(2, 2);
    ctx.translate(-minX, -minY);
    ctx.fillStyle = '#08080a';
    ctx.fillRect(minX, minY, maxX - minX, maxY - minY);
    const byId = new Map(nodes.map((n) => [n.id, n]));
    for (const grp of graph.groups ?? []) {
      ctx.save();
      ctx.fillStyle = 'rgba(199, 169, 123, 0.08)';
      ctx.strokeStyle = grp.color || '#c7a97b';
      ctx.setLineDash([6, 4]);
      ctx.fillRect(grp.x, grp.y, grp.width, grp.height);
      ctx.strokeRect(grp.x, grp.y, grp.width, grp.height);
      ctx.fillStyle = grp.color || '#c7a97b';
      ctx.font = 'bold 12px Inter, sans-serif';
      ctx.fillText(grp.label.toUpperCase(), grp.x + 12, grp.y + 20);
      ctx.restore();
    }
    for (const e of graph.edges) {
      const s = byId.get(e.sourceId);
      const d = byId.get(e.targetId);
      if (!s || !d) continue;
      ctx.save();
      ctx.strokeStyle = e.color || '#8aa4c8';
      ctx.lineWidth = 1.6;
      if (e.style === 'dashed') ctx.setLineDash([6, 4]);
      else if (e.style === 'dotted') ctx.setLineDash([2, 4]);
      const sx = s.x + 98;
      const sy = s.y + 40;
      const tx = d.x + 98;
      const ty = d.y + 40;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(tx, ty);
      ctx.stroke();
      if (e.label) {
        ctx.fillStyle = '#c8ced9';
        ctx.font = '11px Inter, sans-serif';
        ctx.fillText(e.label, (sx + tx) / 2, (sy + ty) / 2 - 6);
      }
      ctx.restore();
    }
    for (const n of nodes) {
      const box = nodeCardBox(n);
      ctx.save();
      ctx.fillStyle = '#12151e';
      ctx.strokeStyle = '#323642';
      ctx.beginPath();
      ctx.roundRect(n.x, n.y, box.w, box.h, 7);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = resolveNodeColorByRules(n, graph.colorRules);
      ctx.fillRect(n.x, n.y, box.w, 3);
      ctx.fillStyle = '#eceef2';
      ctx.font = '600 13px Inter, sans-serif';
      ctx.fillText(n.label, n.x + 12, n.y + 34);
      ctx.fillStyle = '#8b93a5';
      ctx.font = '11px Inter, sans-serif';
      ctx.fillText(n.subtitle || GRAPH_KIND_LABELS[n.kind], n.x + 12, n.y + 52);
      ctx.restore();
    }
    const pngUrl = canvas.toDataURL('image/png');
    const b64 = pngUrl.replace(/^data:image\/png;base64,/, '');
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    void exportGenericFile({
      suggestedName: `${project.title || 'story'}-graph`,
      extension: 'png',
      description: 'Story Graph PNG Snapshot',
      mimeType: 'image/png',
      binaryBytes: bytes,
    }).then((out) => {
      if (out) actions.notify('Exported high-resolution Story Graph PNG');
    });
  };

  const subbar = el(
    'div',
    { className: 'bv-subbar' },
    modeToggle,
    el(
      'div',
      { className: 'bv-subbar-group' },
      newKindSelect,
      newLabelInput,
      el(
        'button',
        {
          className: 'bv-mini-btn',
          tooltip: { title: 'Add Node', short: 'Create a node of the selected type on the canvas.' },
          attrs: { type: 'button' },
          on: {
            click: () => {
              const kind = newKindSelect.value as GraphNodeKind;
              const label = newLabelInput.value.trim() || `New ${GRAPH_KIND_LABELS[kind]}`;
              let createdId = '';
              withGraph(actions, (g) => {
                const res = addGraphNode(g, {
                  kind,
                  label,
                  x: Math.round((280 - panX) / zoomScale + (g.nodes.length % 5) * 45),
                  y: Math.round((180 - panY) / zoomScale + (g.nodes.length % 4) * 45),
                });
                createdId = res.node.id;
                return res.graph;
              }, false);
              selectedEdgeId = '';
              selectedGroupId = '';
              actions.setState({ activeGraphNodeId: createdId }, true);
            },
          },
        },
        icon('plus', 12),
        'Node',
      ),
      el('button', {
        className: 'bv-mini-btn',
        text: '+ Group',
        tooltip: { title: 'Add Act / Section Frame', short: 'Create a container frame that moves child cards together.' },
        attrs: { type: 'button' },
        on: {
          click: () => {
            withGraph(actions, (g) =>
              addGraphGroup(g, {
                x: Math.round((160 - panX) / zoomScale),
                y: Math.round((110 - panY) / zoomScale),
              }),
            );
          },
        },
      }),
      el('button', {
        className: `bv-fmt-btn${connectMode ? ' is-active' : ''}`,
        text: connectMode ? 'Click 2 Nodes…' : 'Connect',
        attrs: { type: 'button' },
        on: {
          click: () => {
            connectMode = !connectMode;
            connectSourceId = '';
            renderGraphView(container, actions);
          },
        },
      }),
      searchInput,
    ),
    el(
      'div',
      { className: 'bv-subbar-group' },
      graphViewMode === 'storyboard' ? densitySelect : null,
      graphViewMode === 'storyboard' ? edgeStyleSel : null,
      layoutSelect,
      filterSelect,
      graphViewMode === 'storyboard'
        ? el('button', {
            className: `bv-mini-btn${snapToGrid ? ' is-active' : ''}`,
            text: 'Grid',
            attrs: { type: 'button' },
            on: {
              click: () => {
                snapToGrid = !snapToGrid;
                renderGraphView(container, actions);
              },
            },
          })
        : null,
      el('button', {
        className: `bv-mini-btn${showEdgeLabels ? ' is-active' : ''}`,
        text: 'Labels',
        attrs: { type: 'button' },
        on: {
          click: () => {
            showEdgeLabels = !showEdgeLabels;
            renderGraphView(container, actions);
          },
        },
      }),
      (() => {
        const boardThemeSel = el(
          'select',
          {
            className: 'bv-select',
            attrs: { 'aria-label': 'Story Graph board background' },
            tooltip: { title: 'Board Surface', short: 'Choose background style for the Story Graph canvas.' },
            on: {
              change: () =>
                withGraph(actions, (g) => ({
                  ...g,
                  boardTheme: boardThemeSel.value as GraphBoardTheme,
                })),
            },
          },
          el('option', { text: 'Board: Obsidian Dots', attrs: { value: 'obsidian-dots', selected: (graph.boardTheme ?? 'obsidian-dots') === 'obsidian-dots' } }),
          el('option', { text: 'Board: Slate Blueprint', attrs: { value: 'slate-blueprint', selected: graph.boardTheme === 'slate-blueprint' } }),
          el('option', { text: 'Board: Warm Paper', attrs: { value: 'warm-paper', selected: graph.boardTheme === 'warm-paper' } }),
          el('option', { text: 'Board: Charcoal Solid', attrs: { value: 'charcoal-solid', selected: graph.boardTheme === 'charcoal-solid' } }),
          el('option', { text: 'Board: Ivory Grid', attrs: { value: 'ivory-grid', selected: graph.boardTheme === 'ivory-grid' } }),
        );
        return boardThemeSel;
      })(),
      el('button', {
        className: `bv-mini-btn${graph.autoSyncWithBook !== false ? ' is-active' : ''}`,
        text: graph.autoSyncWithBook !== false ? 'Auto-Sync: On' : 'Auto-Sync: Off',
        tooltip: {
          title: 'Two-Way Book Sync',
          short: 'Keep linked Scene and Story Bible titles/notes synchronized with Story Graph edits.',
        },
        attrs: { type: 'button' },
        on: {
          click: () => {
            const nextAuto = !(graph.autoSyncWithBook !== false);
            withGraph(actions, (g) => ({ ...g, autoSyncWithBook: nextAuto }));
            actions.notify(nextAuto ? 'Two-way Story Graph sync enabled' : 'Two-way Story Graph sync paused');
          },
        },
      }),
      el('button', {
        className: 'bv-fmt-btn',
        text: 'Sync Now',
        attrs: { type: 'button' },
        on: {
          click: () => {
            actions.mutateProject((prev) => ({
              ...prev,
              storyGraph: seedGraphFromProject(prev),
            }));
            actions.notify('Synced graph with Story Bible and Manuscript');
          },
        },
      }),
      el('button', {
        className: 'bv-mini-btn',
        text: 'Fit',
        tooltip: { title: 'Fit Canvas (Shift+1)', short: 'Frame the entire graph cleanly inside the viewport.' },
        attrs: { type: 'button' },
        on: { click: () => fitCanvas() },
      }),
      el('button', {
        className: 'bv-mini-btn',
        text: '.canvas',
        tooltip: { title: 'Export .canvas JSON', short: 'Save lossless JSON Canvas board file.' },
        attrs: { type: 'button' },
        on: { click: exportCanvasJson },
      }),
      el('button', {
        className: 'bv-mini-btn',
        text: 'Import',
        tooltip: { title: 'Import .canvas JSON', short: 'Load an existing .canvas spatial board into this book.' },
        attrs: { type: 'button' },
        on: { click: () => canvasImportInput.click() },
      }),
      el('button', {
        className: 'bv-mini-btn',
        text: 'PNG',
        tooltip: { title: 'Export High-Res PNG', short: 'Render full spatial board to PNG image.' },
        attrs: { type: 'button' },
        on: { click: exportHighResPng },
      }),
      el('button', {
        className: 'bv-mini-btn',
        text: 'SVG',
        attrs: { type: 'button' },
        on: {
          click: () => {
            const svgOut = exportGraphAsSvgString(graph);
            void exportGenericFile({
              suggestedName: `${project.title || 'story'}-graph`,
              extension: 'svg',
              description: 'Story Graph Vector SVG',
              mimeType: 'image/svg+xml;charset=utf-8',
              textContent: svgOut,
            }).then((out) => {
              if (out) actions.notify('Exported Story Graph SVG');
            });
          },
        },
      }),
      el('button', {
        className: 'bv-mini-btn',
        text: 'Undo',
        attrs: { type: 'button', disabled: !actions.canUndo() },
        on: { click: () => actions.undo() },
      }),
      el('button', {
        className: 'bv-mini-btn',
        text: 'Redo',
        attrs: { type: 'button', disabled: !actions.canRedo() },
        on: { click: () => actions.redo() },
      }),
    ),
  );

  // Scoped keyboard shortcuts (Shift+1/2, Ctrl/Cmd + +/-/0) & trackpad/wheel zoom for Story Graph
  if (activeGraphKeyHandler) {
    window.removeEventListener('keydown', activeGraphKeyHandler);
  }
  activeGraphKeyHandler = (e: KeyboardEvent) => {
    if (!document.body.contains(canvasWrap)) {
      window.removeEventListener('keydown', activeGraphKeyHandler!);
      activeGraphKeyHandler = null;
      return;
    }
    const ae = document.activeElement as HTMLElement | null;
    if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.tagName === 'SELECT')) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && (e.key === '=' || e.key === '+' || e.code === 'Equal' || e.code === 'NumpadAdd')) {
      e.preventDefault();
      applyGraphZoom(zoomScale * 1.15);
    } else if (mod && (e.key === '-' || e.key === '_' || e.code === 'Minus' || e.code === 'NumpadSubtract')) {
      e.preventDefault();
      applyGraphZoom(zoomScale / 1.15);
    } else if (mod && (e.key === '0' || e.code === 'Digit0' || e.code === 'Numpad0')) {
      e.preventDefault();
      fitCanvas();
    } else if (e.shiftKey && e.code === 'Digit1') {
      e.preventDefault();
      fitCanvas();
    } else if (e.shiftKey && e.code === 'Digit2') {
      e.preventDefault();
      const targetNodes = graph.nodes.filter(
        (n) => selectedNodeIds.has(n.id) || n.id === state.activeGraphNodeId,
      );
      if (targetNodes.length > 0) fitCanvas(targetNodes);
    } else if (e.key === 'Escape') {
      if (state.activeGraphNodeId || selectedEdgeId || selectedGroupId || selectedNodeIds.size > 0 || connectMode) {
        selectedEdgeId = '';
        selectedGroupId = '';
        selectedNodeIds.clear();
        connectMode = false;
        connectSourceId = '';
        actions.setState({ activeGraphNodeId: '' }, true);
      }
    }
  };
  window.addEventListener('keydown', activeGraphKeyHandler);

  if (activeGraphWheelHandler) {
    window.removeEventListener('wheel', activeGraphWheelHandler);
  }
  activeGraphWheelHandler = (e: WheelEvent) => {
    if (!document.body.contains(canvasWrap)) {
      window.removeEventListener('wheel', activeGraphWheelHandler!);
      activeGraphWheelHandler = null;
      return;
    }
    const target = e.target as Node | null;
    if (!target || !container.contains(target)) return;
    const overCanvas = canvasWrap && canvasWrap.contains(target);
    if (!e.ctrlKey && !e.metaKey && !overCanvas) return;

    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      const rawStep = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      const factor = Math.exp(-Math.max(-180, Math.min(180, rawStep)) * 0.0055);
      applyGraphZoom(zoomScale * factor, e.clientX, e.clientY);
      return;
    }
    if (Math.abs(e.deltaX) > 0 || e.shiftKey) {
      panX -= e.shiftKey && e.deltaX === 0 ? e.deltaY : e.deltaX;
      if (!e.shiftKey) panY -= e.deltaY;
      if (storyboardViewportEl) {
        storyboardViewportEl.style.transform = `translate(${panX}px, ${panY}px) scale(${zoomScale})`;
        storyboardSyncGrid?.();
      }
      return;
    }
    const rawStep = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    const factor = Math.exp(-Math.max(-180, Math.min(180, rawStep)) * 0.0038);
    applyGraphZoom(zoomScale * factor, e.clientX, e.clientY);
  };
  window.addEventListener('wheel', activeGraphWheelHandler, { passive: false });

  canvasWrap = el('div', {
    className: 'bv-graph-canvas-wrap',
    dataset: { boardTheme: graph.boardTheme ?? 'obsidian-dots' },
  });

  let gestureGraphZoom = zoomScale;
  canvasWrap.addEventListener(
    'gesturestart' as keyof HTMLElementEventMap,
    ((e: Event & { scale?: number }) => {
      e.preventDefault();
      gestureGraphZoom = zoomScale;
    }) as EventListener,
    { passive: false },
  );
  canvasWrap.addEventListener(
    'gesturechange' as keyof HTMLElementEventMap,
    ((e: Event & { scale?: number }) => {
      e.preventDefault();
      if (typeof e.scale === 'number' && Number.isFinite(e.scale)) {
        applyGraphZoom(gestureGraphZoom * e.scale);
      }
    }) as EventListener,
    { passive: false },
  );

  if (graphViewMode === 'force') {
    // ================= FORCE-DIRECTED GRAPH MODE (2D CANVAS @ 60FPS) =================
    const sim = new ForceGraphSimulation(
      { nodes: visibleNodes, edges: visibleEdges, groups: graph.groups, colorRules: graph.colorRules },
      460,
      310,
    );
    const nodeById = new Map(visibleNodes.map((n) => [n.id, n]));
    const canvas = document.createElement('canvas');
    canvas.className = 'qv-force-canvas';
    canvasWrap.appendChild(canvas);

    let hoverNodeId: string | null = null;
    let draggedBodyId: string | null = null;
    let draggedMoved = false;

    const addSliderRow = (
      label: string,
      min: number,
      max: number,
      step: number,
      value: number,
      onChange: (v: number) => void,
    ) => {
      const valLbl = el('span', { className: 'bv-mono-tag', text: String(value) });
      const inp = el('input', {
        attrs: { type: 'range', min, max, step, value },
        on: {
          input: () => {
            const v = Number(inp.value);
            valLbl.textContent = String(v);
            onChange(v);
          },
        },
      });
      return el(
        'div',
        { className: 'bv-field', style: { marginBottom: '2px' } },
        el('div', { style: { display: 'flex', justifyContent: 'space-between' } }, el('label', { className: 'bv-label', text: label }), valLbl),
        inp,
      );
    };

    const depthSel = el(
      'select',
      {
        className: 'bv-input',
        on: {
          change: () => {
            hopDepthFilter = Number(depthSel.value) as 0 | 1 | 2 | 3;
            renderGraphView(container, actions);
          },
        },
      },
      el('option', { text: 'Depth: All Nodes', attrs: { value: '0', selected: hopDepthFilter === 0 } }),
      el('option', { text: '1-Hop Neighbors', attrs: { value: '1', selected: hopDepthFilter === 1 } }),
      el('option', { text: '2-Hop Cluster', attrs: { value: '2', selected: hopDepthFilter === 2 } }),
      el('option', { text: '3-Hop Reach', attrs: { value: '3', selected: hopDepthFilter === 3 } }),
    );

    const pathFromSel = el(
      'select',
      {
        className: 'bv-input',
        on: {
          change: () => {
            pathSourceId = pathFromSel.value;
            renderGraphView(container, actions);
          },
        },
      },
      el('option', { text: 'Path Start…', attrs: { value: '', selected: !pathSourceId } }),
      ...graph.nodes.map((n) => el('option', { text: n.label, attrs: { value: n.id, selected: pathSourceId === n.id } })),
    );
    const pathToSel = el(
      'select',
      {
        className: 'bv-input',
        on: {
          change: () => {
            pathTargetId = pathToSel.value;
            renderGraphView(container, actions);
          },
        },
      },
      el('option', { text: 'Path Target…', attrs: { value: '', selected: !pathTargetId } }),
      ...graph.nodes.map((n) => el('option', { text: n.label, attrs: { value: n.id, selected: pathTargetId === n.id } })),
    );

    const hud = el(
      'div',
      { className: 'qv-force-hud' },
      el('span', { className: 'bv-panel-title', text: 'Force Simulation' }),
      addSliderRow('Center Gravity', 0.01, 0.25, 0.01, forceParams.centerForce, (v) => (forceParams.centerForce = v)),
      addSliderRow('Repulsion', 1200, 14000, 200, forceParams.repelForce, (v) => (forceParams.repelForce = v)),
      addSliderRow('Link Tension', 0.02, 0.4, 0.02, forceParams.linkForce, (v) => (forceParams.linkForce = v)),
      addSliderRow('Link Spacing', 60, 320, 10, forceParams.linkDistance, (v) => (forceParams.linkDistance = v)),
      el('div', { className: 'bv-field' }, el('label', { className: 'bv-label', text: 'Local Hop Filter' }), depthSel),
      el('div', { className: 'bv-field' }, el('label', { className: 'bv-label', text: 'Shortest Path Tracer' }), pathFromSel, pathToSel),
      highlightedPath
        ? el('div', { className: 'bv-mono-tag', text: `Path: ${highlightedPath.nodeIds.length - 1} steps` })
        : null,
    );
    hud.addEventListener('pointerdown', (e) => e.stopPropagation());
    canvasWrap.appendChild(hud);

    const toWorld = (clientX: number, clientY: number) => {
      const r = canvas.getBoundingClientRect();
      return {
        x: (clientX - r.left - panX) / zoomScale,
        y: (clientY - r.top - panY) / zoomScale,
      };
    };

    const pickBodyAt = (wx: number, wy: number) => {
      for (const b of sim.bodies.values()) {
        if (Math.hypot(wx - b.x, wy - b.y) <= b.radius + 6) return b;
      }
      return null;
    };

    let forcePanning = false;
    let forcePanMoved = false;
    let fPanX = 0;
    let fPanY = 0;
    let fOrigPanX = panX;
    let fOrigPanY = panY;

    canvas.addEventListener('pointerdown', (e) => {
      const w = toWorld(e.clientX, e.clientY);
      const hit = pickBodyAt(w.x, w.y);
      if (hit) {
        draggedBodyId = hit.id;
        draggedMoved = false;
        hit.pinned = true;
      } else {
        forcePanning = true;
        forcePanMoved = false;
        fPanX = e.clientX;
        fPanY = e.clientY;
        fOrigPanX = panX;
        fOrigPanY = panY;
      }
    });

    canvas.addEventListener('pointermove', (e) => {
      const w = toWorld(e.clientX, e.clientY);
      if (draggedBodyId) {
        draggedMoved = true;
        const body = sim.bodies.get(draggedBodyId);
        if (body) {
          body.x = w.x;
          body.y = w.y;
          body.vx = 0;
          body.vy = 0;
        }
        return;
      }
      if (forcePanning) {
        if (Math.hypot(e.clientX - fPanX, e.clientY - fPanY) > 4) {
          forcePanMoved = true;
        }
        panX = fOrigPanX + (e.clientX - fPanX);
        panY = fOrigPanY + (e.clientY - fPanY);
        return;
      }
      const hit = pickBodyAt(w.x, w.y);
      hoverNodeId = hit?.id ?? null;
      canvas.style.cursor = hit ? 'pointer' : 'grab';
    });

    canvas.addEventListener('pointerup', () => {
      if (draggedBodyId) {
        const id = draggedBodyId;
        const b = sim.bodies.get(id);
        draggedBodyId = null;
        if (b && draggedMoved) {
          withGraph(actions, (g) => updateGraphNode(g, id, { x: Math.round(b.x), y: Math.round(b.y), pinned: true }));
        } else {
          selectedEdgeId = '';
          selectedGroupId = '';
          actions.setState({ activeGraphNodeId: id }, true);
        }
      } else if (forcePanning && !forcePanMoved) {
        const hadSelection =
          Boolean(state.activeGraphNodeId) ||
          Boolean(selectedEdgeId) ||
          Boolean(selectedGroupId) ||
          selectedNodeIds.size > 0;
        selectedEdgeId = '';
        selectedGroupId = '';
        selectedNodeIds.clear();
        if (hadSelection) {
          actions.setState({ activeGraphNodeId: '' }, true);
        }
      }
      forcePanning = false;
      forcePanMoved = false;
    });

    const drawFrame = () => {
      if (!canvas.isConnected) return;
      const rect = canvasWrap.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const cw = Math.max(300, Math.floor(rect.width));
      const ch = Math.max(240, Math.floor(rect.height));
      if (canvas.width !== cw * dpr || canvas.height !== ch * dpr) {
        canvas.width = cw * dpr;
        canvas.height = ch * dpr;
      }
      sim.step(forceParams);
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.save();
        ctx.scale(dpr, dpr);
        ctx.fillStyle = '#07080a';
        ctx.fillRect(0, 0, cw, ch);
        ctx.translate(panX, panY);
        ctx.scale(zoomScale, zoomScale);

        const qLower = graphSearchQuery.trim().toLowerCase();
        const activeId = hoverNodeId || state.activeGraphNodeId;

        for (const e of visibleEdges) {
          const sa = sim.bodies.get(e.sourceId);
          const sb = sim.bodies.get(e.targetId);
          if (!sa || !sb) continue;
          const isPathEdge = pathEdgeSet.has(e.id);
          const isIncident = Boolean(activeId) && (e.sourceId === activeId || e.targetId === activeId);
          ctx.save();
          ctx.beginPath();
          ctx.strokeStyle = isPathEdge ? '#f0c674' : isIncident ? '#c7a97b' : e.color || '#4a5263';
          ctx.lineWidth = isPathEdge ? 3 : isIncident ? 2 : 1.1;
          ctx.globalAlpha = activeId && !isIncident && !isPathEdge ? 0.22 : 0.85;
          if (e.style === 'dashed') ctx.setLineDash([5, 4]);
          else if (e.style === 'dotted') ctx.setLineDash([2, 3]);
          ctx.moveTo(sa.x, sa.y);
          ctx.lineTo(sb.x, sb.y);
          ctx.stroke();
          if (showEdgeLabels && zoomScale >= 0.7 && e.label && (isIncident || isPathEdge)) {
            ctx.fillStyle = '#d4dae6';
            ctx.font = '10px Inter, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(e.label, (sa.x + sb.x) / 2, (sa.y + sb.y) / 2 - 5);
          }
          ctx.restore();
        }

        for (const b of sim.bodies.values()) {
          const node = nodeById.get(b.id);
          if (!node) continue;
          const fill = resolveNodeColorByRules(node, graph.colorRules);
          const matchesQuery =
            !qLower || `${node.label} ${node.subtitle} ${(node.tags ?? []).join(' ')}`.toLowerCase().includes(qLower);
          const isPath = pathNodeSet.has(node.id);
          const isSel = node.id === activeId;
          ctx.save();
          ctx.globalAlpha = matchesQuery ? 1 : 0.2;
          ctx.beginPath();
          ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
          ctx.fillStyle = fill;
          ctx.fill();
          ctx.lineWidth = isPath || isSel ? 2.5 : 1;
          ctx.strokeStyle = isPath ? '#f0c674' : isSel ? '#ffffff' : '#0b0d12';
          ctx.stroke();
          if (node.pinned) {
            ctx.fillStyle = '#0b0d12';
            ctx.beginPath();
            ctx.arc(b.x, b.y, 3, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.fillStyle = '#eceef2';
          ctx.font = isSel ? '600 12px Inter, sans-serif' : '500 11px Inter, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(node.label, b.x, b.y + b.radius + 13);
          ctx.restore();
        }
        ctx.restore();
      }
      activeForceRafId = requestAnimationFrame(drawFrame);
    };
    activeForceRafId = requestAnimationFrame(drawFrame);
  } else {
    // ================= SPATIAL STORYBOARD MODE =================
    const viewport = el('div', {
      className: 'bv-graph-viewport',
      style: {
        transform: `translate(${panX}px, ${panY}px) scale(${zoomScale})`,
      },
    });
    storyboardViewportEl = viewport;

    const syncCanvasGrid = () => {
      const step = Math.max(8, Math.round(24 * zoomScale));
      canvasWrap.style.backgroundPosition = `${panX}px ${panY}px`;
      canvasWrap.style.backgroundSize = `${step}px ${step}px`;
    };
    storyboardSyncGrid = syncCanvasGrid;
    syncCanvasGrid();

    // Render Act / Section Group Frames first
    for (const grp of graph.groups ?? []) {
      const grpEl = el(
        'div',
        {
          className: `qv-graph-group${grp.id === selectedGroupId ? ' is-selected' : ''}`,
          style: {
            left: `${grp.x}px`,
            top: `${grp.y}px`,
            width: `${grp.width}px`,
            height: `${grp.collapsed ? 34 : grp.height}px`,
            borderColor: grp.color || '#c7a97b',
          },
        },
        el(
          'div',
          {
            className: 'qv-graph-group-head',
            style: { color: grp.color || '#c7a97b' },
          },
          el('span', { text: grp.label }),
          el(
            'div',
            { style: { display: 'inline-flex', alignItems: 'center', gap: '4px' } },
            el('button', {
              className: 'bv-mini-btn',
              text: grp.collapsed ? 'Expand' : 'Hide',
              attrs: { type: 'button' },
              on: {
                pointerdown: (ev) => ev.stopPropagation(),
                click: (ev) => {
                  ev.stopPropagation();
                  withGraph(actions, (g) => updateGraphGroup(g, grp.id, { collapsed: !grp.collapsed }));
                },
              },
            }),
            el('button', {
              className: 'bv-mini-btn',
              text: '×',
              tooltip: { title: 'Remove Group Frame', short: 'Removes this Act/section frame while keeping all cards.' },
              attrs: { type: 'button', 'aria-label': `Remove ${grp.label} group frame` },
              on: {
                pointerdown: (ev) => ev.stopPropagation(),
                click: (ev) => {
                  ev.stopPropagation();
                  if (selectedGroupId === grp.id) selectedGroupId = '';
                  withGraph(actions, (g) => deleteGraphGroup(g, grp.id));
                },
              },
            }),
          ),
        ),
        !grp.collapsed ? el('div', { className: 'qv-graph-group-resize' }) : null,
      );

      // Drag group header to translate frame + all child cards inside it
      const head = grpEl.querySelector<HTMLElement>('.qv-graph-group-head')!;
      head.addEventListener('pointerdown', (e) => {
        if ((e.target as HTMLElement).closest('button')) return;
        e.stopPropagation();
        selectedGroupId = grp.id;
        selectedEdgeId = '';
        selectedNodeIds.clear();
        const sx = e.clientX;
        const sy = e.clientY;
        const origGx = grp.x;
        const origGy = grp.y;
        const childNodes = graph.nodes.filter((n) => isPointInGroup(n.x + 80, n.y + 36, grp));
        const childOrigins = new Map(childNodes.map((n) => [n.id, { x: n.x, y: n.y }]));
        let movedGroup = false;
        const onMove = (mv: PointerEvent) => {
          const dx = Math.round((mv.clientX - sx) / zoomScale);
          const dy = Math.round((mv.clientY - sy) / zoomScale);
          if (Math.abs(mv.clientX - sx) > 3 || Math.abs(mv.clientY - sy) > 3) {
            movedGroup = true;
          }
          grp.x = origGx + dx;
          grp.y = origGy + dy;
          grpEl.style.left = `${grp.x}px`;
          grpEl.style.top = `${grp.y}px`;
          for (const cn of childNodes) {
            const o = childOrigins.get(cn.id)!;
            cn.x = o.x + dx;
            cn.y = o.y + dy;
            const cEl = nodeCards.get(cn.id);
            if (cEl) {
              cEl.style.left = `${cn.x}px`;
              cEl.style.top = `${cn.y}px`;
            }
          }
          updateConnectedEdgesLive('');
        };
        const onUp = () => {
          window.removeEventListener('pointermove', onMove);
          window.removeEventListener('pointerup', onUp);
          if (movedGroup) {
            withGraph(actions, (g) => {
              let next = updateGraphGroup(g, grp.id, { x: grp.x, y: grp.y });
              for (const cn of childNodes) {
                next = updateGraphNode(next, cn.id, { x: cn.x, y: cn.y });
              }
              return next;
            });
          } else {
            actions.setState({ activeGraphNodeId: '' }, true);
          }
        };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
      });

      const resizer = grpEl.querySelector<HTMLElement>('.qv-graph-group-resize');
      resizer?.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        const sx = e.clientX;
        const sy = e.clientY;
        const ow = grp.width;
        const oh = grp.height;
        const onMove = (mv: PointerEvent) => {
          grp.width = Math.max(220, ow + Math.round((mv.clientX - sx) / zoomScale));
          grp.height = Math.max(140, oh + Math.round((mv.clientY - sy) / zoomScale));
          grpEl.style.width = `${grp.width}px`;
          grpEl.style.height = `${grp.height}px`;
          updateConnectedEdgesLive('');
        };
        const onUp = () => {
          window.removeEventListener('pointermove', onMove);
          window.removeEventListener('pointerup', onUp);
          withGraph(actions, (g) => updateGraphGroup(g, grp.id, { width: grp.width, height: grp.height }));
        };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
      });

      attachContextMenu(grpEl, () => [
        {
          heading: grp.label,
          items: [
            {
              label: 'Rename Group…',
              onSelect: () => {
                const name = window.prompt('Group Title', grp.label);
                if (name !== null) withGraph(actions, (g) => updateGraphGroup(g, grp.id, { label: name }));
              },
            },
            {
              label: 'Delete Group Frame (Keep Cards)',
              danger: true,
              onSelect: () => withGraph(actions, (g) => deleteGraphGroup(g, grp.id)),
            },
          ],
        },
      ]);

      viewport.appendChild(grpEl);
    }

    const svg = svgEl('svg', { class: 'bv-graph-svg', width: 1, height: 1 });
    const defs = svgEl('defs');
    const mkArrow = svgEl('marker', { id: 'bv-arrow', markerWidth: 8, markerHeight: 8, refX: 7, refY: 3.5, orient: 'auto' });
    mkArrow.appendChild(svgEl('path', { d: 'M0,0 L8,3.5 L0,7 z', fill: '#8e96a4' }));
    const mkArrowStart = svgEl('marker', { id: 'bv-arrow-start', markerWidth: 8, markerHeight: 8, refX: 1, refY: 3.5, orient: 'auto' });
    mkArrowStart.appendChild(svgEl('path', { d: 'M8,0 L0,3.5 L8,7 z', fill: '#8e96a4' }));
    const mkDiamond = svgEl('marker', { id: 'bv-diamond', markerWidth: 10, markerHeight: 10, refX: 5, refY: 5, orient: 'auto' });
    mkDiamond.appendChild(svgEl('path', { d: 'M0,5 L5,1 L10,5 L5,9 z', fill: '#c7a97b' }));
    const mkCircle = svgEl('marker', { id: 'bv-circle', markerWidth: 8, markerHeight: 8, refX: 4, refY: 4 });
    mkCircle.appendChild(svgEl('circle', { cx: 4, cy: 4, r: 3, fill: '#67b08c' }));
    defs.append(mkArrow, mkArrowStart, mkDiamond, mkCircle);
    svg.appendChild(defs);

    const rubberLine = svgEl('path', {
      fill: 'none',
      stroke: '#67b08c',
      'stroke-width': '2',
      'stroke-dasharray': '5 4',
      visibility: 'hidden',
    });

    const nodeMap = new Map(visibleNodes.map((n) => [n.id, n]));
    const nodeCards = new Map<string, HTMLElement>();

    const allObstacleBoxes = (): RectBox[] =>
      visibleNodes.map((n) => {
        const b = nodeCardBox(n, nodeCards.get(n.id));
        return { id: n.id, x: n.x, y: n.y, width: b.w, height: b.h };
      });

    interface EdgeRenderRef {
      edge: StoryGraphEdge;
      pathEl: SVGPathElement;
      labelEl: SVGTextElement;
      pillEl: SVGRectElement;
      elbowHandleEl: SVGCircleElement | null;
    }
    const edgeRefs: EdgeRenderRef[] = [];
    const labelLayer = svgEl('g');
    const queryLower = graphSearchQuery.trim().toLowerCase();

    const startInlineEdgeRename = (edge: StoryGraphEdge, lx: number, ly: number) => {
      const inp = el('input', {
        className: 'qv-graph-pill-editor',
        attrs: { type: 'text', value: edge.label },
        style: { left: `${lx}px`, top: `${ly}px` },
      });
      let done = false;
      const commit = (save: boolean) => {
        if (done) return;
        done = true;
        const val = inp.value;
        inp.remove();
        if (save) withGraph(actions, (g) => updateGraphEdge(g, edge.id, { label: val }));
      };
      inp.addEventListener('pointerdown', (e) => e.stopPropagation());
      inp.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Escape') commit(false);
        else if (e.key === 'Enter') commit(true);
      });
      inp.addEventListener('blur', () => commit(true));
      viewport.appendChild(inp);
      requestAnimationFrame(() => {
        inp.focus();
        inp.select();
      });
    };

    const obstacles = allObstacleBoxes();
    for (const edge of visibleEdges) {
      const src = nodeMap.get(edge.sourceId);
      const dst = nodeMap.get(edge.targetId);
      if (!src || !dst) continue;

      const sBox = nodeCardBox(src);
      const dBox = nodeCardBox(dst);
      const mode = edge.routingMode ?? edgeRouting;
      const routed = routeConnector({
        sourceBox: { id: src.id, x: src.x, y: src.y, width: sBox.w, height: sBox.h },
        targetBox: { id: dst.id, x: dst.x, y: dst.y, width: dBox.w, height: dBox.h },
        routingMode: mode,
        sourceAnchor: edge.sourceAnchor ?? 'auto',
        targetAnchor: edge.targetAnchor ?? 'auto',
        elbowOffset: edge.elbowOffset ?? 0,
        obstacles,
      });

      const isEdgeSelected = edge.id === selectedEdgeId;
      const isPathEdge = pathEdgeSet.has(edge.id);
      const isIncidentToSelected =
        Boolean(state.activeGraphNodeId) &&
        (edge.sourceId === state.activeGraphNodeId || edge.targetId === state.activeGraphNodeId);

      const pathEl = svgEl('path', {
        d: routed.d,
        fill: 'none',
        stroke: isPathEdge
          ? '#f0c674'
          : isEdgeSelected
            ? '#f2efe8'
            : isIncidentToSelected
              ? '#c7a97b'
              : edge.color || '#6e7684',
        'stroke-width': isPathEdge || isEdgeSelected || isIncidentToSelected ? '2.4' : '1.5',
        'stroke-opacity': queryLower && !isIncidentToSelected ? '0.28' : '0.92',
        'stroke-dasharray': edgeDashArray(edge.style),
        'marker-start': markerUrlFor(edge.startArrow, 'start'),
        'marker-end': markerUrlFor(edge.endArrow, 'end'),
      });
      pathEl.addEventListener('click', (e) => {
        e.stopPropagation();
        selectedEdgeId = edge.id;
        actions.setState({ activeGraphNodeId: '' }, true);
      });

      const pillW = Math.max(30, edge.label.length * 6.4 + 14);
      const pillEl = svgEl('rect', {
        x: Math.round(routed.labelPoint.x - pillW / 2),
        y: Math.round(routed.labelPoint.y - 12),
        width: Math.round(pillW),
        height: 17,
        rx: 4,
        fill: 'var(--bg-bar)',
        'fill-opacity': showEdgeLabels ? '0.95' : '0',
        stroke: isEdgeSelected ? 'var(--accent-ivory)' : 'var(--border-hairline)',
        'stroke-width': '1',
        visibility: showEdgeLabels ? 'visible' : 'hidden',
      });

      const labelEl = svgEl('text', {
        x: Math.round(routed.labelPoint.x),
        y: Math.round(routed.labelPoint.y),
        fill: isEdgeSelected || isIncidentToSelected ? 'var(--text-primary)' : 'var(--text-secondary)',
        'font-size': '10.5',
        'text-anchor': 'middle',
        'font-family': 'Inter, sans-serif',
        visibility: showEdgeLabels ? 'visible' : 'hidden',
      });
      labelEl.textContent = edge.label;

      const selectEdge = (e: Event) => {
        e.stopPropagation();
        selectedEdgeId = edge.id;
        actions.setState({ activeGraphNodeId: '' }, true);
      };
      pillEl.addEventListener('click', selectEdge);
      labelEl.addEventListener('click', selectEdge);
      pillEl.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        startInlineEdgeRename(edge, routed.labelPoint.x, routed.labelPoint.y);
      });
      labelEl.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        startInlineEdgeRename(edge, routed.labelPoint.x, routed.labelPoint.y);
      });

      let elbowHandleEl: SVGCircleElement | null = null;
      if (isEdgeSelected && mode === 'elbow' && routed.midHandle) {
        const mh = routed.midHandle;
        elbowHandleEl = svgEl('circle', {
          cx: mh.x,
          cy: mh.y,
          r: 6,
          fill: '#c7a97b',
          stroke: '#0b0d12',
          'stroke-width': 2,
          style: `cursor:${mh.axis === 'x' ? 'ew-resize' : 'ns-resize'}`,
        });
        elbowHandleEl.addEventListener('pointerdown', (e) => {
          e.stopPropagation();
          const sx = e.clientX;
          const sy = e.clientY;
          const origOff = edge.elbowOffset ?? 0;
          const onMove = (mv: PointerEvent) => {
            const delta = mh.axis === 'x' ? (mv.clientX - sx) / zoomScale : (mv.clientY - sy) / zoomScale;
            edge.elbowOffset = Math.round(origOff + delta);
            updateConnectedEdgesLive('');
          };
          const onUp = () => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
            withGraph(actions, (g) => updateGraphEdge(g, edge.id, { elbowOffset: edge.elbowOffset ?? 0 }));
          };
          window.addEventListener('pointermove', onMove);
          window.addEventListener('pointerup', onUp);
        });
        labelLayer.appendChild(elbowHandleEl);
      }

      svg.appendChild(pathEl);
      labelLayer.append(pillEl, labelEl);
      edgeRefs.push({ edge, pathEl, labelEl, pillEl, elbowHandleEl });
    }

    svg.append(labelLayer, rubberLine);
    viewport.appendChild(svg);

    const updateConnectedEdgesLive = (movedNodeId: string) => {
      const obs = allObstacleBoxes();
      for (const ref of edgeRefs) {
        if (movedNodeId && ref.edge.sourceId !== movedNodeId && ref.edge.targetId !== movedNodeId) continue;
        const src = nodeMap.get(ref.edge.sourceId);
        const dst = nodeMap.get(ref.edge.targetId);
        if (!src || !dst) continue;
        const sBox = nodeCardBox(src, nodeCards.get(src.id));
        const dBox = nodeCardBox(dst, nodeCards.get(dst.id));
        const routed = routeConnector({
          sourceBox: { id: src.id, x: src.x, y: src.y, width: sBox.w, height: sBox.h },
          targetBox: { id: dst.id, x: dst.x, y: dst.y, width: dBox.w, height: dBox.h },
          routingMode: ref.edge.routingMode ?? edgeRouting,
          sourceAnchor: ref.edge.sourceAnchor ?? 'auto',
          targetAnchor: ref.edge.targetAnchor ?? 'auto',
          elbowOffset: ref.edge.elbowOffset ?? 0,
          obstacles: obs,
        });
        ref.pathEl.setAttribute('d', routed.d);
        const pillW = Math.max(30, ref.edge.label.length * 6.4 + 14);
        ref.pillEl.setAttribute('x', String(Math.round(routed.labelPoint.x - pillW / 2)));
        ref.pillEl.setAttribute('y', String(Math.round(routed.labelPoint.y - 12)));
        ref.labelEl.setAttribute('x', String(Math.round(routed.labelPoint.x)));
        ref.labelEl.setAttribute('y', String(Math.round(routed.labelPoint.y)));
        if (ref.elbowHandleEl && routed.midHandle) {
          ref.elbowHandleEl.setAttribute('cx', String(routed.midHandle.x));
          ref.elbowHandleEl.setAttribute('cy', String(routed.midHandle.y));
        }
      }
    };

    let draggingNodeId: string | null = null;
    let dragOriginByNode = new Map<string, { x: number; y: number }>();
    let dragStartWorldX = 0;
    let dragStartWorldY = 0;
    let movedNode = false;

    let portDragSourceId: string | null = null;
    let portDragSide: 'left' | 'right' | 'top' | 'bottom' = 'right';

    let panning = false;
    let panMoved = false;
    let panStartClientX = 0;
    let panStartClientY = 0;
    let panOriginX = 0;
    let panOriginY = 0;
    let marqueeBox: HTMLElement | null = null;
    let marqueeStartX = 0;
    let marqueeStartY = 0;

    let activeWinMove: ((ev: PointerEvent) => void) | null = null;
    let activeWinUp: ((ev: PointerEvent) => void) | null = null;

    const detachGlobalDrag = () => {
      if (activeWinMove) {
        window.removeEventListener('pointermove', activeWinMove);
        activeWinMove = null;
      }
      if (activeWinUp) {
        window.removeEventListener('pointerup', activeWinUp);
        window.removeEventListener('pointercancel', activeWinUp);
        activeWinUp = null;
      }
    };

    const attachGlobalDrag = () => {
      detachGlobalDrag();
      activeWinMove = (ev: PointerEvent) => {
        if (!canvasWrap.isConnected) {
          detachGlobalDrag();
          return;
        }
        handlePointerMove(ev);
      };
      activeWinUp = (ev: PointerEvent) => {
        detachGlobalDrag();
        if (!canvasWrap.isConnected) return;
        handlePointerUp(ev);
      };
      window.addEventListener('pointermove', activeWinMove);
      window.addEventListener('pointerup', activeWinUp);
      window.addEventListener('pointercancel', activeWinUp);
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (portDragSourceId) {
        const srcNode = nodeMap.get(portDragSourceId);
        if (!srcNode) return;
        const wrapRect = canvasWrap.getBoundingClientRect();
        const curX = (e.clientX - wrapRect.left - panX) / zoomScale;
        const curY = (e.clientY - wrapRect.top - panY) / zoomScale;
        const box = nodeCardBox(srcNode, nodeCards.get(srcNode.id));
        const sx = portDragSide === 'right' ? srcNode.x + box.w : portDragSide === 'left' ? srcNode.x : srcNode.x + box.w / 2;
        const sy = portDragSide === 'bottom' ? srcNode.y + box.h : portDragSide === 'top' ? srcNode.y : srcNode.y + box.h / 2;
        rubberLine.setAttribute('d', `M ${sx} ${sy} L ${curX.toFixed(1)} ${curY.toFixed(1)}`);
        return;
      }

      if (draggingNodeId) {
        movedNode = true;
        const curWorldX = e.clientX / zoomScale;
        const curWorldY = e.clientY / zoomScale;
        let dx = Math.round(curWorldX - dragStartWorldX);
        let dy = Math.round(curWorldY - dragStartWorldY);
        const anchorOrig = dragOriginByNode.get(draggingNodeId);
        if (snapToGrid && anchorOrig) {
          const snappedX = Math.round((anchorOrig.x + dx) / 24) * 24;
          const snappedY = Math.round((anchorOrig.y + dy) / 24) * 24;
          dx = snappedX - anchorOrig.x;
          dy = snappedY - anchorOrig.y;
        }
        for (const [nid, orig] of dragOriginByNode.entries()) {
          const nx = orig.x + dx;
          const ny = orig.y + dy;
          const cEl = nodeCards.get(nid);
          if (cEl) {
            cEl.style.left = `${nx}px`;
            cEl.style.top = `${ny}px`;
          }
          const nRef = nodeMap.get(nid);
          if (nRef) {
            nRef.x = nx;
            nRef.y = ny;
          }
        }
        // Re-route every connector on the board in real time so moving cards & obstacle paths stay live
        updateConnectedEdgesLive('');
      } else if (marqueeBox) {
        const left = Math.min(marqueeStartX, e.clientX);
        const top = Math.min(marqueeStartY, e.clientY);
        const width = Math.abs(e.clientX - marqueeStartX);
        const height = Math.abs(e.clientY - marqueeStartY);
        marqueeBox.style.left = `${left}px`;
        marqueeBox.style.top = `${top}px`;
        marqueeBox.style.width = `${width}px`;
        marqueeBox.style.height = `${height}px`;
      } else if (panning) {
        if (Math.hypot(e.clientX - panStartClientX, e.clientY - panStartClientY) > 4) {
          panMoved = true;
        }
        panX = Math.round(panOriginX + (e.clientX - panStartClientX));
        panY = Math.round(panOriginY + (e.clientY - panStartClientY));
        viewport.style.transform = `translate(${panX}px, ${panY}px) scale(${zoomScale})`;
        syncCanvasGrid();
      }
    };

    const handlePointerUp = (e: PointerEvent) => {
      if (portDragSourceId) {
        const srcId = portDragSourceId;
        const srcAnchor = portDragSide;
        portDragSourceId = null;
        rubberLine.setAttribute('visibility', 'hidden');
        const dropTargetEl = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest<HTMLElement>('.bv-graph-node');
        const targetId = dropTargetEl?.dataset.nodeId;
        if (targetId && targetId !== srcId) {
          let createdEdgeId = '';
          withGraph(actions, (g) => {
            const res = addGraphEdge(g, srcId, targetId, 'connects to');
            if (res.edge) {
              res.edge.sourceAnchor = srcAnchor;
              res.edge.routingMode = edgeRouting;
            }
            createdEdgeId = res.edge?.id ?? '';
            return res.graph;
          }, false);
          selectedEdgeId = createdEdgeId;
          actions.setState({ activeGraphNodeId: '' }, true);
        } else {
          // Dropped on empty space -> spawn a connected node right at cursor!
          const wrapRect = canvasWrap.getBoundingClientRect();
          const dropX = Math.round((e.clientX - wrapRect.left - panX) / zoomScale - 80);
          const dropY = Math.round((e.clientY - wrapRect.top - panY) / zoomScale - 36);
          if (Math.hypot(e.clientX - wrapRect.left, e.clientY - wrapRect.top) > 20) {
            let newNodeId = '';
            withGraph(actions, (g) => {
              const nr = addGraphNode(g, { kind: 'note', label: 'Linked Idea', x: dropX, y: dropY });
              newNodeId = nr.node.id;
              const er = addGraphEdge(nr.graph, srcId, nr.node.id, 'leads to');
              if (er.edge) {
                er.edge.sourceAnchor = srcAnchor;
                er.edge.routingMode = edgeRouting;
              }
              return er.graph;
            }, false);
            selectedEdgeId = '';
            actions.setState({ activeGraphNodeId: newNodeId }, true);
          }
        }
        return;
      }

      if (draggingNodeId) {
        const id = draggingNodeId;
        const movedEntries = Array.from(dragOriginByNode.keys());
        draggingNodeId = null;
        dragOriginByNode.clear();
        if (movedNode) {
          withGraph(actions, (g) => {
            let next = g;
            for (const nid of movedEntries) {
              const moved = nodeMap.get(nid);
              if (moved) next = updateGraphNode(next, nid, { x: moved.x, y: moved.y });
            }
            return next;
          });
        } else {
          selectedEdgeId = '';
          selectedGroupId = '';
          actions.setState({ activeGraphNodeId: id }, true);
        }
      } else if (panning && !panMoved) {
        const hadSelection =
          Boolean(state.activeGraphNodeId) ||
          Boolean(selectedEdgeId) ||
          Boolean(selectedGroupId) ||
          selectedNodeIds.size > 0 ||
          connectMode;
        selectedEdgeId = '';
        selectedGroupId = '';
        selectedNodeIds.clear();
        connectMode = false;
        connectSourceId = '';
        if (hadSelection) {
          if (state.activeGraphNodeId) {
            actions.setState({ activeGraphNodeId: '' }, true);
          } else {
            renderGraphView(container, actions);
          }
        }
      }

      if (marqueeBox) {
        marqueeBox.remove();
        marqueeBox = null;
        const mL = Math.min(marqueeStartX, e.clientX);
        const mT = Math.min(marqueeStartY, e.clientY);
        const mR = Math.max(marqueeStartX, e.clientX);
        const mB = Math.max(marqueeStartY, e.clientY);
        selectedNodeIds.clear();
        for (const [nid, cardEl] of nodeCards.entries()) {
          const r = cardEl.getBoundingClientRect();
          if (!(r.right < mL || r.left > mR || r.bottom < mT || r.top > mB)) {
            selectedNodeIds.add(nid);
          }
        }
        renderGraphView(container, actions);
      }

      panning = false;
    };

    for (const node of visibleNodes) {
      const isSelected = node.id === state.activeGraphNodeId || selectedNodeIds.has(node.id);
      const isSource = connectMode && node.id === connectSourceId;
      const nodeColor = resolveNodeColorByRules(node, graph.colorRules);
      const matchesSearch =
        !queryLower ||
        `${node.label} ${node.subtitle} ${node.notes} ${(node.tags ?? []).join(' ')}`.toLowerCase().includes(queryLower);

      const makePort = (side: 'left' | 'right' | 'top' | 'bottom') =>
        el('div', {
          className: `bv-graph-port is-${side}`,
          tooltip: { title: 'Drag Port to Connect or Spawn', short: 'Drop onto another card to connect, or onto empty canvas to spawn + connect.' },
          on: {
            pointerdown: (e) => {
              if (e.button !== 0) return;
              e.stopPropagation();
              portDragSourceId = node.id;
              portDragSide = side;
              const box = nodeCardBox(node, nodeCards.get(node.id));
              const sx = side === 'right' ? node.x + box.w : side === 'left' ? node.x : node.x + box.w / 2;
              const sy = side === 'bottom' ? node.y + box.h : side === 'top' ? node.y : node.y + box.h / 2;
              rubberLine.setAttribute('d', `M ${sx} ${sy} L ${sx} ${sy}`);
              rubberLine.setAttribute('visibility', 'visible');
              attachGlobalDrag();
            },
          },
        });

      const countBadge = edgeCounts.get(node.id) ?? 0;
      const cardChildren = [
        el(
          'div',
          { className: 'bv-graph-node-head' },
          el('span', {
            className: 'bv-mono-tag',
            text: GRAPH_KIND_LABELS[node.kind],
            style: { color: nodeColor },
          }),
          ...(graphDensity === 'detailed'
            ? [el('span', { className: 'bv-mono-tag', text: `${countBadge} link${countBadge === 1 ? '' : 's'}` })]
            : []),
        ),
        el('div', {
          text: node.label,
          style: { fontWeight: '600', fontSize: graphDensity === 'compact' ? '11.5px' : '12.5px' },
        }),
        ...(graphDensity !== 'compact' && node.subtitle
          ? [el('div', { className: 'bv-label', text: node.subtitle })]
          : []),
        ...(graphDensity === 'detailed' && node.notes
          ? [el('div', { className: 'bv-graph-note-excerpt', text: node.notes })]
          : []),
        makePort('left'),
        makePort('right'),
        makePort('top'),
        makePort('bottom'),
      ];

      const card = el(
        'div',
        {
          className: `bv-graph-node is-${graphDensity}${isSelected ? ' is-selected' : ''}${isSource ? ' is-connect-source' : ''}${!matchesSearch ? ' is-dimmed' : ''}`,
          dataset: { nodeId: node.id },
          style: {
            left: `${node.x}px`,
            top: `${node.y}px`,
            borderTop: `3px solid ${nodeColor}`,
          },
          on: {
            pointerdown: (e) => {
              if (e.button !== 0) return;
              e.stopPropagation();
              if (connectMode) {
                if (!connectSourceId) {
                  connectSourceId = node.id;
                  renderGraphView(container, actions);
                } else if (connectSourceId !== node.id) {
                  const srcId = connectSourceId;
                  connectSourceId = '';
                  connectMode = false;
                  let createdEdgeId = '';
                  withGraph(actions, (g) => {
                    const res = addGraphEdge(g, srcId, node.id, 'connects to');
                    if (res.edge) res.edge.routingMode = edgeRouting;
                    createdEdgeId = res.edge?.id ?? '';
                    return res.graph;
                  }, false);
                  selectedEdgeId = createdEdgeId;
                  actions.setState({ activeGraphNodeId: '' }, true);
                }
                return;
              }

              if (e.shiftKey) {
                if (selectedNodeIds.has(node.id)) selectedNodeIds.delete(node.id);
                else selectedNodeIds.add(node.id);
              } else if (!selectedNodeIds.has(node.id)) {
                selectedNodeIds.clear();
                selectedNodeIds.add(node.id);
              }

              draggingNodeId = node.id;
              movedNode = false;
              dragStartWorldX = e.clientX / zoomScale;
              dragStartWorldY = e.clientY / zoomScale;
              dragOriginByNode = new Map();
              for (const nid of selectedNodeIds) {
                const nr = nodeMap.get(nid);
                if (nr) dragOriginByNode.set(nid, { x: nr.x, y: nr.y });
              }
              if (!dragOriginByNode.has(node.id)) dragOriginByNode.set(node.id, { x: node.x, y: node.y });
              attachGlobalDrag();
            },
            dblclick: (e) => {
              e.stopPropagation();
              if (node.kind === 'scene' && node.refId) {
                actions.selectScene(node.refId, true);
              } else if (
                (node.kind === 'character' || node.kind === 'location' || node.kind === 'lore') &&
                node.refId
              ) {
                const cat =
                  node.kind === 'character'
                    ? 'characters'
                    : node.kind === 'location'
                      ? 'locations'
                      : 'lore';
                actions.openBibleEntry(cat, node.refId);
              }
            },
          },
        },
        ...cardChildren,
      );
      nodeCards.set(node.id, card);
      viewport.appendChild(card);

      attachContextMenu(card, () => [
        {
          heading: node.label,
          items: [
            {
              label: 'Inspect Node',
              onSelect: () => {
                selectedEdgeId = '';
                actions.setState({ activeGraphNodeId: node.id }, true);
              },
            },
            {
              label: 'Connect From This Node',
              icon: 'graph',
              onSelect: () => {
                connectMode = true;
                connectSourceId = node.id;
                renderGraphView(container, actions);
              },
            },
          ],
        },
        {
          items: [
            {
              label: 'Remove Node',
              icon: 'trash',
              danger: true,
              onSelect: () => withGraph(actions, (g) => deleteGraphNode(g, node.id)),
            },
          ],
        },
      ]);
    }

    applySearchHighlight = () => {
      const q = graphSearchQuery.trim().toLowerCase();
      for (const node of visibleNodes) {
        const card = nodeCards.get(node.id);
        if (!card) continue;
        const matches =
          !q || `${node.label} ${node.subtitle} ${node.notes} ${(node.tags ?? []).join(' ')}`.toLowerCase().includes(q);
        card.classList.toggle('is-dimmed', !matches);
      }
      for (const ref of edgeRefs) {
        const isIncidentToSelected =
          Boolean(state.activeGraphNodeId) &&
          (ref.edge.sourceId === state.activeGraphNodeId || ref.edge.targetId === state.activeGraphNodeId);
        ref.pathEl.setAttribute('stroke-opacity', q && !isIncidentToSelected ? '0.28' : '0.92');
      }
    };

    requestAnimationFrame(() => updateConnectedEdgesLive(''));

    canvasWrap.addEventListener('pointerdown', (e) => {
      if (e.button === 0 && e.shiftKey) {
        marqueeStartX = e.clientX;
        marqueeStartY = e.clientY;
        marqueeBox = el('div', {
          className: 'qv-marquee-rect',
          style: { left: `${e.clientX}px`, top: `${e.clientY}px`, width: '0px', height: '0px' },
        });
        document.body.appendChild(marqueeBox);
        attachGlobalDrag();
        return;
      }
      if (e.button !== 0 && e.button !== 1) return;
      panning = true;
      panMoved = false;
      panStartClientX = e.clientX;
      panStartClientY = e.clientY;
      panOriginX = panX;
      panOriginY = panY;
      attachGlobalDrag();
    });

    canvasWrap.addEventListener('dblclick', (e) => {
      const target = e.target as HTMLElement;
      if (target.closest('.bv-graph-node') || target.closest('.qv-graph-group')) return;
      const cRect = canvasWrap.getBoundingClientRect();
      const worldX = Math.round((e.clientX - cRect.left - panX) / zoomScale - 84);
      const worldY = Math.round((e.clientY - cRect.top - panY) / zoomScale - 32);
      const kind = (newKindSelect.value as GraphNodeKind) || 'note';
      let createdId = '';
      withGraph(actions, (g) => {
        const res = addGraphNode(g, { kind, label: `New ${GRAPH_KIND_LABELS[kind]}`, x: worldX, y: worldY });
        createdId = res.node.id;
        return res.graph;
      }, false);
      selectedEdgeId = '';
      actions.setState({ activeGraphNodeId: createdId }, true);
    });

    canvasWrap.appendChild(viewport);

    // Minimap widget (bottom-left) showing nodes, groups & clickable navigation
    const minimapCanvas = document.createElement('canvas');
    minimapCanvas.width = 168;
    minimapCanvas.height = 112;
    const minimap = el('div', { className: 'qv-graph-minimap' }, minimapCanvas);
    const drawMinimap = () => {
      const mctx = minimapCanvas.getContext('2d');
      if (!mctx) return;
      mctx.clearRect(0, 0, 168, 112);
      const xs = visibleNodes.map((n) => n.x);
      const ys = visibleNodes.map((n) => n.y);
      const minX = Math.min(-100, ...xs);
      const maxX = Math.max(900, ...xs.map((x) => x + 220));
      const minY = Math.min(-100, ...ys);
      const maxY = Math.max(600, ...ys.map((y) => y + 120));
      const scale = Math.min(156 / Math.max(1, maxX - minX), 100 / Math.max(1, maxY - minY));
      for (const grp of graph.groups ?? []) {
        mctx.strokeStyle = 'rgba(199,169,123,0.45)';
        mctx.strokeRect(6 + (grp.x - minX) * scale, 6 + (grp.y - minY) * scale, grp.width * scale, grp.height * scale);
      }
      for (const n of visibleNodes) {
        mctx.fillStyle = resolveNodeColorByRules(n, graph.colorRules);
        mctx.fillRect(6 + (n.x - minX) * scale, 6 + (n.y - minY) * scale, Math.max(4, 160 * scale), Math.max(3, 70 * scale));
      }
    };
    requestAnimationFrame(drawMinimap);
    minimap.addEventListener('pointerdown', (e) => e.stopPropagation());
    canvasWrap.appendChild(minimap);
  }

  // Properties & Wikilink Markdown Inspector Panel
  const propsPanel = el('aside', {
    className: propsDetached ? 'bv-graph-floating-props' : 'bv-graph-sidebar',
    style: propsDetached ? { left: `${propsFloatX}px`, top: `${propsFloatY}px` } : undefined,
    on: {
      pointerdown: (e) => {
        if (propsDetached) e.stopPropagation();
      },
    },
  });
  const selectedNode = graph.nodes.find((n) => n.id === state.activeGraphNodeId);
  const selectedEdge = graph.edges.find((e) => e.id === selectedEdgeId);
  const selectedGroup = (graph.groups ?? []).find((g) => g.id === selectedGroupId);

  const panelTitleText = selectedNode
    ? 'Node & Wikilink Notes'
    : selectedEdge
      ? 'Connector Styling'
      : selectedGroup
        ? 'Group Frame'
        : 'Board Controls & Rules';

  const makePropsHeader = () => {
    const hdr = el(
      'div',
      { className: 'bv-graph-props-head', style: propsDetached ? { cursor: 'grab' } : undefined },
      el('span', { className: 'bv-panel-title', text: panelTitleText }),
      el(
        'div',
        { style: { display: 'flex', gap: '4px', alignItems: 'center' } },
        el('button', {
          className: 'bv-mini-btn',
          text: propsDetached ? 'Dock' : 'Detach',
          attrs: { type: 'button' },
          on: {
            click: () => {
              propsDetached = !propsDetached;
              propsCollapsed = false;
              renderGraphView(container, actions);
            },
          },
        }),
        el('button', {
          className: 'bv-mini-btn',
          text: '−',
          attrs: { type: 'button', 'aria-label': 'Collapse properties panel' },
          on: {
            click: () => {
              propsCollapsed = true;
              renderGraphView(container, actions);
            },
          },
        }),
      ),
    );
    return hdr;
  };

  if (selectedNode) {
    const applyNodeEditWithSync = (patch: { label?: string; subtitle?: string; notes?: string }) => {
      actions.mutateProject((prev) => {
        const base = normalizeProjectDefaults(prev);
        const updatedGraph = updateGraphNode(base.storyGraph!, selectedNode.id, patch);
        let nextProj = { ...base, storyGraph: updatedGraph };
        if (updatedGraph.autoSyncWithBook !== false && selectedNode.refId) {
          const synced = syncGraphNodeBackToBook(nextProj, selectedNode.id, patch);
          nextProj = { ...synced, storyGraph: synced.storyGraph ?? updatedGraph };
        }
        return nextProj;
      });
    };

    const labelIn = el('input', {
      className: 'bv-input',
      attrs: { type: 'text', value: selectedNode.label },
      on: {
        change: () => applyNodeEditWithSync({ label: labelIn.value }),
      },
    });
    const subIn = el('input', {
      className: 'bv-input',
      attrs: { type: 'text', value: selectedNode.subtitle },
      on: {
        change: () => applyNodeEditWithSync({ subtitle: subIn.value }),
      },
    });
    const kindSel = el(
      'select',
      {
        className: 'bv-input',
        on: {
          change: () =>
            withGraph(actions, (g) => changeGraphNodeKind(g, selectedNode.id, kindSel.value as GraphNodeKind)),
        },
      },
      ...ALL_GRAPH_KINDS.map((k) =>
        el('option', { text: GRAPH_KIND_LABELS[k], attrs: { value: k, selected: selectedNode.kind === k } }),
      ),
    );
    const notesIn = el('textarea', {
      className: 'bv-textarea',
      attrs: { rows: 6, placeholder: 'Write Markdown notes with [[Entity Links]] and #tags…' },
      on: {
        change: () =>
          actions.mutateProject((prev) => {
            const base = normalizeProjectDefaults(prev);
            const updatedGraph = syncWikilinkEdgesInGraph(base.storyGraph!, selectedNode.id, notesIn.value);
            let nextProj = { ...base, storyGraph: updatedGraph };
            if (updatedGraph.autoSyncWithBook !== false && selectedNode.refId) {
              const synced = syncGraphNodeBackToBook(nextProj, selectedNode.id, { notes: notesIn.value });
              nextProj = { ...synced, storyGraph: synced.storyGraph ?? updatedGraph };
            }
            return nextProj;
          }),
      },
    });
    notesIn.value = selectedNode.notes;

    const pinChk = el('input', {
      className: 'bv-lever',
      attrs: { type: 'checkbox', role: 'switch', checked: Boolean(selectedNode.pinned) },
      on: {
        change: () => withGraph(actions, (g) => updateGraphNode(g, selectedNode.id, { pinned: pinChk.checked })),
      },
    });

    propsPanel.append(
      makePropsHeader(),
      el('div', { className: 'bv-field' }, el('label', { className: 'bv-label', text: 'Title' }), labelIn),
      el('div', { className: 'bv-field' }, el('label', { className: 'bv-label', text: 'Entity Type' }), kindSel),
      el('div', { className: 'bv-field' }, el('label', { className: 'bv-label', text: 'Subtitle / Role' }), subIn),
      el('label', { className: 'bv-check-row' }, pinChk, el('span', { text: 'Pin Position in Force Graph' })),
      el('div', { className: 'bv-field' }, el('label', { className: 'bv-label', text: 'Markdown Notes & [[Wikilinks]]' }), notesIn),
      ...((selectedNode.tags?.length ?? 0) > 0
        ? [el('div', { className: 'bv-mono-tag', text: selectedNode.tags!.map((t) => `#${t}`).join('  ') })]
        : []),
      el('button', {
        className: 'bv-btn',
        text: 'Sync [[Wikilinks]] Now',
        attrs: { type: 'button' },
        on: {
          click: () => {
            withGraph(actions, (g) => syncWikilinkEdgesInGraph(g, selectedNode.id, notesIn.value));
            actions.notify('Synced wikilinks into graph connections');
          },
        },
      }),
      el(
        'button',
        {
          className: 'bv-mini-btn',
          attrs: { type: 'button' },
          on: {
            click: () => {
              withGraph(actions, (g) => deleteGraphNode(g, selectedNode.id), false);
              actions.setState({ activeGraphNodeId: '' }, true);
            },
          },
        },
        icon('trash', 12),
        'Delete Node',
      ),
    );
  } else if (selectedEdge) {
    const edgeLabelIn = el('input', {
      className: 'bv-input',
      attrs: { type: 'text', value: selectedEdge.label },
      on: { change: () => withGraph(actions, (g) => updateGraphEdge(g, selectedEdge.id, { label: edgeLabelIn.value })) },
    });
    const routingSel = el(
      'select',
      {
        className: 'bv-input',
        on: { change: () => withGraph(actions, (g) => updateGraphEdge(g, selectedEdge.id, { routingMode: routingSel.value as GraphRoutingMode })) },
      },
      el('option', { text: '90° Elbow', attrs: { value: 'elbow', selected: (selectedEdge.routingMode ?? edgeRouting) === 'elbow' } }),
      el('option', { text: 'Smooth Curve', attrs: { value: 'curved', selected: (selectedEdge.routingMode ?? edgeRouting) === 'curved' } }),
      el('option', { text: 'Straight Line', attrs: { value: 'straight', selected: (selectedEdge.routingMode ?? edgeRouting) === 'straight' } }),
    );
    const styleSel = el(
      'select',
      {
        className: 'bv-input',
        on: { change: () => withGraph(actions, (g) => updateGraphEdge(g, selectedEdge.id, { style: styleSel.value as GraphLineStyle })) },
      },
      el('option', { text: 'Solid', attrs: { value: 'solid', selected: selectedEdge.style === 'solid' } }),
      el('option', { text: 'Dashed', attrs: { value: 'dashed', selected: selectedEdge.style === 'dashed' } }),
      el('option', { text: 'Dotted', attrs: { value: 'dotted', selected: selectedEdge.style === 'dotted' } }),
    );
    const srcAnchorSel = el(
      'select',
      {
        className: 'bv-input',
        on: { change: () => withGraph(actions, (g) => updateGraphEdge(g, selectedEdge.id, { sourceAnchor: srcAnchorSel.value as GraphAnchorSide })) },
      },
      ...(['auto', 'left', 'right', 'top', 'bottom'] as const).map((s) =>
        el('option', { text: `From: ${s}`, attrs: { value: s, selected: (selectedEdge.sourceAnchor ?? 'auto') === s } }),
      ),
    );
    const endHeadSel = el(
      'select',
      {
        className: 'bv-input',
        on: { change: () => withGraph(actions, (g) => updateGraphEdge(g, selectedEdge.id, { endArrow: endHeadSel.value as GraphArrowHead })) },
      },
      ...(['arrow', 'diamond', 'circle', 'none'] as const).map((h) =>
        el('option', { text: `Head: ${h}`, attrs: { value: h, selected: (selectedEdge.endArrow ?? 'arrow') === h } }),
      ),
    );

    propsPanel.append(
      makePropsHeader(),
      el('div', { className: 'bv-field' }, el('label', { className: 'bv-label', text: 'Relationship Label' }), edgeLabelIn),
      el('div', { className: 'bv-field' }, el('label', { className: 'bv-label', text: 'Routing Style' }), routingSel),
      el('div', { className: 'bv-field' }, el('label', { className: 'bv-label', text: 'Line Pattern' }), styleSel),
      el('div', { className: 'bv-field' }, el('label', { className: 'bv-label', text: 'Anchor & Arrowhead' }), srcAnchorSel, endHeadSel),
      el('button', {
        className: 'bv-btn',
        text: 'Reverse Direction',
        attrs: { type: 'button' },
        on: { click: () => withGraph(actions, (g) => reverseGraphEdge(g, selectedEdge.id)) },
      }),
      el(
        'button',
        {
          className: 'bv-mini-btn',
          attrs: { type: 'button' },
          on: {
            click: () => {
              withGraph(actions, (g) => deleteGraphEdge(g, selectedEdge.id), false);
              selectedEdgeId = '';
              renderGraphView(container, actions);
            },
          },
        },
        icon('trash', 12),
        'Delete Connection',
      ),
    );
  } else if (selectedGroup) {
    const grpTitleIn = el('input', {
      className: 'bv-input',
      attrs: { type: 'text', value: selectedGroup.label },
      on: {
        change: () =>
          withGraph(actions, (g) => updateGraphGroup(g, selectedGroup.id, { label: grpTitleIn.value || 'Group' })),
      },
    });
    const grpColorIn = el('input', {
      attrs: { type: 'color', value: selectedGroup.color || '#c7a97b', 'aria-label': 'Group Frame Color' },
      on: {
        change: () => withGraph(actions, (g) => updateGraphGroup(g, selectedGroup.id, { color: grpColorIn.value })),
      },
    });
    propsPanel.append(
      makePropsHeader(),
      el('p', {
        className: 'bv-label',
        text: 'Group frames (like Act 1) visually band cards together and let you drag enclosed nodes as one unit.',
      }),
      el('div', { className: 'bv-field' }, el('label', { className: 'bv-label', text: 'Group Title' }), grpTitleIn),
      el(
        'div',
        { className: 'bv-field', style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' } },
        el('label', { className: 'bv-label', text: 'Frame Accent Color' }),
        grpColorIn,
      ),
      el('button', {
        className: 'bv-btn',
        text: selectedGroup.collapsed ? 'Expand Group Frame' : 'Collapse Group Frame',
        attrs: { type: 'button' },
        on: {
          click: () =>
            withGraph(actions, (g) =>
              updateGraphGroup(g, selectedGroup.id, { collapsed: !selectedGroup.collapsed }),
            ),
        },
      }),
      el(
        'button',
        {
          className: 'bv-mini-btn',
          attrs: { type: 'button' },
          on: {
            click: () => {
              withGraph(actions, (g) => deleteGraphGroup(g, selectedGroup.id));
              selectedGroupId = '';
            },
          },
        },
        icon('trash', 12),
        'Remove Group Frame (Keep Cards)',
      ),
    );
  } else {
    const ruleQueryIn = el('input', {
      className: 'bv-input',
      attrs: { type: 'text', placeholder: 'e.g. kind:faction or #betrayal' },
    });
    const ruleColorIn = el('input', {
      attrs: { type: 'color', value: '#e06c75' },
    });
    propsPanel.append(
      makePropsHeader(),
      el('p', {
        className: 'bv-label',
        text: 'Double-click empty canvas to add a node. Drag any port dot onto another card or empty space to link. Shift+Drag selects multiple cards.',
      }),
      el('div', {
        className: 'bv-mono-tag',
        text: `${graph.nodes.length} nodes, ${graph.groups?.length ?? 0} groups, ${graph.edges.length} links`,
      }),
      el('span', { className: 'bv-panel-title', text: 'Color Group Rules' }),
      el('div', { style: { display: 'flex', gap: '6px' } }, ruleQueryIn, ruleColorIn),
      el('button', {
        className: 'bv-mini-btn',
        text: '+ Add Color Rule',
        attrs: { type: 'button' },
        on: {
          click: () => {
            const q = ruleQueryIn.value.trim();
            if (!q) return;
            withGraph(actions, (g) => ({
              ...g,
              colorRules: [...(g.colorRules ?? []), { id: newId('cr'), query: q, color: ruleColorIn.value }],
            }));
          },
        },
      }),
      ...(graph.colorRules ?? []).map((cr) =>
        el(
          'div',
          { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' } },
          el('span', { className: 'bv-mono-tag', text: cr.query, style: { color: cr.color } }),
          el('button', {
            className: 'bv-mini-btn',
            text: '×',
            attrs: { type: 'button' },
            on: {
              click: () =>
                withGraph(actions, (g) => ({
                  ...g,
                  colorRules: (g.colorRules ?? []).filter((x) => x.id !== cr.id),
                })),
            },
          }),
        ),
      ),
    );
  }

  if (propsCollapsed) {
    const reopenSvg = svgEl('svg', { viewBox: '0 0 20 20', width: '16', height: '16', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.6', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
    reopenSvg.append(
      svgEl('rect', { x: '2.5', y: '3', width: '15', height: '14', rx: '2.5' }),
      svgEl('line', { x1: '12.5', y1: '3', x2: '12.5', y2: '17' }),
      svgEl('polyline', { points: '9 7.5 6.2 10 9 12.5' }),
    );
    canvasWrap.appendChild(
      el(
        'button',
        {
          className: 'bv-mini-btn bv-graph-reopen-props',
          attrs: {
            type: 'button',
            'aria-label': 'Open Graph Properties',
            title: 'Open Graph Properties',
          },
          on: {
            click: () => {
              propsCollapsed = false;
              renderGraphView(container, actions);
            },
          },
        },
        reopenSvg,
      ),
    );
  } else if (propsDetached) {
    canvasWrap.appendChild(propsPanel);
  }

  const layout = el(
    'div',
    { className: `bv-graph-layout${propsCollapsed || propsDetached ? ' is-props-collapsed' : ''}` },
    canvasWrap,
    !propsCollapsed && !propsDetached ? propsPanel : null,
  );
  container.append(subbar, canvasImportInput, layout);
}
