import type { AppActions, TypesetSubTab } from '../core/app-context';
import { COLLABORATOR_ROLE_LABELS, getActiveSessionPermissions } from '../core/collab';
import {
  TRIM_SPECS,
  applySmartTypography,
  computeBookPagination,
} from '../core/export';
import { getAllAvailableFontChoices, resolveEffectiveFontCss } from '../core/fonts';
import { QUILLVIBE_EXTENSIONS } from '../core/extensions';
import {
  checkBookOriginDevice,
  ensureAuthorIdentity,
  generateAuthorKeyPair,
  sealWorkCopyright,
  signManuscript,
} from '../core/identity';
import { normalizeProjectDefaults } from '../core/library';
import { getAllScenes, getProjectWordCount } from '../core/manuscript';
import type {
  BookPublishingMeta,
  ChapterNumeralStyle,
  FontFamilyId,
  QuillvibeExtension,
  TrimSize,
  TypographyConfig,
} from '../core/types';
import { clearNode, el, icon } from '../ui/dom';
import { LiquidGlassControl } from '../ui/liquid-glass';
import { TOOLTIP_CATALOG } from '../ui/tooltips-catalog';
import { renderCoverStudio } from './cover';

let activeTypesetGlass: LiquidGlassControl<TypesetSubTab> | null = null;
let savedControlsScrollTop = 0;
let savedStageScrollTop = 0;

function updateTypography(actions: AppActions, patch: Partial<TypographyConfig>): void {
  const ctrl = document.querySelector('.bv-typeset-controls') as HTMLElement | null;
  const stage = document.querySelector('.bv-typeset-preview-stage') as HTMLElement | null;
  if (ctrl) savedControlsScrollTop = ctrl.scrollTop;
  if (stage) savedStageScrollTop = stage.scrollTop;
  actions.mutateProject((prev) => ({
    ...prev,
    typography: { ...prev.typography, ...patch },
  }));
}

function appendInlineStyledText(target: HTMLElement, text: string): void {
  const regex = /(\*\*[^*\n]+\*\*|\*[^*\n]+\*)/g;
  let lastIdx = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIdx) {
      target.appendChild(document.createTextNode(text.slice(lastIdx, match.index)));
    }
    const token = match[0];
    if (token.startsWith('**')) {
      target.appendChild(el('strong', { text: token.slice(2, -2) }));
    } else {
      target.appendChild(el('em', { text: token.slice(1, -1) }));
    }
    lastIdx = regex.lastIndex;
  }
  if (lastIdx < text.length) {
    target.appendChild(document.createTextNode(text.slice(lastIdx)));
  }
}

export function renderTypesetView(container: HTMLElement, rawActions: AppActions): void {
  const prevCtrl = container.querySelector('.bv-typeset-controls') as HTMLElement | null;
  const prevStage = container.querySelector('.bv-typeset-preview-stage') as HTMLElement | null;
  if (prevCtrl) savedControlsScrollTop = prevCtrl.scrollTop;
  if (prevStage) savedStageScrollTop = prevStage.scrollTop;

  if (activeTypesetGlass) {
    activeTypesetGlass.destroy();
    activeTypesetGlass = null;
  }
  clearNode(container);

  const typesetPerms = getActiveSessionPermissions(rawActions.getState().project);
  const actions: AppActions = typesetPerms.canEditCoverAndTypeset
    ? rawActions
    : {
        ...rawActions,
        mutateProject: () => {
          rawActions.notify('Typeset & Publishing settings are disabled for your collaborator role.');
        },
      };

  const state = actions.getState();
  const subSwitcher = new LiquidGlassControl<TypesetSubTab>({
    ariaLabel: 'Publishing mode',
    surface: 'solid',
    compact: true,
    iconOnly: true,
    value: state.typesetSubTab,
    options: [
      { id: 'interior', label: 'Interior Typeset', icon: 'page-margins', tooltip: TOOLTIP_CATALOG.typesetInterior },
      { id: 'cover', label: 'Book Cover Studio', icon: 'cover', tooltip: TOOLTIP_CATALOG.typesetCover },
      { id: 'publish', label: 'Publish & Author Key', icon: 'seal', tooltip: TOOLTIP_CATALOG.typesetPublish },
    ],
    onChange: (tab) => actions.setState({ typesetSubTab: tab }, true),
  });
  activeTypesetGlass = subSwitcher;

  const subbar = el(
    'div',
    { className: 'bv-subbar' },
    subSwitcher.element,
    el(
      'div',
      { className: 'bv-subbar-group' },
      el(
        'button',
        {
          className: 'bv-btn bv-btn-primary',
          attrs: { type: 'button' },
          on: { click: () => void actions.exportEpub() },
        },
        icon('download', 14),
        'Export EPUB 3',
      ),
      el(
        'button',
        {
          className: 'bv-btn',
          attrs: { type: 'button' },
          on: { click: () => void actions.exportPdf() },
        },
        icon('download', 14),
        'Export PDF',
      ),
      el(
        'button',
        {
          className: 'bv-btn',
          attrs: { type: 'button' },
          on: { click: () => actions.printTypeset() },
        },
        icon('printer', 14),
        'Print PDF',
      ),
    ),
  );

  const bodyContainer = el('div', {
    style: { flex: '1', minHeight: '0', minWidth: '0', maxWidth: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' },
  });
  container.append(subbar, bodyContainer);

  if (state.typesetSubTab === 'cover') {
    renderCoverStudio(bodyContainer, actions);
    return;
  }

  if (state.typesetSubTab === 'publish') {
    renderPublishReadinessTab(bodyContainer, actions);
    return;
  }

  renderInteriorTypeset(bodyContainer, actions);
}

function renderInteriorTypeset(container: HTMLElement, actions: AppActions): void {
  const project = normalizeProjectDefaults(actions.getState().project);
  const identity = ensureAuthorIdentity(project);
  const penName = identity.penName || project.author;
  const typo = project.typography;

  const controls = el('aside', { className: 'bv-typeset-controls' });

  const titleIn = el('input', {
    className: 'bv-input',
    attrs: { type: 'text', value: project.title },
    on: { change: () => actions.mutateProject((p) => ({ ...p, title: titleIn.value })) },
  });
  const subIn = el('input', {
    className: 'bv-input',
    attrs: { type: 'text', value: project.subtitle },
    on: { change: () => actions.mutateProject((p) => ({ ...p, subtitle: subIn.value })) },
  });
  const authorIn = el('input', {
    className: 'bv-input',
    attrs: { type: 'text', value: penName },
    on: {
      change: () =>
        actions.mutateProject((p) => {
          const next = normalizeProjectDefaults(p);
          next.author = authorIn.value;
          next.authorIdentity!.penName = authorIn.value;
          return next;
        }),
    },
  });

  const trimSelect = el('select', {
    className: 'bv-input',
    on: { change: () => updateTypography(actions, { trimSize: trimSelect.value as TrimSize }) },
  });
  for (const spec of Object.values(TRIM_SPECS)) {
    trimSelect.appendChild(
      el('option', { text: spec.label, attrs: { value: spec.id, selected: typo.trimSize === spec.id } }),
    );
  }

  const fontChoices = getAllAvailableFontChoices();
  const activeFontVal = typo.customFontFamily?.trim()
    ? typo.customFontFamily.trim()
    : `builtin:${typo.fontFamily}`;

  const fontSelect = el('select', {
    className: 'bv-input',
    on: {
      change: () => {
        const val = fontSelect.value;
        if (val.startsWith('builtin:')) {
          updateTypography(actions, {
            fontFamily: val.slice('builtin:'.length) as FontFamilyId,
            customFontFamily: '',
          });
        } else {
          updateTypography(actions, { customFontFamily: val });
        }
      },
    },
  });
  for (const choice of fontChoices) {
    fontSelect.appendChild(
      el('option', { text: choice.label, attrs: { value: choice.id, selected: activeFontVal === choice.id } }),
    );
  }

  const numeralSelect = el('select', {
    className: 'bv-input',
    on: {
      change: () =>
        updateTypography(actions, {
          chapterNumeralStyle: numeralSelect.value as ChapterNumeralStyle,
        }),
    },
  });
  for (const [val, label] of [
    ['roman', 'Roman (Chapter I, II)'],
    ['word', 'Spelled (Chapter One, Two)'],
    ['numeric', 'Numeric (Chapter 1, 2)'],
  ] as const) {
    numeralSelect.appendChild(
      el('option', { text: label, attrs: { value: val, selected: typo.chapterNumeralStyle === val } }),
    );
  }

  const dropCapsToggle = el('input', {
    className: 'bv-lever',
    attrs: { type: 'checkbox', role: 'switch', checked: typo.dropCaps },
    on: { change: () => updateTypography(actions, { dropCaps: dropCapsToggle.checked }) },
  });
  const smartTypeToggle = el('input', {
    className: 'bv-lever',
    attrs: { type: 'checkbox', role: 'switch', checked: typo.smartTypography },
    on: { change: () => updateTypography(actions, { smartTypography: smartTypeToggle.checked }) },
  });
  const headerToggle = el('input', {
    className: 'bv-lever',
    attrs: { type: 'checkbox', role: 'switch', checked: typo.runningHeader },
    on: { change: () => updateTypography(actions, { runningHeader: headerToggle.checked }) },
  });
  const frontMatterToggle = el('input', {
    className: 'bv-lever',
    attrs: { type: 'checkbox', role: 'switch', checked: typo.includeFrontMatter !== false },
    on: { change: () => updateTypography(actions, { includeFrontMatter: frontMatterToggle.checked }) },
  });
  const tocToggle = el('input', {
    className: 'bv-lever',
    attrs: { type: 'checkbox', role: 'switch', checked: typo.includeTableOfContents !== false },
    on: { change: () => updateTypography(actions, { includeTableOfContents: tocToggle.checked }) },
  });
  const pageNumsToggle = el('input', {
    className: 'bv-lever',
    attrs: { type: 'checkbox', role: 'switch', checked: typo.includePageNumbers !== false },
    on: { change: () => updateTypography(actions, { includePageNumbers: pageNumsToggle.checked }) },
  });

  let fontSizeLabelEl: HTMLElement | null = null;
  let lineHeightLabelEl: HTMLElement | null = null;

  const fontSizeInput = el('input', {
    attrs: { type: 'range', min: 9, max: 14, step: 0.5, value: typo.fontSizePt },
    on: {
      input: () => {
        const val = fontSizeInput.value;
        if (fontSizeLabelEl) fontSizeLabelEl.textContent = `Body Size (${val} pt)`;
        document.querySelectorAll<HTMLElement>('.bv-book-page').forEach((p) => {
          p.style.fontSize = `${val}pt`;
        });
      },
      change: () => updateTypography(actions, { fontSizePt: Number(fontSizeInput.value) }),
    },
  });

  const lineHeightInput = el('input', {
    attrs: { type: 'range', min: 1.3, max: 1.9, step: 0.05, value: typo.lineHeight },
    on: {
      input: () => {
        const val = lineHeightInput.value;
        if (lineHeightLabelEl) lineHeightLabelEl.textContent = `Line Spacing (${val})`;
        document.querySelectorAll<HTMLElement>('.bv-book-page').forEach((p) => {
          p.style.lineHeight = String(val);
        });
      },
      change: () => updateTypography(actions, { lineHeight: Number(lineHeightInput.value) }),
    },
  });

  const extGrid = el('div', {
    style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' },
  });
  for (const item of QUILLVIBE_EXTENSIONS) {
    extGrid.appendChild(
      el(
        'button',
        {
          className: 'bv-mini-btn',
          style: { justifyContent: 'center', padding: '6px' },
          tooltip: { title: `${item.name} (${item.extension})`, short: item.purpose },
          attrs: { type: 'button' },
          on: { click: () => void actions.exportAsExtension(item.extension as QuillvibeExtension) },
        },
        item.extension,
      ),
    );
  }

  controls.append(
    el(
      'div',
      { className: 'bv-field-group' },
      el('span', { className: 'bv-panel-title', text: 'Front Matter' }),
      el('div', { className: 'bv-field' }, el('label', { className: 'bv-label', text: 'Title' }), titleIn),
      el('div', { className: 'bv-field' }, el('label', { className: 'bv-label', text: 'Subtitle' }), subIn),
      el('div', { className: 'bv-field' }, el('label', { className: 'bv-label', text: 'Pen Name / Author' }), authorIn),
    ),
    el(
      'div',
      { className: 'bv-field-group' },
      el('span', { className: 'bv-panel-title', text: 'Book Interior Design' }),
      el('div', { className: 'bv-field' }, el('label', { className: 'bv-label', text: 'Trim Size' }), trimSelect),
      el(
        'div',
        { className: 'bv-field' },
        el('label', { className: 'bv-label', text: 'Typeface' }),
        fontSelect,
        el('button', {
          className: 'bv-mini-btn',
          text: 'Install Custom Fonts…',
          attrs: { type: 'button' },
          on: { click: () => actions.openSettingsModal('fonts') },
        }),
      ),
      el('div', { className: 'bv-field' }, el('label', { className: 'bv-label', text: 'Chapter Numerals' }), numeralSelect),
      el(
        'div',
        { className: 'bv-field' },
        (fontSizeLabelEl = el('label', { className: 'bv-label', text: `Body Size (${typo.fontSizePt} pt)` })),
        fontSizeInput,
      ),
      el(
        'div',
        { className: 'bv-field' },
        (lineHeightLabelEl = el('label', { className: 'bv-label', text: `Line Spacing (${typo.lineHeight})` })),
        lineHeightInput,
      ),
      el(
        'label',
        { style: { display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' } },
        dropCapsToggle,
        'First-Paragraph Drop Caps',
      ),
      el(
        'label',
        { style: { display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' } },
        smartTypeToggle,
        'Smart Curly Quotes & Em-Dashes',
      ),
      el(
        'label',
        { className: 'bv-check-row' },
        headerToggle,
        el('span', { text: 'Show Pen Name & Title Header on Chapters' }),
      ),
      el(
        'label',
        { className: 'bv-check-row' },
        tocToggle,
        el('span', { text: 'Include Table of Contents' }),
      ),
      el(
        'label',
        { className: 'bv-check-row' },
        pageNumsToggle,
        el('span', { text: 'Show Book Page Numbers' }),
      ),
      el(
        'label',
        { className: 'bv-check-row' },
        frontMatterToggle,
        el('span', { text: 'Include Title & Copyright Page' }),
      ),
    ),
    el(
      'div',
      { className: 'bv-field-group' },
      el('span', { className: 'bv-panel-title', text: 'Save Official Extension Format' }),
      extGrid,
      el('button', {
        className: 'bv-mini-btn',
        text: 'OS File Associations & Specs…',
        attrs: { type: 'button' },
        on: { click: () => actions.openExtensionsModal() },
      }),
    ),
  );

  const stage = el('div', { className: 'bv-typeset-preview-stage' });
  const trimSpec = TRIM_SPECS[typo.trimSize] ?? TRIM_SPECS['6x9'];
  const fontCss = resolveEffectiveFontCss(typo.fontFamily, typo.customFontFamily);
  const pageWidthPx = Math.round(trimSpec.widthIn * 92);
  const pageMinHeightPx = Math.round(trimSpec.heightIn * 92);
  const showPageNums = typo.includePageNumbers !== false;
  const paginated = computeBookPagination(project);

  for (const sheet of paginated.pages) {
    if (sheet.kind === 'front-matter') {
      const creditsRows = (project.collaborators ?? []).map((c) =>
        el('p', {
          text: `${COLLABORATOR_ROLE_LABELS[c.role]}: ${c.creditLine}`,
          style: { margin: '2px 0', fontSize: '10.5px', color: '#615d54' },
        }),
      );

      const titlePage = el(
        'article',
        {
          className: 'bv-book-page',
          style: {
            maxWidth: `min(100%, ${pageWidthPx}px)`,
            fontFamily: fontCss,
            textAlign: 'center',
            minHeight: `${pageMinHeightPx}px`,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          },
        },
        el(
          'div',
          { style: { marginTop: '72px' } },
          el('h1', {
            text: typo.smartTypography ? applySmartTypography(project.title) : project.title,
            style: { fontSize: '30px', fontWeight: '500', margin: '0 0 8px' },
          }),
          el('p', {
            text: typo.smartTypography ? applySmartTypography(project.subtitle) : project.subtitle,
            style: { fontStyle: 'italic', color: '#4d4940', margin: '0 0 36px', fontSize: '15px' },
          }),
          el('p', {
            text: penName,
            style: { letterSpacing: '0.16em', textTransform: 'uppercase', fontSize: '12px' },
          }),
          identity.signatureSvgDataUrl
            ? el('img', {
                attrs: { src: identity.signatureSvgDataUrl, alt: 'Signature' },
                style: { height: '32px', marginTop: '14px', filter: 'invert(1)' },
              })
            : identity.signatureText &&
                identity.signatureText.trim().toLowerCase() !== penName.trim().toLowerCase()
              ? el('p', {
                  text: identity.signatureText,
                  style: { fontStyle: 'italic', color: '#5c5850', marginTop: '12px' },
                })
              : null,
        ),
        el(
          'div',
          { style: { fontSize: '11px', color: '#615d54' } },
          project.dedication ? el('p', { text: project.dedication, style: { fontStyle: 'italic' } }) : null,
          el('p', { text: project.copyrightNotice }),
          ...creditsRows,
          identity.authorKeyId
            ? el('p', {
                text: `Author Key ${identity.authorKeyId}${identity.manuscriptDigest ? ` | Seal ${identity.manuscriptDigest.slice(0, 12)}…` : ''}`,
                style: { fontSize: '9.5px', letterSpacing: '0.06em', opacity: '0.8' },
              })
            : null,
          showPageNums ? el('div', { className: 'bv-book-page-footer', text: String(sheet.pageNumber) }) : null,
        ),
      );
      stage.appendChild(titlePage);
      continue;
    }

    if (sheet.kind === 'toc') {
      const tocList = el('div', { className: 'bv-book-toc-list' });
      for (const entry of paginated.tocEntries) {
        const sameLabel =
          entry.chapterTitle.trim().toLowerCase() === entry.chapterLabel.trim().toLowerCase();
        tocList.appendChild(
          el(
            'div',
            { className: 'bv-book-toc-row' },
            el('span', {
              text: sameLabel ? entry.chapterTitle : `${entry.chapterLabel} — ${entry.chapterTitle}`,
            }),
            el('span', { className: 'bv-book-toc-dots' }),
            el('span', { text: String(entry.pageNumber), style: { fontVariantNumeric: 'tabular-nums' } }),
          ),
        );
      }

      const tocPage = el(
        'article',
        {
          className: 'bv-book-page',
          style: {
            maxWidth: `min(100%, ${pageWidthPx}px)`,
            minHeight: `${pageMinHeightPx}px`,
            fontFamily: fontCss,
            fontSize: `${typo.fontSizePt}pt`,
            lineHeight: String(typo.lineHeight),
            padding: `${Math.round(typo.marginInches * 42)}px clamp(18px, 4vw, ${Math.round(typo.marginInches * 54)}px)`,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          },
        },
        el(
          'div',
          {},
          el('div', {
            text: 'Contents',
            style: { textAlign: 'center', fontSize: '10.5px', letterSpacing: '0.18em', textTransform: 'uppercase', color: '#5c5850', marginBottom: '6px' },
          }),
          el('h2', {
            text: 'Table of Contents',
            style: { textAlign: 'center', fontWeight: '500', fontSize: '23px', margin: '0 0 24px' },
          }),
          tocList,
        ),
        showPageNums ? el('div', { className: 'bv-book-page-footer', text: String(sheet.pageNumber) }) : el('div'),
      );
      stage.appendChild(tocPage);
      continue;
    }

    const page = el('article', {
      className: 'bv-book-page',
      style: {
        maxWidth: `min(100%, ${pageWidthPx}px)`,
        minHeight: `${pageMinHeightPx}px`,
        fontFamily: fontCss,
        fontSize: `${typo.fontSizePt}pt`,
        lineHeight: String(typo.lineHeight),
        padding: `${Math.round(typo.marginInches * 42)}px clamp(18px, 4vw, ${Math.round(typo.marginInches * 54)}px)`,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
      },
    });

    const contentWrap = el('div');

    if (typo.runningHeader) {
      contentWrap.appendChild(
        el(
          'div',
          { className: 'bv-book-page-running' },
          el('span', { text: penName }),
          el('span', { text: project.title }),
        ),
      );
    }

    if (sheet.isChapterStart) {
      contentWrap.append(
        el('div', {
          text: sheet.chapterLabel ?? '',
          style: {
            textAlign: 'center',
            fontSize: '10.5px',
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: '#5c5850',
            marginBottom: '6px',
          },
        }),
        el('h2', {
          text: sheet.chapterTitle ?? '',
          style: { textAlign: 'center', fontWeight: '500', fontSize: '23px', margin: '0 0 24px' },
        }),
      );
    }

    for (const blk of sheet.blocks) {
      if (blk.kind === 'scene-break') {
        contentWrap.appendChild(
          el('p', {
            text: '* * *',
            style: { textAlign: 'center', letterSpacing: '0.35em', margin: '18px 0', color: '#5c5850' },
          }),
        );
        continue;
      }
      if (blk.kind === 'blockquote') {
        const bq = el('blockquote', {
          style: { fontStyle: 'italic', margin: '14px 24px', color: '#3b3832' },
        });
        appendInlineStyledText(bq, blk.text);
        contentWrap.appendChild(bq);
        continue;
      }
      const p = el('p', {
        className: blk.dropCap ? 'bv-book-dropcap' : '',
        style: {
          margin: '0 0 6px',
          textIndent: blk.indent ? '1.4em' : '0',
          textAlign: 'justify',
        },
      });
      appendInlineStyledText(p, blk.text);
      contentWrap.appendChild(p);
    }

    page.append(
      contentWrap,
      showPageNums ? el('div', { className: 'bv-book-page-footer', text: String(sheet.pageNumber) }) : el('div'),
    );
    stage.appendChild(page);
  }

  const layout = el('div', { className: 'bv-typeset-layout' }, controls, stage);
  container.appendChild(layout);

  controls.scrollTop = savedControlsScrollTop;
  stage.scrollTop = savedStageScrollTop;
  requestAnimationFrame(() => {
    controls.scrollTop = savedControlsScrollTop;
    stage.scrollTop = savedStageScrollTop;
  });
}

function renderPublishReadinessTab(container: HTMLElement, actions: AppActions): void {
  const project = normalizeProjectDefaults(actions.getState().project);
  const identity = ensureAuthorIdentity(project);
  const scenes = getAllScenes(project);
  const openAnnotationsCount = scenes.reduce(
    (acc, item) => acc + (item.scene.annotations ?? []).filter((a) => a.status === 'open').length,
    0,
  );
  const openMarksCount = scenes.reduce(
    (acc, item) => acc + (item.scene.proofreadMarks ?? []).filter((m) => m.status === 'open').length,
    0,
  );
  const wordCount = getProjectWordCount(project);

  const pubMeta: Partial<BookPublishingMeta> = project.publishing ?? {};
  const isKeyLocked = Boolean(identity.authorKeyId);
  const originCheck = checkBookOriginDevice(project);
  const copyrightRec = project.copyrightOwnership;

  const checks = [
    {
      label: 'Book Title & Pen Name Configured',
      ok: Boolean(project.title.trim() && (identity.penName || project.author).trim()),
      detail: `${project.title} — ${identity.penName || project.author}`,
    },
    {
      label: 'Book Cover Ready',
      ok: Boolean(project.cover),
      detail: project.cover?.backgroundImageDataUrl
        ? 'Custom Cover Artwork + Typography'
        : `Template: ${project.cover?.template}`,
    },
    {
      label: 'Origin Author & Device Key',
      ok: Boolean(identity.authorKeyId && identity.manuscriptDigest),
      detail: identity.manuscriptDigest
        ? `${identity.authorKeyId} (${originCheck.isOriginDevice ? `Origin Device ${originCheck.originDeviceId}` : `Copy opened on ${originCheck.localDeviceId}`})`
        : 'Create Author Key & Sign to bind pen name + origin device',
    },
    {
      label: 'Work Copyright Ownership Seal',
      ok: Boolean(copyrightRec?.sealId),
      detail: copyrightRec?.sealId
        ? `${copyrightRec.sealId} | ${copyrightRec.ownerName} (${copyrightRec.rightsTerritory})`
        : 'Register copyright ownership seal inside book metadata',
    },
    {
      label: 'Commercial / Publisher Release Info',
      ok: Boolean(pubMeta.publisherCompany?.trim() || pubMeta.isbn?.trim() || pubMeta.rightsTerritory?.trim()),
      detail:
        pubMeta.publisherCompany?.trim() || pubMeta.isbn?.trim()
          ? `${pubMeta.publisherCompany || pubMeta.imprintName || 'Independent'} | ${pubMeta.rightsTerritory || 'World Rights'}`
          : 'Configure Publisher, ISBN & Rights in Settings -> Publishing & Archive',
    },
    {
      label: 'Proofread Marks & Notes Resolved',
      ok: openAnnotationsCount + openMarksCount === 0,
      detail:
        openAnnotationsCount + openMarksCount === 0
          ? '0 open marks or notes'
          : `${openMarksCount} open proofread mark(s), ${openAnnotationsCount} open note(s)`,
    },
    {
      label: 'Manuscript Content',
      ok: wordCount > 0,
      detail: `${wordCount.toLocaleString()} words across ${scenes.length} scenes`,
    },
  ];

  const penIn = el('input', {
    className: 'bv-input',
    attrs: { type: 'text', value: identity.penName, ...(isKeyLocked ? { readonly: '' } : {}) },
    on: {
      change: () => {
        if (isKeyLocked) return;
        actions.mutateProject((p) => {
          const next = normalizeProjectDefaults(p);
          next.author = penIn.value;
          next.authorIdentity!.penName = penIn.value;
          return next;
        });
      },
    },
  });

  const sigIn = el('input', {
    className: 'bv-input',
    attrs: { type: 'text', value: identity.signatureText },
    on: {
      change: () =>
        actions.mutateProject((p) => {
          const next = normalizeProjectDefaults(p);
          next.authorIdentity!.signatureText = sigIn.value;
          return next;
        }),
    },
  });

  const openPasswordExportPrompt = () => {
    const pwIn = el('input', {
      className: 'bv-input',
      attrs: { type: 'password', placeholder: 'Enter export password…', autocomplete: 'off' },
    });
    const close = () => bd.remove();
    const confirm = () => {
      const pw = pwIn.value;
      close();
      if (!pw.trim()) {
        actions.notify('Password cannot be empty.');
        return;
      }
      void actions.exportAsExtension('.qv', { password: pw });
    };
    const bd = el(
      'div',
      {
        className: 'bv-modal-backdrop',
        on: {
          click: (e) => {
            if (e.target === bd) close();
          },
        },
      },
      el(
        'div',
        { className: 'bv-modal', style: { maxWidth: '420px' }, attrs: { role: 'dialog', 'aria-modal': 'true' } },
        el(
          'div',
          { className: 'bv-panel-head' },
          el('span', { className: 'bv-panel-title', text: 'Set Password for Protected .qv' }),
          el('button', { className: 'bv-mini-btn', text: 'Cancel', attrs: { type: 'button' }, on: { click: close } }),
        ),
        el(
          'div',
          { className: 'bv-modal-body' },
          el('p', {
            className: 'bv-label',
            text: 'Only Quillvibe can open this exported file with this password. Modifying bytes externally damages the file permanently.',
          }),
          pwIn,
          el(
            'div',
            { style: { display: 'flex', justifyContent: 'flex-end', gap: '8px' } },
            el('button', { className: 'bv-btn', text: 'Cancel', attrs: { type: 'button' }, on: { click: close } }),
            el('button', {
              className: 'bv-btn bv-btn-primary',
              text: 'Export Password-Locked .qv',
              attrs: { type: 'button' },
              on: { click: confirm },
            }),
          ),
        ),
      ),
    );
    pwIn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        confirm();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        close();
      }
    });
    document.body.appendChild(bd);
    requestAnimationFrame(() => pwIn.focus());
  };

  const wrap = el(
    'div',
    { className: 'bv-scroll-view', style: { maxWidth: '920px', margin: '0 auto', width: '100%' } },
    el('h2', { text: 'Publish Readiness & Author Seal', style: { marginTop: '0' } }),
    el(
      'div',
      { className: 'bv-two-col' },
      el(
        'section',
        { className: 'bv-cork-card' },
        el('span', { className: 'bv-panel-title', text: 'Origin Author & Device Key' }),
        el('div', { className: 'bv-field' }, el('label', { className: 'bv-label', text: 'Pen Name' }), penIn),
        el('div', { className: 'bv-field' }, el('label', { className: 'bv-label', text: 'Signature Line' }), sigIn),
        el(
          'div',
          { style: { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' } },
          el('div', {
            className: 'bv-mono-tag',
            text: `Key: ${identity.authorKeyId || 'Not generated'} | Device: ${originCheck.originDeviceId || originCheck.localDeviceId}`,
          }),
          ...(isKeyLocked
            ? [el('span', { className: 'qv-key-locked-pill', text: originCheck.isOriginDevice ? 'Origin Device Match' : 'External Device Copy' })]
            : []),
        ),
        el('p', {
          className: 'bv-label',
          text: originCheck.summary,
        }),
        ...(copyrightRec
          ? [
              el('div', {
                className: 'bv-mono-tag',
                text: `Copyright Seal: ${copyrightRec.sealId} | ${copyrightRec.ownerName} | ${copyrightRec.copyrightNotice}`,
              }),
            ]
          : []),
        el(
          'div',
          { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
          ...(!isKeyLocked
            ? [
                el(
                  'button',
                  {
                    className: 'bv-btn',
                    attrs: { type: 'button' },
                    on: {
                      click: async () => {
                        const penName = penIn.value.trim() || 'Author';
                        const pair = await generateAuthorKeyPair(penName);
                        actions.mutateProject((prev) => {
                          const next = normalizeProjectDefaults(prev);
                          next.author = penName;
                          next.authorIdentity = { ...ensureAuthorIdentity(next), penName, ...pair };
                          return next;
                        });
                        actions.notify(`Bound permanent Author Key ${pair.authorKeyId} to ${penName}`);
                      },
                    },
                  },
                  icon('key', 14),
                  'Create Permanent Author Key',
                ),
              ]
            : []),
          el(
            'button',
            {
              className: 'bv-btn bv-btn-primary',
              attrs: { type: 'button' },
              on: {
                click: async () => {
                  const signed = await signManuscript(actions.getState().project);
                  actions.mutateProject(() => signed);
                  actions.notify('Manuscript signed and sealed');
                },
              },
            },
            icon('check', 14),
            'Sign & Seal Origin',
          ),
          el(
            'button',
            {
              className: 'bv-btn',
              attrs: { type: 'button' },
              on: {
                click: async () => {
                  const sealed = await sealWorkCopyright(actions.getState().project);
                  actions.mutateProject(() => sealed);
                  actions.notify(`Registered Copyright Ownership Seal ${sealed.copyrightOwnership?.sealId ?? ''}`);
                },
              },
            },
            icon('seal', 14),
            'Seal Work Copyright',
          ),
          el(
            'button',
            {
              className: 'bv-btn',
              attrs: { type: 'button' },
              on: { click: () => actions.openLibraryModal() },
            },
            'Draw Signature…',
          ),
        ),
      ),
      el(
        'section',
        { className: 'bv-cork-card' },
        el('span', { className: 'bv-panel-title', text: 'Ready-to-Publish Checklist' }),
        ...checks.map((item) =>
          el(
            'div',
            { className: 'bv-list-card' },
            el(
              'div',
              {},
              el('div', { text: item.label, style: { fontWeight: '600', fontSize: '12.5px' } }),
              el('div', { className: 'bv-label', text: item.detail }),
            ),
            el('span', {
              className: 'bv-mono-tag',
              text: item.ok ? 'READY' : 'REVIEW',
              style: { color: item.ok ? 'var(--accent-emerald)' : 'var(--accent-amber)' },
            }),
          ),
        ),
      ),
    ),
    el(
      'section',
      { className: 'bv-cork-card', style: { marginTop: '14px' } },
      el('span', { className: 'bv-panel-title', text: 'Export Release Bundle' }),
      el(
        'div',
        { style: { display: 'flex', gap: '10px', flexWrap: 'wrap' } },
        el(
          'button',
          {
            className: 'bv-btn bv-btn-primary',
            attrs: { type: 'button' },
            on: { click: () => void actions.exportEpub() },
          },
          icon('download', 14),
          'EPUB 3 (with Cover & Credits)',
        ),
        el(
          'button',
          {
            className: 'bv-btn',
            attrs: { type: 'button' },
            on: { click: () => void actions.exportPdf() },
          },
          icon('download', 14),
          'Export Interior PDF (.pdf)',
        ),
        el(
          'button',
          {
            className: 'bv-btn',
            attrs: { type: 'button' },
            on: { click: () => actions.printTypeset() },
          },
          icon('printer', 14),
          'Print Typeset Sheet',
        ),
        el(
          'button',
          {
            className: 'bv-btn',
            attrs: { type: 'button' },
            on: { click: () => void actions.exportCoverPng() },
          },
          icon('image', 14),
          'High-Res Cover PNG',
        ),
        el(
          'button',
          {
            className: 'bv-btn',
            attrs: { type: 'button' },
            on: { click: () => void actions.exportMarkdown() },
          },
          icon('file', 14),
          'Markdown Manuscript',
        ),
        el(
          'button',
          {
            className: 'bv-btn',
            attrs: { type: 'button' },
            on: { click: () => void actions.exportAsExtension('.qv') },
          },
          icon('save', 14),
          'Signed .qv Workspace',
        ),
        el(
          'button',
          {
            className: 'bv-btn',
            attrs: { type: 'button' },
            on: { click: openPasswordExportPrompt },
          },
          icon('key', 14),
          'Password-Locked .qv…',
        ),
      ),
    ),
  );

  container.appendChild(wrap);
}
