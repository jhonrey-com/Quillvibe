import type { AppActions } from '../core/app-context';
import { getSceneMentions } from '../core/bible';
import {
  COLLABORATOR_ROLE_LABELS,
  acceptSceneAnnotation,
  addSceneAnnotation,
  dismissSceneAnnotation,
} from '../core/collab';
import {
  SCENE_STATUS_LABELS,
  findSceneContext,
  updateSceneInProject,
} from '../core/manuscript';
import type { CollaboratorRole, SceneStatus } from '../core/types';
import { clearNode, el, icon } from '../ui/dom';

export function renderInspector(container: HTMLElement, actions: AppActions): void {
  clearNode(container);
  const state = actions.getState();
  const ctx = findSceneContext(state.project, state.activeSceneId);

  const head = el(
    'div',
    { className: 'bv-panel-head' },
    el('span', { className: 'bv-panel-title', text: 'Scene Inspector' }),
    el(
      'div',
      { style: { display: 'flex', gap: '4px', alignItems: 'center' } },
      state.activeView !== 'editor' && ctx
        ? el('button', {
            className: 'bv-mini-btn',
            text: 'Edit',
            tooltip: { title: 'Jump to Scene', short: 'Switch main canvas to this scene in Manuscript Draft mode.' },
            attrs: { type: 'button' },
            on: { click: () => actions.selectScene(ctx.scene.id, true) },
          })
        : null,
      ctx
        ? el(
            'button',
            {
              className: 'bv-mini-btn',
              tooltip: { title: 'Export .qvscene', short: 'Save this scene alone as a protected .qvscene file.' },
              attrs: { type: 'button' },
              on: { click: () => void actions.exportAsExtension('.qvscene', { sceneId: ctx.scene.id }) },
            },
            icon('file', 11),
            '.qvscene',
          )
        : null,
    ),
  );

  const scroll = el('div', { className: 'bv-inspector-scroll' });

  if (!ctx) {
    scroll.appendChild(el('p', { className: 'bv-label', text: 'No scene selected.' }));
    container.append(head, scroll);
    return;
  }

  const { scene } = ctx;

  const statusSelect = el('select', {
    className: 'bv-input',
    on: {
      change: () => {
        const status = statusSelect.value as SceneStatus;
        actions.mutateProject((prev) => updateSceneInProject(prev, scene.id, { status }));
      },
    },
  });
  for (const [val, label] of Object.entries(SCENE_STATUS_LABELS)) {
    statusSelect.appendChild(
      el('option', {
        text: label,
        attrs: { value: val, selected: scene.status === val },
      }),
    );
  }

  const targetInput = el('input', {
    className: 'bv-input',
    attrs: { type: 'number', min: 0, step: 100, value: scene.wordTarget },
    on: {
      change: () => {
        const parsed = Math.max(0, Number(targetInput.value) || 0);
        actions.mutateProject((prev) => updateSceneInProject(prev, scene.id, { wordTarget: parsed }));
      },
    },
  });

  const povInput = el('input', {
    className: 'bv-input',
    attrs: { type: 'text', value: scene.pov, placeholder: 'Point of view' },
    on: {
      change: () =>
        actions.mutateProject((prev) => updateSceneInProject(prev, scene.id, { pov: povInput.value })),
    },
  });

  const locInput = el('input', {
    className: 'bv-input',
    attrs: { type: 'text', value: scene.location, placeholder: 'Setting / Place' },
    on: {
      change: () =>
        actions.mutateProject((prev) =>
          updateSceneInProject(prev, scene.id, { location: locInput.value }),
        ),
    },
  });

  const timeInput = el('input', {
    className: 'bv-input',
    attrs: { type: 'text', value: scene.timeline, placeholder: 'Day 1, Morning' },
    on: {
      change: () =>
        actions.mutateProject((prev) =>
          updateSceneInProject(prev, scene.id, { timeline: timeInput.value }),
        ),
    },
  });

  const synopsisBox = el('textarea', {
    className: 'bv-textarea',
    attrs: { rows: 3, placeholder: 'One-sentence scene purpose…' },
    on: {
      change: () =>
        actions.mutateProject((prev) =>
          updateSceneInProject(prev, scene.id, { synopsis: synopsisBox.value }),
        ),
    },
  });
  synopsisBox.value = scene.synopsis;

  const notesBox = el('textarea', {
    className: 'bv-textarea',
    attrs: { rows: 3, placeholder: 'Continuity & research notes…' },
    on: {
      change: () =>
        actions.mutateProject((prev) =>
          updateSceneInProject(prev, scene.id, { notes: notesBox.value }),
        ),
    },
  });
  notesBox.value = scene.notes;

  const metaGroup = el(
    'div',
    { className: 'bv-field-group' },
    el(
      'div',
      { className: 'bv-field-row' },
      el('div', { className: 'bv-field' }, el('label', { className: 'bv-label', text: 'Status' }), statusSelect),
      el('div', { className: 'bv-field' }, el('label', { className: 'bv-label', text: 'Word Target' }), targetInput),
    ),
    el(
      'div',
      { className: 'bv-field-row' },
      el('div', { className: 'bv-field' }, el('label', { className: 'bv-label', text: 'POV' }), povInput),
      el('div', { className: 'bv-field' }, el('label', { className: 'bv-label', text: 'Timeline' }), timeInput),
    ),
    el('div', { className: 'bv-field' }, el('label', { className: 'bv-label', text: 'Location' }), locInput),
    el('div', { className: 'bv-field' }, el('label', { className: 'bv-label', text: 'Synopsis' }), synopsisBox),
    el('div', { className: 'bv-field' }, el('label', { className: 'bv-label', text: 'Scene Notes' }), notesBox),
  );

  // Story Bible Mentions Section
  const mentions = getSceneMentions(scene, state.project.bible);
  const mentionList = el('div', { className: 'bv-mention-list' });
  if (mentions.length === 0) {
    mentionList.appendChild(
      el('span', { className: 'bv-label', text: 'No Story Bible entities referenced yet.' }),
    );
  } else {
    for (const m of mentions) {
      const cat = m.kind === 'character' ? 'characters' : m.kind === 'location' ? 'locations' : 'lore';
      const card = el(
        'div',
        {
          className: 'bv-list-card',
          style: { cursor: 'pointer' },
          on: { click: () => actions.openBibleEntry(cat, m.id) },
        },
        el(
          'div',
          {},
          el('div', { text: m.name, style: { fontWeight: '600', fontSize: '12px' } }),
          el('div', { className: 'bv-label', text: m.subtitle || m.kind }),
        ),
        el('span', { className: 'bv-mono-tag', text: `${m.count}×` }),
      );
      mentionList.appendChild(card);
    }
  }

  const mentionsGroup = el(
    'div',
    { className: 'bv-field-group' },
    el('span', { className: 'bv-panel-title', text: 'Detected Bible Entities' }),
    mentionList,
  );

  // Snapshots Section
  const snapList = el('div', { className: 'bv-snap-list' });
  if (scene.snapshots.length === 0) {
    snapList.appendChild(
      el('span', { className: 'bv-label', text: 'Use Snapshot or Ctrl+S to capture checkpoints.' }),
    );
  } else {
    for (const snap of scene.snapshots) {
      snapList.appendChild(
        el(
          'div',
          {
            className: 'bv-list-card',
            style: { cursor: 'pointer' },
            on: {
              click: () => {
                actions.setState({
                  activeView: 'editor',
                  editorSubMode: 'diff',
                  diffSnapshotId: snap.id,
                });
              },
            },
          },
          el(
            'div',
            {},
            el('div', { text: snap.label, style: { fontSize: '12px', fontWeight: '500' } }),
            el('div', {
              className: 'bv-label',
              text: new Date(snap.createdAt).toLocaleString(),
            }),
          ),
          el('span', { className: 'bv-mono-tag', text: `${snap.wordCount}w` }),
        ),
      );
    }
  }

  const snapsGroup = el(
    'div',
    { className: 'bv-field-group' },
    el(
      'div',
      { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
      el('span', { className: 'bv-panel-title', text: 'Revision Snapshots' }),
      el(
        'button',
        {
          className: 'bv-mini-btn',
          text: '+ Capture',
          attrs: { type: 'button' },
          on: { click: () => actions.createSnapshot() },
        },
      ),
    ),
    snapList,
  );

  // Proofreading Marks Summary
  const openMarksCount = (scene.proofreadMarks ?? []).filter((m) => m.status === 'open').length;
  const stetMarksCount = (scene.proofreadMarks ?? []).filter((m) => m.status === 'stet').length;
  const proofSummaryGroup = el(
    'div',
    { className: 'bv-field-group' },
    el(
      'div',
      { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
      el('span', { className: 'bv-panel-title', text: 'Proofread Marks' }),
      el(
        'button',
        {
          className: 'bv-mini-btn',
          tooltip: { title: 'Open Proofread Mode', short: 'Review strikeout, caret, transpose, and stet marks on this scene.' },
          attrs: { type: 'button' },
          on: { click: () => actions.setState({ activeView: 'editor', editorSubMode: 'proofread' }, true) },
        },
        icon('proofread', 11),
        'Review',
      ),
    ),
    el(
      'div',
      { className: 'bv-list-card' },
      el('span', { className: 'bv-label', text: `${openMarksCount} open, ${stetMarksCount} stet` }),
      el('span', {
        className: 'bv-mono-tag',
        text: openMarksCount > 0 ? 'REVIEW' : 'CLEAR',
        style: { color: openMarksCount > 0 ? 'var(--accent-amber)' : 'var(--accent-emerald)' },
      }),
    ),
  );

  // Proofreader & Co-Author Review Annotations
  const openAnnotations = (scene.annotations ?? []).filter((a) => a.status === 'open');
  const annList = el('div', { className: 'bv-snap-list' });

  const quoteInput = el('input', {
    className: 'bv-input',
    attrs: { type: 'text', placeholder: 'Exact phrase to replace (optional)', 'aria-label': 'Quoted text' },
  });
  const suggestInput = el('input', {
    className: 'bv-input',
    attrs: { type: 'text', placeholder: 'Suggested wording (optional)', 'aria-label': 'Suggested replacement' },
  });
  const noteInput = el('input', {
    className: 'bv-input',
    attrs: { type: 'text', placeholder: 'Proofreader or co-author comment…', 'aria-label': 'Review note' },
  });

  if (openAnnotations.length === 0) {
    annList.appendChild(
      el('span', { className: 'bv-label', text: 'No open proofreader notes on this scene.' }),
    );
  } else {
    for (const ann of openAnnotations) {
      annList.appendChild(
        el(
          'div',
          {
            className: 'bv-list-card',
            style: { flexDirection: 'column', alignItems: 'stretch', gap: '6px' },
          },
          el(
            'div',
            { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
            el('strong', { text: ann.authorName, style: { fontSize: '12px' } }),
            el('span', {
              className: 'bv-mono-tag',
              text: COLLABORATOR_ROLE_LABELS[ann.role] ?? ann.role,
            }),
          ),
          ann.quote
            ? el('div', {
                className: 'bv-label',
                text: `“${ann.quote}” → “${ann.suggestion || 'remove'}”`,
                style: { color: 'var(--accent-amber)' },
              })
            : null,
          ann.note ? el('div', { text: ann.note, style: { fontSize: '12px' } }) : null,
          el(
            'div',
            { style: { display: 'flex', gap: '6px', justifyContent: 'flex-end' } },
            el('button', {
              className: 'bv-mini-btn',
              text: ann.quote && ann.suggestion ? 'Accept Edit' : 'Resolve',
              attrs: { type: 'button' },
              on: {
                click: () => {
                  const res = acceptSceneAnnotation(
                    actions.getState().project,
                    scene.id,
                    ann.id,
                  );
                  actions.mutateProject(() => res.project);
                  actions.notify(
                    res.appliedReplacement
                      ? 'Applied proofreader edit (snapshot saved)'
                      : 'Marked annotation resolved',
                  );
                },
              },
            }),
            el('button', {
              className: 'bv-mini-btn',
              text: 'Dismiss',
              attrs: { type: 'button' },
              on: {
                click: () =>
                  actions.mutateProject((prev) =>
                    dismissSceneAnnotation(prev, scene.id, ann.id),
                  ),
              },
            }),
          ),
        ),
      );
    }
  }

  const activeCollab = (state.project.collaborators ?? []).find(
    (c) => c.name === state.project.activeAuthorLabel || c.penName === state.project.activeAuthorLabel,
  );
  const activeRole: CollaboratorRole = activeCollab?.role ?? 'proofreader';
  const activeReviewerName =
    state.project.activeAuthorLabel ||
    state.project.authorIdentity?.penName ||
    state.project.author ||
    'Proofreader';

  const annotationsGroup = el(
    'div',
    { className: 'bv-field-group' },
    el('span', {
      className: 'bv-panel-title',
      text: `Proofreader Notes (${openAnnotations.length})`,
    }),
    annList,
    el(
      'div',
      { style: { display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '4px' } },
      quoteInput,
      suggestInput,
      noteInput,
      el(
        'button',
        {
          className: 'bv-mini-btn',
          text: `+ Add Note as ${activeReviewerName}`,
          attrs: { type: 'button' },
          style: { justifyContent: 'center' },
          on: {
            click: () => {
              if (!noteInput.value.trim() && !quoteInput.value.trim()) {
                actions.notify('Enter a note or quoted phrase first.');
                return;
              }
              actions.mutateProject((prev) =>
                addSceneAnnotation(prev, scene.id, {
                  authorName: activeReviewerName,
                  role: activeRole,
                  quote: quoteInput.value,
                  suggestion: suggestInput.value,
                  note: noteInput.value,
                }),
              );
              actions.notify('Added scene annotation');
            },
          },
        },
      ),
    ),
  );

  scroll.append(metaGroup, proofSummaryGroup, annotationsGroup, mentionsGroup, snapsGroup);
  container.append(head, scroll);
}
