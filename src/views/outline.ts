import type { AppActions } from '../core/app-context';
import { exportGenericFile } from '../core/bridge';
import {
  SCENE_STATUS_LABELS,
  countWords,
  estimateReadingMinutes,
  getAllScenes,
  getChapterWordCount,
  getProjectWordCount,
  isSceneLocked,
  moveScene,
  toggleChapterLock,
  updateSceneInProject,
} from '../core/manuscript';
import type { SceneStatus } from '../core/types';
import { attachContextMenu } from '../ui/context-menu';
import { clearNode, el, icon } from '../ui/dom';

type OutlineSortMode = 'order' | 'words-desc' | 'words-asc' | 'status' | 'pov';

let searchFilter = '';
let statusFilter: SceneStatus | 'all' = 'all';
let sortMode: OutlineSortMode = 'order';
const collapsedOutlineChapterIds = new Set<string>();

function escapeCsvCell(val: string | number): string {
  const s = String(val ?? '');
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function renderOutlineView(container: HTMLElement, actions: AppActions): void {
  clearNode(container);
  const state = actions.getState();
  const project = state.project;
  const actualBookWords = getProjectWordCount(project);
  const totalBookWords = Math.max(1, actualBookWords);
  const allScenes = getAllScenes(project);

  const searchInput = el('input', {
    className: 'bv-input',
    style: { width: '230px' },
    attrs: {
      type: 'search',
      value: searchFilter,
      placeholder: 'Filter title, POV, location, timeline…',
    },
    on: {
      input: () => {
        searchFilter = searchInput.value;
        renderLedgerBody();
      },
    },
  });

  const statusSelect = el(
    'select',
    {
      className: 'bv-select',
      on: {
        change: () => {
          statusFilter = statusSelect.value as SceneStatus | 'all';
          renderLedgerBody();
        },
      },
    },
    el('option', { text: 'All Stages', attrs: { value: 'all', selected: statusFilter === 'all' } }),
    ...Object.entries(SCENE_STATUS_LABELS).map(([val, label]) =>
      el('option', { text: label, attrs: { value: val, selected: statusFilter === val } }),
    ),
  );

  const sortSelect = el(
    'select',
    {
      className: 'bv-select',
      attrs: { 'aria-label': 'Sort outline rows' },
      on: {
        change: () => {
          sortMode = sortSelect.value as OutlineSortMode;
          renderLedgerBody();
        },
      },
    },
    el('option', { text: 'Sort: Manuscript Order', attrs: { value: 'order', selected: sortMode === 'order' } }),
    el('option', { text: 'Sort: Most Words', attrs: { value: 'words-desc', selected: sortMode === 'words-desc' } }),
    el('option', { text: 'Sort: Fewest Words', attrs: { value: 'words-asc', selected: sortMode === 'words-asc' } }),
    el('option', { text: 'Sort: Stage', attrs: { value: 'status', selected: sortMode === 'status' } }),
    el('option', { text: 'Sort: POV', attrs: { value: 'pov', selected: sortMode === 'pov' } }),
  );

  const allCollapsed = project.parts.every((p) =>
    p.chapters.every((c) => collapsedOutlineChapterIds.has(c.id)),
  );

  const exportCsvBtn = el(
    'button',
    {
      className: 'bv-mini-btn',
      attrs: { type: 'button' },
      on: {
        click: async () => {
          const rows = [
            ['#', 'Part', 'Chapter', 'Scene', 'Timeline', 'POV', 'Location', 'Stage', 'Words', 'Target', 'ReadMinutes'],
            ...allScenes.map((item) => {
              const words = countWords(item.scene.content);
              return [
                item.sequenceNumber,
                item.part.title,
                item.chapter.title,
                item.scene.title,
                item.scene.timeline,
                item.scene.pov,
                item.scene.location,
                SCENE_STATUS_LABELS[item.scene.status],
                words,
                item.scene.wordTarget,
                estimateReadingMinutes(words),
              ];
            }),
          ];
          const csv = rows.map((r) => r.map(escapeCsvCell).join(',')).join('\r\n');
          const out = await exportGenericFile({
            suggestedName: `${project.title || 'outline'}-ledger`,
            extension: 'md',
            description: 'Outline Ledger CSV Table',
            mimeType: 'text/csv;charset=utf-8',
            textContent: csv,
          });
          if (out) actions.notify('Exported Outline Ledger');
        },
      },
    },
    icon('download', 13),
    'Export Table',
  );

  const toolbar = el(
    'div',
    { className: 'bv-subbar' },
    el(
      'div',
      { className: 'bv-subbar-group' },
      el('span', { className: 'bv-panel-title', text: 'Outline & Pacing Matrix' }),
      el('span', {
        className: 'bv-mono-tag',
        text: `${allScenes.length} ${allScenes.length === 1 ? 'scene' : 'scenes'}, ${actualBookWords.toLocaleString()} ${actualBookWords === 1 ? 'word' : 'words'}`,
      }),
    ),
    el(
      'div',
      { className: 'bv-subbar-group' },
      searchInput,
      statusSelect,
      sortSelect,
      el('button', {
        className: 'bv-mini-btn',
        text: allCollapsed ? 'Expand All' : 'Collapse All',
        attrs: { type: 'button' },
        on: {
          click: () => {
            if (allCollapsed) {
              collapsedOutlineChapterIds.clear();
            } else {
              for (const p of project.parts) {
                for (const c of p.chapters) collapsedOutlineChapterIds.add(c.id);
              }
            }
            renderOutlineView(container, actions);
          },
        },
      }),
      exportCsvBtn,
    ),
  );

  const ledgerHost = el('div', { className: 'qv-outline-ledger' });

  const renderInlineField = (
    initialVal: string,
    placeholder: string,
    readOnly: boolean,
    onCommit: (nextVal: string) => void,
    extraClass = '',
  ) => {
    const input = el('input', {
      className: `qv-outline-inline-input${extraClass ? ` ${extraClass}` : ''}`,
      attrs: {
        type: 'text',
        value: initialVal,
        placeholder,
        ...(readOnly ? { readonly: '' } : {}),
      },
      on: {
        change: () => {
          if (readOnly) return;
          onCommit(input.value.trim());
        },
      },
    });
    return input;
  };

  function renderLedgerBody(): void {
    clearNode(ledgerHost);
    const query = searchFilter.trim().toLowerCase();

    const makeSceneRow = (
      item: ReturnType<typeof getAllScenes>[number],
      chapterSceneList: typeof item.chapter.scenes,
      sceneIndex: number,
    ) => {
      const { scene, chapter } = item;
      const words = countWords(scene.content);
      const pct = scene.wordTarget > 0 ? Math.min(100, Math.round((words / scene.wordTarget) * 100)) : 100;
      const lockStatus = isSceneLocked(project, scene.id);

      const rowStatus = el(
        'select',
        {
          className: 'bv-select',
          attrs: { disabled: lockStatus.locked ? true : undefined },
          on: {
            change: () => {
              const status = rowStatus.value as SceneStatus;
              actions.mutateProject((prev) => updateSceneInProject(prev, scene.id, { status }));
            },
          },
        },
        ...Object.entries(SCENE_STATUS_LABELS).map(([val, label]) =>
          el('option', { text: label, attrs: { value: val, selected: scene.status === val } }),
        ),
      );

      const row = el(
        'tr',
        { className: lockStatus.locked ? 'qv-outline-row-locked' : undefined },
        el(
          'td',
          { className: 'bv-mono-tag' },
          el('span', { text: String(item.sequenceNumber).padStart(2, '0') }),
          lockStatus.locked ? el('span', { style: { marginLeft: '5px' } }, icon('lock', 11)) : null,
        ),
        el(
          'td',
          {},
          renderInlineField(scene.title || '', 'Untitled Scene', lockStatus.locked, (val) =>
            actions.mutateProject((prev) =>
              updateSceneInProject(prev, scene.id, { title: val || 'Untitled Scene' }),
            ),
          'is-title'),
        ),
        el(
          'td',
          {},
          renderInlineField(scene.timeline || '', 'Timeline…', lockStatus.locked, (val) =>
            actions.mutateProject((prev) => updateSceneInProject(prev, scene.id, { timeline: val })),
          ),
        ),
        el(
          'td',
          {},
          renderInlineField(scene.pov || '', 'POV…', lockStatus.locked, (val) =>
            actions.mutateProject((prev) => updateSceneInProject(prev, scene.id, { pov: val })),
          ),
        ),
        el(
          'td',
          {},
          renderInlineField(scene.location || '', 'Location…', lockStatus.locked, (val) =>
            actions.mutateProject((prev) => updateSceneInProject(prev, scene.id, { location: val })),
          ),
        ),
        el('td', {}, rowStatus),
        el(
          'td',
          { className: 'bv-mono-tag' },
          el('div', { text: `${words} / ${scene.wordTarget} (${pct}%)` }),
          el(
            'div',
            { className: 'qv-outline-bar-track' },
            el('div', {
              className: 'qv-outline-bar-fill',
              style: { width: `${pct}%` },
            }),
          ),
        ),
        el('td', { className: 'bv-mono-tag', text: `${estimateReadingMinutes(words)}m` }),
        el(
          'td',
          {},
          el(
            'div',
            { style: { display: 'flex', gap: '4px', alignItems: 'center' } },
            ...(sortMode === 'order' && !query && statusFilter === 'all' && !lockStatus.locked
              ? [
                  el('button', {
                    className: 'bv-icon-tiny',
                    text: '↑',
                    attrs: {
                      type: 'button',
                      title: 'Move Scene Up',
                      disabled: sceneIndex === 0 ? true : undefined,
                    },
                    on: {
                      click: () => {
                        if (sceneIndex > 0) {
                          actions.mutateProject((prev) => moveScene(prev, scene.id, chapter.id, sceneIndex - 1));
                        }
                      },
                    },
                  }),
                  el('button', {
                    className: 'bv-icon-tiny',
                    text: '↓',
                    attrs: {
                      type: 'button',
                      title: 'Move Scene Down',
                      disabled: sceneIndex >= chapterSceneList.length - 1 ? true : undefined,
                    },
                    on: {
                      click: () => {
                        if (sceneIndex < chapterSceneList.length - 1) {
                          actions.mutateProject((prev) => moveScene(prev, scene.id, chapter.id, sceneIndex + 1));
                        }
                      },
                    },
                  }),
                ]
              : []),
            el('button', {
              className: 'bv-mini-btn',
              text: 'Open',
              attrs: { type: 'button' },
              on: { click: () => actions.selectScene(scene.id, true) },
            }),
          ),
        ),
      );

      attachContextMenu(row, () => [
        {
          heading: scene.title || 'Untitled Scene',
          items: [
            {
              label: 'Open in Draft Editor',
              icon: 'draft-sheet',
              onSelect: () => {
                actions.setState({ editorSubMode: 'draft' }, false);
                actions.selectScene(scene.id, true);
              },
            },
            {
              label: 'Proofread Scene',
              icon: 'proofread',
              onSelect: () => {
                actions.setState({ editorSubMode: 'proofread' }, false);
                actions.selectScene(scene.id, true);
              },
            },
            {
              label: 'Export Scene (.qvscene)',
              icon: 'file',
              onSelect: () => void actions.exportAsExtension('.qvscene', { sceneId: scene.id }),
            },
          ],
        },
        {
          heading: 'Set Revision Stage',
          items: (['outline', 'draft', 'revision', 'final'] as SceneStatus[]).map((st) => ({
            label: SCENE_STATUS_LABELS[st],
            checked: scene.status === st,
            disabled: lockStatus.locked,
            onSelect: () => actions.mutateProject((prev) => updateSceneInProject(prev, scene.id, { status: st })),
          })),
        },
      ]);
      return row;
    };

    const tableHead = () =>
      el(
        'thead',
        {},
        el(
          'tr',
          {},
          el('th', { text: '#' }),
          el('th', { text: 'Scene Title' }),
          el('th', { text: 'Timeline' }),
          el('th', { text: 'POV' }),
          el('th', { text: 'Location' }),
          el('th', { text: 'Stage' }),
          el('th', { text: 'Pacing & Words' }),
          el('th', { text: 'Read' }),
          el('th', { text: 'Actions' }),
        ),
      );

    if (sortMode !== 'order') {
      const sorted = [...allScenes]
        .filter((item) => {
          if (statusFilter !== 'all' && item.scene.status !== statusFilter) return false;
          if (!query) return true;
          return `${item.part.title} ${item.chapter.title} ${item.scene.title} ${item.scene.pov} ${item.scene.location} ${item.scene.timeline}`
            .toLowerCase()
            .includes(query);
        })
        .sort((a, b) => {
          if (sortMode === 'words-desc') return countWords(b.scene.content) - countWords(a.scene.content);
          if (sortMode === 'words-asc') return countWords(a.scene.content) - countWords(b.scene.content);
          if (sortMode === 'status') return a.scene.status.localeCompare(b.scene.status);
          return (a.scene.pov || '').localeCompare(b.scene.pov || '');
        });

      const tbody = el('tbody');
      sorted.forEach((item, idx) => tbody.appendChild(makeSceneRow(item, [item.scene], idx)));
      ledgerHost.appendChild(el('div', { className: 'bv-table-wrap' }, el('table', { className: 'bv-table' }, tableHead(), tbody)));
      return;
    }

    for (const part of project.parts) {
      const partBand = el(
        'div',
        { className: 'qv-outline-part-band' },
        el('strong', { text: part.title, style: { fontSize: '13px', letterSpacing: '0.03em' } }),
        part.locked ? el('span', { className: 'bv-mono-tag', style: { color: 'var(--accent-amber)' } }, icon('lock', 12), ' Part Locked') : null,
      );
      ledgerHost.appendChild(partBand);

      for (const chapter of part.chapters) {
        const chapItems = allScenes.filter(
          (item) =>
            item.chapter.id === chapter.id &&
            (statusFilter === 'all' || item.scene.status === statusFilter) &&
            (!query ||
              `${part.title} ${chapter.title} ${item.scene.title} ${item.scene.pov} ${item.scene.location} ${item.scene.timeline}`
                .toLowerCase()
                .includes(query)),
        );
        if (chapItems.length === 0 && (query || statusFilter !== 'all')) continue;

        const chapWords = getChapterWordCount(chapter);
        const chapShare = Math.round((chapWords / totalBookWords) * 100);
        const isCollapsed = collapsedOutlineChapterIds.has(chapter.id);

        const chapCard = el('section', { className: 'qv-outline-chapter-card' });
        chapCard.appendChild(
          el(
            'div',
            {
              className: 'qv-outline-chapter-head',
              on: {
                click: () => {
                  if (collapsedOutlineChapterIds.has(chapter.id)) collapsedOutlineChapterIds.delete(chapter.id);
                  else collapsedOutlineChapterIds.add(chapter.id);
                  renderLedgerBody();
                },
              },
            },
            el(
              'div',
              { style: { display: 'flex', alignItems: 'center', gap: '8px', minWidth: '0' } },
              icon(isCollapsed ? 'chevron-right' : 'chevron-down', 14),
              el('strong', { text: chapter.title, style: { fontSize: '13.5px' } }),
              chapter.locked || part.locked
                ? el('span', { className: 'qv-outline-lock-pill' }, icon('lock', 11), ' Locked')
                : null,
            ),
            el(
              'div',
              { style: { display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' } },
              el('span', {
                className: 'bv-mono-tag',
                text: `${chapter.scenes.length} scene${chapter.scenes.length === 1 ? '' : 's'}, ${chapWords.toLocaleString()} words (${chapShare}% of book)`,
              }),
              el(
                'button',
                {
                  className: 'bv-icon-tiny',
                  attrs: { type: 'button', title: chapter.locked ? 'Unlock Chapter' : 'Lock Chapter (Finalized)' },
                  on: {
                    click: (e) => {
                      e.stopPropagation();
                      actions.mutateProject((prev) => toggleChapterLock(prev, chapter.id));
                    },
                  },
                },
                icon(chapter.locked ? 'unlock' : 'lock', 12),
              ),
            ),
          ),
        );

        if (!isCollapsed) {
          const tbody = el('tbody');
          chapItems.forEach((item, sIdx) => tbody.appendChild(makeSceneRow(item, chapter.scenes, sIdx)));
          chapCard.appendChild(
            el('div', { className: 'bv-table-wrap' }, el('table', { className: 'bv-table' }, tableHead(), tbody)),
          );
        }
        ledgerHost.appendChild(chapCard);
      }
    }
  }

  renderLedgerBody();

  const wrap = el('div', { className: 'bv-scroll-view' }, ledgerHost);
  container.append(toolbar, wrap);
}
