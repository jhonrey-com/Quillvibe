import type { AppActions, BibleCategory } from '../core/app-context';
import { getActiveSessionPermissions } from '../core/collab';
import {
  indexBibleMentions,
  upsertCharacter,
  upsertLocation,
  upsertLore,
} from '../core/bible';
import { downscaleImageFileToDataUrl } from '../core/cover';
import { normalizeProjectDefaults } from '../core/library';
import { newId } from '../core/manuscript';
import type {
  CharacterEntry,
  CustomBibleEntry,
  CustomBibleField,
  LocationEntry,
  LoreEntry,
} from '../core/types';
import { clearNode, el, icon, preserveScrollPositions } from '../ui/dom';
import { LiquidGlassControl } from '../ui/liquid-glass';

let activeBibleGlass: LiquidGlassControl<BibleCategory> | null = null;

function reorderArray<T>(list: T[], fromIdx: number, toIdx: number): T[] {
  const copy = [...list];
  const [moved] = copy.splice(fromIdx, 1);
  copy.splice(toIdx, 0, moved);
  return copy;
}

export function renderBibleView(container: HTMLElement, rawActions: AppActions): void {
  if (activeBibleGlass) {
    activeBibleGlass.destroy();
    activeBibleGlass = null;
  }
  const restoreScroll = preserveScrollPositions(container, ['.bv-binder-scroll', '.bv-bible-detail']);
  clearNode(container);

  const initialState = rawActions.getState();
  const biblePerms = getActiveSessionPermissions(initialState.project);
  const actions: AppActions = biblePerms.canEditBibleAndGraph
    ? rawActions
    : {
        ...rawActions,
        mutateProject: () => {
          rawActions.notify('Story Bible editing is disabled for your collaborator role.');
        },
      };

  const state = actions.getState();
  const project = normalizeProjectDefaults(state.project);
  const customCats = project.bible.customCategories ?? [];
  const customEntries = project.bible.customEntries ?? [];
  const bibleCategory = state.bibleCategory;
  const activeBibleId = state.activeBibleId;
  const mentionsIndex = indexBibleMentions(project);

  const glassOptions: Array<{ id: BibleCategory; label: string }> = [
    { id: 'characters', label: `Characters (${project.bible.characters.length})` },
    { id: 'locations', label: `Locations (${project.bible.locations.length})` },
    { id: 'lore', label: `Lore & Items (${project.bible.lore.length})` },
    ...customCats.map((cat) => ({
      id: cat.id,
      label: `${cat.name} (${customEntries.filter((e) => e.categoryId === cat.id).length})`,
    })),
  ];

  const resolvedCategory = glassOptions.some((o) => o.id === bibleCategory)
    ? bibleCategory
    : 'characters';

  const catControl = new LiquidGlassControl<BibleCategory>({
    ariaLabel: 'Story Bible category',
    surface: 'solid',
    compact: true,
    value: resolvedCategory,
    options: glassOptions,
    onChange: (cat) => {
      const firstId =
        cat === 'characters'
          ? project.bible.characters[0]?.id ?? ''
          : cat === 'locations'
            ? project.bible.locations[0]?.id ?? ''
            : cat === 'lore'
              ? project.bible.lore[0]?.id ?? ''
              : customEntries.find((e) => e.categoryId === cat)?.id ?? '';
      actions.setState({ bibleCategory: cat, activeBibleId: firstId }, true);
    },
  });
  activeBibleGlass = catControl;

  const newCatInput = el('input', {
    className: 'bv-input',
    style: { width: '150px', height: '28px' },
    attrs: { type: 'text', placeholder: 'New category name…', 'aria-label': 'New custom category name' },
  });

  const toolbar = el(
    'div',
    { className: 'bv-subbar' },
    catControl.element,
    el(
      'div',
      { className: 'bv-subbar-group' },
      newCatInput,
      el(
        'button',
        {
          className: 'bv-mini-btn',
          tooltip: { title: 'New Custom Category', short: 'Add your own tab such as Magic Systems, Factions, or Vessels.' },
          attrs: { type: 'button' },
          on: {
            click: () => {
              const name = newCatInput.value.trim();
              if (!name) {
                actions.notify('Enter a name for the custom Story Bible category.');
                return;
              }
              const catId = newId('bcat');
              actions.mutateProject((prev) => {
                const next = normalizeProjectDefaults(prev);
                next.bible.customCategories = [
                  ...(next.bible.customCategories ?? []),
                  { id: catId, name, description: '' },
                ];
                return next;
              }, false);
              actions.setState({ bibleCategory: catId, activeBibleId: '' }, true);
              actions.notify(`Added category “${name}”`);
            },
          },
        },
        icon('plus', 12),
        'Category',
      ),
      el(
        'button',
        {
          className: 'bv-btn',
          tooltip: { title: 'Import .qvbible', short: 'Merge characters, locations, and lore from a .qvbible file.' },
          attrs: { type: 'button' },
          on: { click: () => void actions.openAnyQuillvibeFile() },
        },
        icon('folder', 14),
        'Import .qvbible',
      ),
      el(
        'button',
        {
          className: 'bv-btn',
          tooltip: { title: 'Export .qvbible', short: 'Save this Story Bible database for reuse across series books.' },
          attrs: { type: 'button' },
          on: { click: () => void actions.exportAsExtension('.qvbible') },
        },
        icon('download', 14),
        'Export .bvbible',
      ),
    ),
  );

  const layout = el('div', { className: 'bv-bible-layout' });
  const listPane = el('div', { className: 'bv-bible-list' });
  const activeCustomCat = customCats.find((c) => c.id === resolvedCategory);

  const listHead = el(
    'div',
    { className: 'bv-panel-head' },
    el('span', {
      className: 'bv-panel-title',
      text: activeCustomCat ? activeCustomCat.name : resolvedCategory,
    }),
    el(
      'div',
      { style: { display: 'flex', gap: '4px' } },
      activeCustomCat
        ? el(
            'button',
            {
              className: 'bv-mini-btn',
              attrs: { type: 'button', title: 'Delete custom category' },
              on: {
                click: () => {
                  actions.mutateProject((prev) => {
                    const next = normalizeProjectDefaults(prev);
                    next.bible.customCategories = (next.bible.customCategories ?? []).filter(
                      (c) => c.id !== activeCustomCat.id,
                    );
                    next.bible.customEntries = (next.bible.customEntries ?? []).filter(
                      (e) => e.categoryId !== activeCustomCat.id,
                    );
                    return next;
                  }, false);
                  actions.setState({ bibleCategory: 'characters', activeBibleId: '' }, true);
                },
              },
            },
            icon('trash', 12),
          )
        : null,
      el(
        'button',
        {
          className: 'bv-mini-btn',
          attrs: { type: 'button' },
          on: {
            click: () => {
              const id = newId('ent');
              if (resolvedCategory === 'characters') {
                const entry: CharacterEntry = {
                  id,
                  name: 'New Character',
                  aliases: '',
                  role: 'Supporting',
                  motivation: '',
                  appearance: '',
                  notes: '',
                  customFields: [],
                };
                actions.mutateProject((prev) => upsertCharacter(prev, entry), false);
              } else if (resolvedCategory === 'locations') {
                const entry: LocationEntry = {
                  id,
                  name: 'New Location',
                  region: '',
                  atmosphere: '',
                  notes: '',
                  customFields: [],
                };
                actions.mutateProject((prev) => upsertLocation(prev, entry), false);
              } else if (resolvedCategory === 'lore') {
                const entry: LoreEntry = {
                  id,
                  name: 'New Lore Entry',
                  category: 'Artifact',
                  summary: '',
                  notes: '',
                  customFields: [],
                };
                actions.mutateProject((prev) => upsertLore(prev, entry), false);
              } else {
                const entry: CustomBibleEntry = {
                  id,
                  categoryId: resolvedCategory,
                  name: 'New Entry',
                  subtitle: activeCustomCat?.name ?? 'Custom',
                  summary: '',
                  notes: '',
                  customFields: [],
                };
                actions.mutateProject((prev) => {
                  const next = normalizeProjectDefaults(prev);
                  next.bible.customEntries = [...(next.bible.customEntries ?? []), entry];
                  return next;
                }, false);
              }
              actions.setState({ activeBibleId: id }, true);
            },
          },
        },
        icon('plus', 12),
        'Add',
      ),
    ),
  );

  const listScroll = el('div', { className: 'bv-binder-scroll' });
  const entries =
    resolvedCategory === 'characters'
      ? project.bible.characters.map((c) => ({ id: c.id, name: c.name, sub: c.role }))
      : resolvedCategory === 'locations'
        ? project.bible.locations.map((l) => ({ id: l.id, name: l.name, sub: l.region }))
        : resolvedCategory === 'lore'
          ? project.bible.lore.map((lr) => ({ id: lr.id, name: lr.name, sub: lr.category }))
          : customEntries
              .filter((e) => e.categoryId === resolvedCategory)
              .map((e) => ({ id: e.id, name: e.name, sub: e.subtitle }));

  const resolvedId = entries.find((e) => e.id === activeBibleId)?.id ?? entries[0]?.id ?? '';
  let dragFromIdx = -1;

  entries.forEach((item, idx) => {
    const hitCount = mentionsIndex.get(item.id)?.totalOccurrences ?? 0;
    const row = el(
      'div',
      {
        className: `bv-tree-row${item.id === resolvedId ? ' is-active' : ''}`,
        style: { padding: '8px 10px', marginBottom: '3px', cursor: 'pointer' },
        attrs: { draggable: true },
        on: {
          click: () => actions.setState({ activeBibleId: item.id }, true),
          dragstart: (e) => {
            dragFromIdx = idx;
            e.dataTransfer?.setData('text/plain', item.id);
          },
          dragover: (e) => {
            if (dragFromIdx < 0 || dragFromIdx === idx) return;
            e.preventDefault();
            row.classList.add('is-drop-target');
          },
          dragleave: () => row.classList.remove('is-drop-target'),
          drop: (e) => {
            e.preventDefault();
            row.classList.remove('is-drop-target');
            if (dragFromIdx < 0 || dragFromIdx === idx) return;
            const from = dragFromIdx;
            dragFromIdx = -1;
            actions.mutateProject((prev) => {
              const next = normalizeProjectDefaults(prev);
              if (resolvedCategory === 'characters') {
                next.bible.characters = reorderArray(next.bible.characters, from, idx);
              } else if (resolvedCategory === 'locations') {
                next.bible.locations = reorderArray(next.bible.locations, from, idx);
              } else if (resolvedCategory === 'lore') {
                next.bible.lore = reorderArray(next.bible.lore, from, idx);
              } else {
                const matching = (next.bible.customEntries ?? []).filter(
                  (ce) => ce.categoryId === resolvedCategory,
                );
                const others = (next.bible.customEntries ?? []).filter(
                  (ce) => ce.categoryId !== resolvedCategory,
                );
                next.bible.customEntries = [...others, ...reorderArray(matching, from, idx)];
              }
              return next;
            });
          },
        },
      },
      el(
        'div',
        { style: { minWidth: '0' } },
        el('div', { text: item.name, style: { fontWeight: '600' } }),
        el('div', { className: 'bv-label', text: item.sub || '—' }),
      ),
      el('span', { className: 'bv-mono-tag', text: `${hitCount}×` }),
    );
    listScroll.appendChild(row);
  });
  listPane.append(listHead, listScroll);

  const detailPane = el('div', { className: 'bv-bible-detail' });

  if (!resolvedId) {
    detailPane.appendChild(el('p', { className: 'bv-label', text: 'Add an entry to begin.' }));
  } else {
    renderBibleDetailForm(detailPane, actions, resolvedCategory, resolvedId, mentionsIndex);
  }

  layout.append(listPane, detailPane);
  container.append(toolbar, layout);
  restoreScroll();
}

function makeFieldInput(
  label: string,
  value: string,
  onSave: (val: string) => void,
  multiline = false,
): HTMLElement {
  const input = multiline
    ? el('textarea', {
        className: 'bv-textarea',
        attrs: { rows: 3 },
        on: { change: () => onSave((input as HTMLTextAreaElement).value) },
      })
    : el('input', {
        className: 'bv-input',
        attrs: { type: 'text', value },
        on: { change: () => onSave((input as HTMLInputElement).value) },
      });

  if (multiline) {
    (input as HTMLTextAreaElement).value = value;
  }

  return el('div', { className: 'bv-field' }, el('label', { className: 'bv-label', text: label }), input);
}

function renderCustomImageAndFields(
  detailPane: HTMLElement,
  actions: AppActions,
  imageDataUrl: string | undefined,
  fields: CustomBibleField[],
  onSaveImage: (url: string) => void,
  onSaveFields: (nextFields: CustomBibleField[]) => void,
): void {
  const fileInput = el('input', {
    attrs: { type: 'file', accept: 'image/png,image/jpeg,image/webp' },
    style: { display: 'none' },
    on: {
      change: async () => {
        const file = fileInput.files?.[0];
        if (!file) return;
        try {
          const dataUrl = await downscaleImageFileToDataUrl(file, 700);
          onSaveImage(dataUrl);
          actions.notify('Updated reference image');
        } catch (err) {
          actions.notify(err instanceof Error ? err.message : 'Image upload failed.');
        }
      },
    },
  });

  const dropBox = el(
    'div',
    {
      className: 'bv-bible-img-drop',
      on: {
        click: () => fileInput.click(),
        dragover: (e) => {
          e.preventDefault();
          dropBox.style.borderColor = 'var(--accent-ivory)';
        },
        dragleave: () => {
          dropBox.style.borderColor = 'var(--border-strong)';
        },
        drop: async (e) => {
          e.preventDefault();
          dropBox.style.borderColor = 'var(--border-strong)';
          const file = e.dataTransfer?.files?.[0];
          if (!file) return;
          try {
            const dataUrl = await downscaleImageFileToDataUrl(file, 700);
            onSaveImage(dataUrl);
            actions.notify('Attached reference image');
          } catch (err) {
            actions.notify(err instanceof Error ? err.message : 'Image drop failed.');
          }
        },
      },
    },
    imageDataUrl
      ? el('img', { className: 'bv-bible-img-thumb', attrs: { src: imageDataUrl, alt: 'Reference' } })
      : el('div', { className: 'bv-logo-mark' }, icon('image', 15)),
    el(
      'div',
      { style: { flex: '1' } },
      el('div', {
        text: imageDataUrl ? 'Reference Image Attached' : 'Drop or Click to Attach Portrait / Map Image',
        style: { fontWeight: '500', fontSize: '12.5px' },
      }),
      el('div', { className: 'bv-label', text: 'PNG, JPEG, or WebP stored locally inside .qv / .qvbible' }),
    ),
    imageDataUrl
      ? el('button', {
          className: 'bv-mini-btn',
          text: 'Clear',
          attrs: { type: 'button' },
          on: {
            click: (e) => {
              e.stopPropagation();
              onSaveImage('');
            },
          },
        })
      : null,
    fileInput,
  );

  const fieldsWrap = el(
    'div',
    { className: 'bv-field-group' },
    el(
      'div',
      { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
      el('span', { className: 'bv-panel-title', text: 'Custom Fields' }),
      el(
        'button',
        {
          className: 'bv-mini-btn',
          attrs: { type: 'button' },
          on: {
            click: () => {
              onSaveFields([...fields, { key: 'Attribute', value: '' }]);
            },
          },
        },
        icon('plus', 12),
        'Field',
      ),
    ),
  );

  fields.forEach((field, idx) => {
    const keyIn = el('input', {
      className: 'bv-input',
      attrs: { type: 'text', value: field.key, placeholder: 'Field label' },
      on: {
        change: () => {
          const copy = [...fields];
          copy[idx] = { ...copy[idx], key: keyIn.value };
          onSaveFields(copy);
        },
      },
    });
    const valIn = el('input', {
      className: 'bv-input',
      attrs: { type: 'text', value: field.value, placeholder: 'Value' },
      on: {
        change: () => {
          const copy = [...fields];
          copy[idx] = { ...copy[idx], value: valIn.value };
          onSaveFields(copy);
        },
      },
    });
    fieldsWrap.appendChild(
      el(
        'div',
        { style: { display: 'grid', gridTemplateColumns: '1fr 1.4fr auto', gap: '8px', alignItems: 'center' } },
        keyIn,
        valIn,
        el(
          'button',
          {
            className: 'bv-mini-btn',
            attrs: { type: 'button', title: 'Remove custom field' },
            on: {
              click: () => onSaveFields(fields.filter((_, i) => i !== idx)),
            },
          },
          icon('trash', 12),
        ),
      ),
    );
  });

  detailPane.append(dropBox, fieldsWrap);
}

function renderBibleDetailForm(
  detailPane: HTMLElement,
  actions: AppActions,
  category: BibleCategory,
  id: string,
  mentionsIndex: ReturnType<typeof indexBibleMentions>,
): void {
  const project = normalizeProjectDefaults(actions.getState().project);
  const match = mentionsIndex.get(id);

  if (category === 'characters') {
    const ch = project.bible.characters.find((c) => c.id === id);
    if (!ch) return;

    detailPane.append(
      el(
        'div',
        { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
        el('h2', { text: ch.name, style: { margin: '0' } }),
        el(
          'button',
          {
            className: 'bv-mini-btn',
            attrs: { type: 'button' },
            on: {
              click: () => {
                actions.mutateProject((prev) => {
                  const next = structuredClone(prev);
                  next.bible.characters = next.bible.characters.filter((c) => c.id !== id);
                  return next;
                });
              },
            },
          },
          icon('trash', 12),
          'Delete',
        ),
      ),
      makeFieldInput('Full Name', ch.name, (v) =>
        actions.mutateProject((p) => upsertCharacter(p, { ...ch, name: v })),
      ),
      makeFieldInput('Aliases / Nicknames (comma-separated for auto-linking)', ch.aliases, (v) =>
        actions.mutateProject((p) => upsertCharacter(p, { ...ch, aliases: v })),
      ),
      makeFieldInput('Role / Archetype', ch.role, (v) =>
        actions.mutateProject((p) => upsertCharacter(p, { ...ch, role: v })),
      ),
      makeFieldInput(
        'Core Motivation',
        ch.motivation,
        (v) => actions.mutateProject((p) => upsertCharacter(p, { ...ch, motivation: v }), true),
        true,
      ),
      makeFieldInput(
        'Physical Description',
        ch.appearance,
        (v) => actions.mutateProject((p) => upsertCharacter(p, { ...ch, appearance: v }), true),
        true,
      ),
      makeFieldInput(
        'Backstory & Notes',
        ch.notes,
        (v) => actions.mutateProject((p) => upsertCharacter(p, { ...ch, notes: v }), true),
        true,
      ),
    );
    renderCustomImageAndFields(
      detailPane,
      actions,
      ch.imageDataUrl,
      ch.customFields ?? [],
      (url) => actions.mutateProject((p) => upsertCharacter(p, { ...ch, imageDataUrl: url })),
      (fields) => actions.mutateProject((p) => upsertCharacter(p, { ...ch, customFields: fields })),
    );
  } else if (category === 'locations') {
    const loc = project.bible.locations.find((l) => l.id === id);
    if (!loc) return;

    detailPane.append(
      el(
        'div',
        { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
        el('h2', { text: loc.name, style: { margin: '0' } }),
        el(
          'button',
          {
            className: 'bv-mini-btn',
            attrs: { type: 'button' },
            on: {
              click: () => {
                actions.mutateProject((prev) => {
                  const next = structuredClone(prev);
                  next.bible.locations = next.bible.locations.filter((l) => l.id !== id);
                  return next;
                });
              },
            },
          },
          icon('trash', 12),
          'Delete',
        ),
      ),
      makeFieldInput('Location Name', loc.name, (v) =>
        actions.mutateProject((p) => upsertLocation(p, { ...loc, name: v })),
      ),
      makeFieldInput('Region / World Zone', loc.region, (v) =>
        actions.mutateProject((p) => upsertLocation(p, { ...loc, region: v })),
      ),
      makeFieldInput(
        'Sensory Atmosphere',
        loc.atmosphere,
        (v) => actions.mutateProject((p) => upsertLocation(p, { ...loc, atmosphere: v }), true),
        true,
      ),
      makeFieldInput(
        'Continuity Notes',
        loc.notes,
        (v) => actions.mutateProject((p) => upsertLocation(p, { ...loc, notes: v }), true),
        true,
      ),
    );
    renderCustomImageAndFields(
      detailPane,
      actions,
      loc.imageDataUrl,
      loc.customFields ?? [],
      (url) => actions.mutateProject((p) => upsertLocation(p, { ...loc, imageDataUrl: url })),
      (fields) => actions.mutateProject((p) => upsertLocation(p, { ...loc, customFields: fields })),
    );
  } else if (category === 'lore') {
    const lore = project.bible.lore.find((lr) => lr.id === id);
    if (!lore) return;

    detailPane.append(
      el(
        'div',
        { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
        el('h2', { text: lore.name, style: { margin: '0' } }),
        el(
          'button',
          {
            className: 'bv-mini-btn',
            attrs: { type: 'button' },
            on: {
              click: () => {
                actions.mutateProject((prev) => {
                  const next = structuredClone(prev);
                  next.bible.lore = next.bible.lore.filter((lr) => lr.id !== id);
                  return next;
                });
              },
            },
          },
          icon('trash', 12),
          'Delete',
        ),
      ),
      makeFieldInput('Entry Title', lore.name, (v) =>
        actions.mutateProject((p) => upsertLore(p, { ...lore, name: v })),
      ),
      makeFieldInput('Category', lore.category, (v) =>
        actions.mutateProject((p) => upsertLore(p, { ...lore, category: v })),
      ),
      makeFieldInput(
        'Summary',
        lore.summary,
        (v) => actions.mutateProject((p) => upsertLore(p, { ...lore, summary: v }), true),
        true,
      ),
      makeFieldInput(
        'Historical & Rules Notes',
        lore.notes,
        (v) => actions.mutateProject((p) => upsertLore(p, { ...lore, notes: v }), true),
        true,
      ),
    );
    renderCustomImageAndFields(
      detailPane,
      actions,
      lore.imageDataUrl,
      lore.customFields ?? [],
      (url) => actions.mutateProject((p) => upsertLore(p, { ...lore, imageDataUrl: url })),
      (fields) => actions.mutateProject((p) => upsertLore(p, { ...lore, customFields: fields })),
    );
  } else {
    const entry = (project.bible.customEntries ?? []).find((ce) => ce.id === id);
    if (!entry) return;

    const saveCustom = (patch: Partial<CustomBibleEntry>) => {
      actions.mutateProject((prev) => {
        const next = normalizeProjectDefaults(prev);
        next.bible.customEntries = (next.bible.customEntries ?? []).map((ce) =>
          ce.id === id ? { ...ce, ...patch } : ce,
        );
        return next;
      });
    };

    detailPane.append(
      el(
        'div',
        { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
        el('h2', { text: entry.name, style: { margin: '0' } }),
        el(
          'button',
          {
            className: 'bv-mini-btn',
            attrs: { type: 'button' },
            on: {
              click: () => {
                actions.mutateProject((prev) => {
                  const next = normalizeProjectDefaults(prev);
                  next.bible.customEntries = (next.bible.customEntries ?? []).filter(
                    (ce) => ce.id !== id,
                  );
                  return next;
                });
              },
            },
          },
          icon('trash', 12),
          'Delete',
        ),
      ),
      makeFieldInput('Entry Name', entry.name, (v) => saveCustom({ name: v })),
      makeFieldInput('Subtitle / Tag', entry.subtitle, (v) => saveCustom({ subtitle: v })),
      makeFieldInput('Summary', entry.summary, (v) => saveCustom({ summary: v }), true),
      makeFieldInput('Notes', entry.notes, (v) => saveCustom({ notes: v }), true),
    );
    renderCustomImageAndFields(
      detailPane,
      actions,
      entry.imageDataUrl,
      entry.customFields ?? [],
      (url) => saveCustom({ imageDataUrl: url }),
      (fields) => saveCustom({ customFields: fields }),
    );
  }

  // Scene Backlinks Ledger
  const backlinksWrap = el('div', { className: 'bv-field-group' });
  backlinksWrap.appendChild(
    el('span', {
      className: 'bv-panel-title',
      text: `Scene Appearances (${match?.appearances.length ?? 0} ${(match?.appearances.length ?? 0) === 1 ? 'scene' : 'scenes'}, ${match?.totalOccurrences ?? 0} ${(match?.totalOccurrences ?? 0) === 1 ? 'mention' : 'mentions'})`,
    }),
  );

  if (!match || match.appearances.length === 0) {
    backlinksWrap.appendChild(
      el('p', { className: 'bv-label', text: 'Not yet mentioned in manuscript scenes.' }),
    );
  } else {
    for (const app of match.appearances) {
      backlinksWrap.appendChild(
        el(
          'div',
          {
            className: 'bv-list-card',
            style: { cursor: 'pointer' },
            on: { click: () => actions.selectScene(app.sceneId, true) },
          },
          el(
            'div',
            {},
            el('div', { text: app.sceneTitle, style: { fontWeight: '600' } }),
            el('div', { className: 'bv-label', text: app.chapterTitle }),
          ),
          el('span', { className: 'bv-mono-tag', text: `${app.occurrences}×` }),
        ),
      );
    }
  }
  detailPane.appendChild(backlinksWrap);
}
