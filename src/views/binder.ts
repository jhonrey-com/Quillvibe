import type { AppActions } from '../core/app-context';
import {
  addChapterToPart,
  addPartToProject,
  addSceneToChapter,
  deleteChapterFromProject,
  deleteSceneFromProject,
  findSceneContext,
  getChapterWordCount,
  countWords,
  moveScene,
  newId,
  renameChapterInProject,
  renamePartInProject,
  toggleChapterLock,
  togglePartLock,
} from '../core/manuscript';
import { attachContextMenu } from '../ui/context-menu';
import { clearNode, el, icon, preserveScrollPositions } from '../ui/dom';

function startInlineBinderRename(
  labelEl: HTMLElement,
  currentTitle: string,
  onCommit: (nextTitle: string) => void,
): void {
  if (!labelEl.isConnected) return;
  const input = el('input', {
    className: 'bv-binder-rename-input',
    attrs: {
      type: 'text',
      value: currentTitle,
      'aria-label': 'Rename Binder item',
    },
    on: {
      click: (e) => e.stopPropagation(),
      dblclick: (e) => e.stopPropagation(),
    },
  });

  let finished = false;
  const cleanup = (commit: boolean) => {
    if (finished) return;
    finished = true;
    const trimmed = input.value.trim();
    if (commit && trimmed && trimmed !== currentTitle) {
      onCommit(trimmed);
      return;
    }
    if (input.isConnected) {
      input.replaceWith(labelEl);
    }
  };

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      cleanup(true);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      cleanup(false);
    }
  });
  input.addEventListener('blur', () => cleanup(true));

  labelEl.replaceWith(input);
  input.focus();
  input.select();
}

export function renderBinder(container: HTMLElement, actions: AppActions): void {
  const restoreScroll = preserveScrollPositions(container, ['.bv-binder-scroll']);
  clearNode(container);
  const state = actions.getState();
  const { project, activeSceneId } = state;

  let draggedSceneId: string | null = null;

  const head = el(
    'div',
    { className: 'bv-panel-head' },
    el('span', { className: 'bv-panel-title', text: 'Manuscript' }),
    el(
      'div',
      { className: 'bv-binder-actions' },
      el(
        'button',
        {
          className: 'bv-mini-btn',
          tooltip: { title: 'Add Part', short: 'Append a new Part division to this book.' },
          attrs: { type: 'button' },
          on: {
            click: () => {
              const res = addPartToProject(actions.getState().project);
              actions.mutateProject(() => res.project, false);
              actions.selectScene(res.sceneId, true);
              actions.notify('Added new Part');
            },
          },
        },
        icon('plus', 12),
        'Part',
      ),
      el(
        'button',
        {
          className: 'bv-mini-btn',
          tooltip: { title: 'Add Chapter', short: 'Add a new Chapter with starter scene.' },
          attrs: { type: 'button' },
          on: {
            click: () => {
              const partId = project.parts[0]?.id ?? '';
              const res = addChapterToPart(actions.getState().project, partId);
              actions.mutateProject(() => res.project, false);
              actions.selectScene(res.sceneId, true);
              actions.notify('Added new Chapter');
            },
          },
        },
        icon('plus', 12),
        'Ch',
      ),
    ),
  );

  const scroll = el('div', { className: 'bv-binder-scroll' });

  for (const part of project.parts) {
    const partWrap = el('div', { className: 'bv-tree-part' });

    const partBodyInner = el('div', { className: 'qv-accordion-inner' });
    const partBodyWrap = el(
      'div',
      { className: `qv-accordion-wrap${part.collapsed ? ' is-collapsed' : ''}` },
      partBodyInner,
    );

    const partLabelEl = el('span', {
      className: 'bv-tree-label bv-tree-part-label',
      text: part.title,
      on: {
        dblclick: (e) => {
          e.stopPropagation();
          if (part.locked) {
            actions.notify(`Unlock Part “${part.title}” before renaming.`);
            return;
          }
          startInlineBinderRename(partLabelEl, part.title, (nextTitle) => {
            actions.mutateProject((prev) => renamePartInProject(prev, part.id, nextTitle));
            actions.notify(`Renamed Part to “${nextTitle}”`);
          });
        },
      },
    });

    const triggerPartRename = () => {
      if (part.locked) {
        actions.notify(`Unlock Part “${part.title}” before renaming.`);
        return;
      }
      startInlineBinderRename(partLabelEl, part.title, (nextTitle) => {
        actions.mutateProject((prev) => renamePartInProject(prev, part.id, nextTitle));
        actions.notify(`Renamed Part to “${nextTitle}”`);
      });
    };

    const partRow = el(
      'div',
      { className: 'bv-tree-row' },
      el(
        'div',
        {
          className: 'bv-tree-row-left',
          on: {
            click: () => {
              const nextCollapsed = !partBodyWrap.classList.contains('is-collapsed');
              partBodyWrap.classList.toggle('is-collapsed', nextCollapsed);
              actions.mutateProject((prev) => {
                const next = structuredClone(prev);
                const target = next.parts.find((p) => p.id === part.id);
                if (target) target.collapsed = nextCollapsed;
                return next;
              }, false);
            },
          },
        },
        icon(part.collapsed ? 'chevron-right' : 'chevron-down', 13),
        partLabelEl,
        part.locked
          ? el('span', { className: 'qv-binder-lock-badge', attrs: { title: 'Part locked (finalized)' } }, icon('lock', 11))
          : null,
      ),
      el(
        'div',
        { className: 'bv-row-hover-tools' },
        el(
          'button',
          {
            className: 'bv-icon-tiny',
            tooltip: { title: 'Rename Part', short: 'Edit the name of this Part division.' },
            attrs: { type: 'button', 'aria-label': 'Rename Part' },
            on: {
              click: (e) => {
                e.stopPropagation();
                triggerPartRename();
              },
            },
          },
          icon('quill', 12),
        ),
        el(
          'button',
          {
            className: 'bv-icon-tiny',
            tooltip: {
              title: part.locked ? 'Unlock Part' : 'Lock Part (Finalized)',
              short: part.locked
                ? 'Allow editing inside all chapters of this Part again.'
                : 'Prevent accidental edits to finalized prose in this Part.',
            },
            attrs: { type: 'button', 'aria-label': part.locked ? 'Unlock Part' : 'Lock Part' },
            on: {
              click: (e) => {
                e.stopPropagation();
                actions.mutateProject((prev) => togglePartLock(prev, part.id));
                actions.notify(part.locked ? `Unlocked Part “${part.title}”` : `Locked Part “${part.title}” (finalized)`);
              },
            },
          },
          icon(part.locked ? 'unlock' : 'lock', 12),
        ),
        el(
          'button',
          {
            className: 'bv-icon-tiny',
            tooltip: { title: 'Add Chapter to Part', short: 'Create a chapter inside this Part.' },
            attrs: { type: 'button' },
            on: {
              click: (e) => {
                e.stopPropagation();
                const res = addChapterToPart(actions.getState().project, part.id);
                actions.mutateProject(() => res.project, false);
                actions.selectScene(res.sceneId, true);
              },
            },
          },
          icon('plus', 12),
        ),
      ),
    );

    attachContextMenu(partRow, () => [
      {
        heading: part.title,
        items: [
          {
            label: 'Rename Part',
            icon: 'quill',
            disabled: Boolean(part.locked),
            onSelect: triggerPartRename,
          },
          {
            label: part.locked ? 'Unlock Part for Editing' : 'Lock Part (Final / Proofread)',
            icon: part.locked ? 'unlock' : 'lock',
            onSelect: () => {
              actions.mutateProject((prev) => togglePartLock(prev, part.id));
              actions.notify(part.locked ? `Unlocked Part “${part.title}”` : `Locked Part “${part.title}” (finalized)`);
            },
          },
          {
            label: 'Add Chapter to Part',
            icon: 'plus',
            onSelect: () => {
              const res = addChapterToPart(actions.getState().project, part.id);
              actions.mutateProject(() => res.project, false);
              actions.selectScene(res.sceneId, true);
            },
          },
        ],
      },
    ]);

    partWrap.appendChild(partRow);

    for (const chapter of part.chapters) {
      const chapWrap = el('div', { className: 'bv-tree-chapter' });
      const chapWords = getChapterWordCount(chapter);
      const chapBodyInner = el('div', { className: 'qv-accordion-inner' });
      const chapBodyWrap = el(
        'div',
        { className: `qv-accordion-wrap${chapter.collapsed ? ' is-collapsed' : ''}` },
        chapBodyInner,
      );

      const triggerChapterRename = () => {
        if (part.locked || chapter.locked) {
          actions.notify(`Unlock “${chapter.title}” before renaming.`);
          return;
        }
        startInlineBinderRename(chapLabelEl, chapter.title, (nextTitle) => {
          actions.mutateProject((prev) => renameChapterInProject(prev, chapter.id, nextTitle));
          actions.notify(`Renamed Chapter to “${nextTitle}”`);
        });
      };

      const chapLabelEl = el('span', {
        className: 'bv-tree-label bv-tree-chapter-label',
        text: chapter.title,
        on: {
          dblclick: (e) => {
            e.stopPropagation();
            triggerChapterRename();
          },
        },
      });

      const chapRow = el(
          'div',
          {
            className: 'bv-tree-row',
            on: {
              dragover: (e) => {
                if (!draggedSceneId) return;
                e.preventDefault();
                chapRow.classList.add('is-drop-target');
              },
              dragleave: () => chapRow.classList.remove('is-drop-target'),
              drop: (e) => {
                e.preventDefault();
                chapRow.classList.remove('is-drop-target');
                if (!draggedSceneId) return;
                const movedId = draggedSceneId;
                draggedSceneId = null;
                actions.mutateProject((prev) => moveScene(prev, movedId, chapter.id));
              },
            },
          },
          el(
            'div',
            {
              className: 'bv-tree-row-left',
              on: {
                click: () => {
                  const nextCollapsed = !chapBodyWrap.classList.contains('is-collapsed');
                  chapBodyWrap.classList.toggle('is-collapsed', nextCollapsed);
                  actions.mutateProject((prev) => {
                    const next = structuredClone(prev);
                    for (const p of next.parts) {
                      const c = p.chapters.find((ch) => ch.id === chapter.id);
                      if (c) c.collapsed = nextCollapsed;
                    }
                    return next;
                  }, false);
                },
              },
            },
            icon(chapter.collapsed ? 'chevron-right' : 'chevron-down', 12),
            chapLabelEl,
            chapter.locked
              ? el('span', { className: 'qv-binder-lock-badge', attrs: { title: 'Chapter locked (finalized)' } }, icon('lock', 11))
              : null,
          ),
          el(
            'span',
            {
              className: 'bv-tree-count bv-tree-count-hide-hover',
              text: String(chapWords),
              attrs: { 'data-binder-chap': chapter.id },
            },
          ),
          el(
            'div',
            { className: 'bv-row-hover-tools' },
            el(
              'button',
              {
                className: 'bv-icon-tiny',
                tooltip: { title: 'Rename Chapter', short: 'Edit the name of this Chapter.' },
                attrs: { type: 'button', 'aria-label': 'Rename Chapter' },
                on: {
                  click: (e) => {
                    e.stopPropagation();
                    triggerChapterRename();
                  },
                },
              },
              icon('quill', 12),
            ),
            el(
              'button',
              {
                className: 'bv-icon-tiny',
                tooltip: {
                  title: chapter.locked ? 'Unlock Chapter' : 'Lock Chapter (Finalized)',
                  short: chapter.locked
                    ? 'Allow editing scenes in this chapter again.'
                    : 'Protect finalized proofread scenes in this chapter.',
                },
                attrs: { type: 'button', 'aria-label': chapter.locked ? 'Unlock Chapter' : 'Lock Chapter' },
                on: {
                  click: (e) => {
                    e.stopPropagation();
                    actions.mutateProject((prev) => toggleChapterLock(prev, chapter.id));
                    actions.notify(chapter.locked ? `Unlocked “${chapter.title}”` : `Locked “${chapter.title}” (finalized)`);
                  },
                },
              },
              icon(chapter.locked ? 'unlock' : 'lock', 12),
            ),
            el(
              'button',
              {
                className: 'bv-icon-tiny',
                tooltip: { title: 'Add Scene', short: 'Append a new scene to this chapter.' },
                attrs: { type: 'button' },
                on: {
                  click: (e) => {
                    e.stopPropagation();
                    const res = addSceneToChapter(actions.getState().project, chapter.id);
                    actions.mutateProject(() => res.project, false);
                    actions.selectScene(res.sceneId, true);
                  },
                },
              },
              icon('plus', 12),
            ),
            el(
              'button',
              {
                className: 'bv-icon-tiny',
                tooltip: { title: 'Delete Chapter', short: 'Remove this chapter and its scenes.' },
                attrs: { type: 'button' },
                on: {
                  click: (e) => {
                    e.stopPropagation();
                    if (part.chapters.length <= 1 && project.parts.length <= 1) {
                      actions.notify('A manuscript must contain at least one chapter.');
                      return;
                    }
                    const currentActiveId = actions.getState().activeSceneId;
                    const res = deleteChapterFromProject(actions.getState().project, chapter.id);
                    const activeStillExists = Boolean(currentActiveId && findSceneContext(res.project, currentActiveId));
                    if (activeStillExists) {
                      actions.mutateProject(() => res.project, true);
                    } else {
                      actions.mutateProject(() => res.project, false);
                      if (res.fallbackSceneId) {
                        actions.selectScene(res.fallbackSceneId, false);
                      } else {
                        actions.setState({ activeSceneId: '' }, true);
                      }
                    }
                  },
                },
              },
              icon('trash', 12),
            ),
          ),
        );

        chapWrap.appendChild(chapRow);

        attachContextMenu(chapRow, () => [
          {
            heading: chapter.title,
            items: [
              {
                label: 'Rename Chapter',
                icon: 'quill',
                disabled: Boolean(part.locked || chapter.locked),
                onSelect: triggerChapterRename,
              },
              {
                label: chapter.locked ? 'Unlock Chapter for Editing' : 'Lock Chapter (Final / Proofread)',
                icon: chapter.locked ? 'unlock' : 'lock',
                onSelect: () => {
                  actions.mutateProject((prev) => toggleChapterLock(prev, chapter.id));
                  actions.notify(chapter.locked ? `Unlocked “${chapter.title}”` : `Locked “${chapter.title}” (finalized)`);
                },
              },
              {
                label: 'Add Scene to Chapter',
                icon: 'plus',
                onSelect: () => {
                  const res = addSceneToChapter(actions.getState().project, chapter.id);
                  actions.mutateProject(() => res.project, false);
                  actions.selectScene(res.sceneId, true);
                },
              },
              {
                label: 'Add New Chapter',
                icon: 'book',
                onSelect: () => {
                  const res = addChapterToPart(actions.getState().project, part.id);
                  actions.mutateProject(() => res.project, false);
                  actions.selectScene(res.sceneId, true);
                },
              },
              {
                label: chapter.collapsed ? 'Expand Chapter' : 'Collapse Chapter',
                icon: chapter.collapsed ? 'chevron-down' : 'chevron-right',
                onSelect: () => {
                  actions.mutateProject((prev) => {
                    const next = structuredClone(prev);
                    for (const p of next.parts) {
                      const c = p.chapters.find((ch) => ch.id === chapter.id);
                      if (c) c.collapsed = !c.collapsed;
                    }
                    return next;
                  });
                },
              },
            ],
          },
          {
            items: [
              {
                label: 'Delete Chapter',
                icon: 'trash',
                danger: true,
                disabled: part.chapters.length <= 1 && project.parts.length <= 1,
                onSelect: () => {
                  const currentActiveId = actions.getState().activeSceneId;
                  const res = deleteChapterFromProject(actions.getState().project, chapter.id);
                  const activeStillExists = Boolean(currentActiveId && findSceneContext(res.project, currentActiveId));
                  if (activeStillExists) {
                    actions.mutateProject(() => res.project, true);
                  } else {
                    actions.mutateProject(() => res.project, false);
                    if (res.fallbackSceneId) {
                      actions.selectScene(res.fallbackSceneId, false);
                    } else {
                      actions.setState({ activeSceneId: '' }, true);
                    }
                  }
                },
              },
            ],
          },
        ]);

        chapter.scenes.forEach((scene, sIdx) => {
            const words = countWords(scene.content);
            const sceneRow = el(
              'div',
              {
                className: `bv-tree-row bv-tree-scene${scene.id === activeSceneId ? ' is-active' : ''}`,
                attrs: { draggable: true },
                on: {
                  click: () => actions.selectScene(scene.id, true),
                  dragstart: (e) => {
                    draggedSceneId = scene.id;
                    e.dataTransfer?.setData('text/plain', scene.id);
                  },
                  dragover: (e) => {
                    if (!draggedSceneId || draggedSceneId === scene.id) return;
                    e.preventDefault();
                    sceneRow.classList.add('is-drop-target');
                  },
                  dragleave: () => sceneRow.classList.remove('is-drop-target'),
                  drop: (e) => {
                    e.preventDefault();
                    sceneRow.classList.remove('is-drop-target');
                    if (!draggedSceneId || draggedSceneId === scene.id) return;
                    const movedId = draggedSceneId;
                    draggedSceneId = null;
                    actions.mutateProject((prev) => moveScene(prev, movedId, chapter.id, sIdx));
                  },
                },
              },
              el(
                'div',
                { className: 'bv-tree-row-left' },
                el('span', { className: `bv-status-dot bv-status-${scene.status}` }),
                el('span', {
                  className: 'bv-tree-label',
                  text: scene.title || 'Untitled Scene',
                  attrs: { 'data-binder-title': scene.id },
                }),
              ),
              el('span', {
                className: 'bv-tree-count bv-tree-count-hide-hover',
                text: String(words),
                attrs: { 'data-binder-scene': scene.id },
              }),
              el(
                'div',
                { className: 'bv-row-hover-tools' },
                el(
                  'button',
                  {
                    className: 'bv-icon-tiny',
                    tooltip: { title: 'Export .qvscene', short: 'Save scene as standalone .qvscene file.' },
                    attrs: { type: 'button' },
                    on: {
                      click: (e) => {
                        e.stopPropagation();
                        void actions.exportAsExtension('.qvscene', { sceneId: scene.id });
                      },
                    },
                  },
                  icon('file', 12),
                ),
                el(
                  'button',
                  {
                    className: 'bv-icon-tiny',
                    tooltip: { title: 'Delete Scene', short: 'Remove scene from this chapter.' },
                    attrs: { type: 'button' },
                    on: {
                      click: (e) => {
                        e.stopPropagation();
                        const currentActiveId = actions.getState().activeSceneId;
                        const res = deleteSceneFromProject(actions.getState().project, scene.id);
                        const activeStillExists = Boolean(currentActiveId && findSceneContext(res.project, currentActiveId));
                        if (activeStillExists) {
                          actions.mutateProject(() => res.project, true);
                        } else {
                          actions.mutateProject(() => res.project, false);
                          if (res.fallbackSceneId) {
                            actions.selectScene(res.fallbackSceneId, false);
                          } else {
                            actions.setState({ activeSceneId: '' }, true);
                          }
                        }
                      },
                    },
                  },
                  icon('trash', 12),
                ),
              ),
            );
            chapBodyInner.appendChild(sceneRow);
            attachContextMenu(sceneRow, () => [
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
                    label: 'Open in Proofread Markup',
                    icon: 'proofread',
                    onSelect: () => {
                      actions.setState({ editorSubMode: 'proofread' }, false);
                      actions.selectScene(scene.id, true);
                    },
                  },
                  {
                    label: 'Duplicate Scene',
                    icon: 'copy-layer',
                    onSelect: () => {
                      const copyId = newId('scene');
                      actions.mutateProject((prev) => {
                        const next = structuredClone(prev);
                        for (const p of next.parts) {
                          const c = p.chapters.find((ch) => ch.id === chapter.id);
                          if (!c) continue;
                          const idx = c.scenes.findIndex((s) => s.id === scene.id);
                          if (idx >= 0) {
                            const cloned = structuredClone(c.scenes[idx]);
                            cloned.id = copyId;
                            cloned.title = `${cloned.title || 'Scene'} (Copy)`;
                            cloned.updatedAt = new Date().toISOString();
                            c.scenes.splice(idx + 1, 0, cloned);
                            break;
                          }
                        }
                        return next;
                      }, false);
                      actions.selectScene(copyId, true);
                      actions.notify('Duplicated scene');
                    },
                  },
                  {
                    label: 'Export Standalone (.qvscene)',
                    icon: 'file',
                    onSelect: () => void actions.exportAsExtension('.qvscene', { sceneId: scene.id }),
                  },
                ],
              },
              {
                items: [
                  {
                    label: 'Delete Scene',
                    icon: 'trash',
                    danger: true,
                    onSelect: () => {
                      const currentActiveId = actions.getState().activeSceneId;
                      const res = deleteSceneFromProject(actions.getState().project, scene.id);
                      const activeStillExists = Boolean(currentActiveId && findSceneContext(res.project, currentActiveId));
                      if (activeStillExists) {
                        actions.mutateProject(() => res.project, true);
                      } else {
                        actions.mutateProject(() => res.project, false);
                        if (res.fallbackSceneId) {
                          actions.selectScene(res.fallbackSceneId, false);
                        } else {
                          actions.setState({ activeSceneId: '' }, true);
                        }
                      }
                    },
                  },
                ],
              },
            ]);
          });
        chapWrap.appendChild(chapBodyWrap);
        partBodyInner.appendChild(chapWrap);
      }
    partWrap.appendChild(partBodyWrap);
    scroll.appendChild(partWrap);
  }

  container.append(head, scroll);
  restoreScroll();
}
