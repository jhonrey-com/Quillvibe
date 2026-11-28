import type { AppActions, AppState, EditorSubMode } from '../core/app-context';
import { isTauriRuntime } from '../core/bridge';
import { getActiveSessionPermissions } from '../core/collab';
import { getAllAvailableFontChoices } from '../core/fonts';
import {
  countWords,
  findSceneContext,
  getAllScenes,
  isSceneLocked,
  splitSceneAtOffset,
  toggleChapterLock,
  togglePartLock,
} from '../core/manuscript';
import { loadInstalledExtensions, runExtensionRulesOnScene } from '../core/plugins';
import {
  PROOFREAD_MARK_SPECS,
  PROOFREAD_TOOLBAR_ORDER,
  acceptAllProofreadMarks,
  acceptProofreadMark,
  addProofreadMark,
  computeCleanProofPreview,
  rejectAllProofreadMarks,
  rejectProofreadMark,
  resolveMarkRange,
  stetProofreadMark,
  updateProofreadMarkNote,
} from '../core/proofread';
import {
  renderMarkdownToRichElement,
  serializeRichElementToMarkdown,
} from '../core/rich-prose';
import { computeWordDiff, restoreSnapshotToScene } from '../core/snapshots';
import { isTierAtLeast } from '../core/settings';
import type { PaperTheme, ProofreadMark, ProofreadMarkKind } from '../core/types';
import { attachContextMenu, type ContextMenuGroup } from '../ui/context-menu';
import { clearNode, el, icon } from '../ui/dom';
import { createVerticalResizer } from '../ui/resizer';
import { addImageFilesToScene, renderSceneImageComposer } from '../ui/scene-image-composer';
import { TOOLTIP_CATALOG } from '../ui/tooltips-catalog';

const EDITOR_SPLIT_WIDTH_KEY = 'quillvibe.editorSplitWidthPx.v1';

function loadEditorSplitWidth(): number {
  if (typeof window === 'undefined' || !window.localStorage) return 360;
  try {
    const raw = Number(window.localStorage.getItem(EDITOR_SPLIT_WIDTH_KEY));
    if (Number.isFinite(raw) && raw >= 260 && raw <= 640) return Math.round(raw);
  } catch {
    // Ignore storage access errors
  }
  return 360;
}

function saveEditorSplitWidth(w: number): void {
  editorSplitWidthPx = Math.round(Math.max(260, Math.min(640, w)));
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(EDITOR_SPLIT_WIDTH_KEY, String(editorSplitWidthPx));
  } catch {
    // Ignore storage access errors
  }
}

let editorSplitWidthPx = loadEditorSplitWidth();
let proofreadLedgerFilter: 'open' | 'resolved' | 'all' = 'open';
let pendingComposer: {
  kind: ProofreadMarkKind;
  start: number;
  end: number;
  originalText: string;
} | null = null;

function wrapSelection(
  textarea: HTMLTextAreaElement,
  before: string,
  after: string,
  actions: AppActions,
): void {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const current = textarea.value;
  const selected = current.slice(start, end) || 'text';
  const nextValue = current.slice(0, start) + before + selected + after + current.slice(end);
  textarea.value = nextValue;
  textarea.focus();
  textarea.setSelectionRange(start + before.length, start + before.length + selected.length);
  actions.updateActiveSceneTextQuietly('content', nextValue);
}

function insertAtLineStart(textarea: HTMLTextAreaElement, prefix: string, actions: AppActions): void {
  const start = textarea.selectionStart;
  const current = textarea.value;
  const lineStart = current.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
  const nextValue = current.slice(0, lineStart) + prefix + current.slice(lineStart);
  textarea.value = nextValue;
  textarea.focus();
  textarea.setSelectionRange(start + prefix.length, start + prefix.length);
  actions.updateActiveSceneTextQuietly('content', nextValue);
}

function getSelectionRangeInRich(richEl: HTMLElement): Range | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  if (!richEl.contains(range.commonAncestorContainer)) return null;
  return range;
}

function setCaretAtEndOfNode(node: Node): void {
  const sel = window.getSelection();
  if (!sel) return;
  const range = document.createRange();
  range.selectNodeContents(node);
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
}

function findDirectRichBlock(richEl: HTMLElement, node: Node | null): HTMLElement | null {
  let cur: Node | null = node;
  while (cur && cur !== richEl) {
    if (cur.parentNode === richEl && cur.nodeType === Node.ELEMENT_NODE) {
      return cur as HTMLElement;
    }
    cur = cur.parentNode;
  }
  return null;
}

function applyRichInlineCommand(
  richEl: HTMLElement,
  command: 'bold' | 'italic' | 'underline' | 'strikeThrough' | 'removeFormat',
  fallbackTag: 'strong' | 'em' | 'u' | 's' | 'span',
  onSync: () => void,
): void {
  richEl.focus();
  if (!getSelectionRangeInRich(richEl)) {
    setCaretAtEndOfNode(richEl);
  }
  try {
    if (typeof document.execCommand === 'function' && document.execCommand(command, false)) {
      onSync();
      return;
    }
  } catch {
    // Fallback below if execCommand is unavailable
  }
  if (command === 'removeFormat') {
    onSync();
    return;
  }
  const range = getSelectionRangeInRich(richEl);
  if (!range) return;
  const wrapper = document.createElement(fallbackTag);
  if (range.collapsed) {
    wrapper.textContent = 'text';
    range.insertNode(wrapper);
  } else {
    wrapper.appendChild(range.extractContents());
    range.insertNode(wrapper);
  }
  setCaretAtEndOfNode(wrapper);
  onSync();
}

function setRichBlockElement(
  richEl: HTMLElement,
  tag: 'P' | 'H1' | 'H2' | 'H3' | 'BLOCKQUOTE',
  toggleIfSame: boolean,
  onSync: () => void,
): void {
  richEl.focus();
  let range = getSelectionRangeInRich(richEl);
  if (!range) {
    setCaretAtEndOfNode(richEl);
    range = getSelectionRangeInRich(richEl);
  }
  const block = findDirectRichBlock(richEl, range?.startContainer ?? null);
  const currentTag = block?.tagName.toUpperCase();
  const nextTag = toggleIfSame && currentTag === tag ? 'p' : tag.toLowerCase();

  if (block && (block.tagName.toUpperCase() === 'UL' || block.tagName.toUpperCase() === 'OL')) {
    const replacement = document.createElement(nextTag);
    const items = Array.from(block.children);
    items.forEach((li, idx) => {
      if (idx > 0) replacement.appendChild(document.createElement('br'));
      while (li.firstChild) replacement.appendChild(li.firstChild);
    });
    if (!replacement.hasChildNodes()) replacement.appendChild(document.createElement('br'));
    block.replaceWith(replacement);
    setCaretAtEndOfNode(replacement);
    onSync();
    return;
  }

  if (block) {
    const replacement = document.createElement(nextTag);
    while (block.firstChild) {
      replacement.appendChild(block.firstChild);
    }
    if (!replacement.hasChildNodes()) {
      replacement.appendChild(document.createElement('br'));
    }
    block.replaceWith(replacement);
    setCaretAtEndOfNode(replacement);
  } else {
    const replacement = document.createElement(nextTag);
    replacement.appendChild(document.createElement('br'));
    richEl.appendChild(replacement);
    setCaretAtEndOfNode(replacement);
  }
  onSync();
}

function toggleRichListElement(
  richEl: HTMLElement,
  listTag: 'UL' | 'OL',
  onSync: () => void,
): void {
  richEl.focus();
  let range = getSelectionRangeInRich(richEl);
  if (!range) {
    setCaretAtEndOfNode(richEl);
    range = getSelectionRangeInRich(richEl);
  }
  const cmd = listTag === 'OL' ? 'insertOrderedList' : 'insertUnorderedList';
  try {
    if (typeof document.execCommand === 'function' && document.execCommand(cmd, false)) {
      onSync();
      return;
    }
  } catch {
    // Fallback below
  }
  const block = findDirectRichBlock(richEl, range?.startContainer ?? null);
  const currentTag = block?.tagName.toUpperCase();
  if (block && currentTag === listTag) {
    setRichBlockElement(richEl, 'P', false, onSync);
    return;
  }
  const list = document.createElement(listTag.toLowerCase());
  const li = document.createElement('li');
  if (block) {
    while (block.firstChild) li.appendChild(block.firstChild);
    if (!li.hasChildNodes()) li.appendChild(document.createElement('br'));
    list.appendChild(li);
    block.replaceWith(list);
  } else {
    li.appendChild(document.createElement('br'));
    list.appendChild(li);
    richEl.appendChild(list);
  }
  setCaretAtEndOfNode(li);
  onSync();
}

function applyRichParagraphAlign(
  richEl: HTMLElement,
  align: 'left' | 'center' | 'right' | 'justify',
): void {
  richEl.focus();
  const range = getSelectionRangeInRich(richEl);
  const block = findDirectRichBlock(richEl, range?.startContainer ?? null);
  if (block) {
    block.style.textAlign = align === 'left' ? '' : align;
  } else {
    richEl.style.textAlign = align === 'left' ? '' : align;
  }
}

function toggleRichSectionBreak(richEl: HTMLElement, onSync: () => void): 'added' | 'removed' {
  richEl.focus();
  const range = getSelectionRangeInRich(richEl);
  const block = findDirectRichBlock(richEl, range?.startContainer ?? null);

  if (block && block.tagName.toUpperCase() === 'HR') {
    const next = block.nextElementSibling;
    block.remove();
    if (next) setCaretAtEndOfNode(next);
    onSync();
    return 'removed';
  }
  if (block?.previousElementSibling?.tagName.toUpperCase() === 'HR') {
    block.previousElementSibling.remove();
    onSync();
    return 'removed';
  }
  if (block?.nextElementSibling?.tagName.toUpperCase() === 'HR') {
    block.nextElementSibling.remove();
    onSync();
    return 'removed';
  }

  const hr = document.createElement('hr');
  hr.className = 'bv-scene-break';
  const nextPara = document.createElement('p');
  nextPara.appendChild(document.createElement('br'));

  if (block && block.parentNode === richEl) {
    block.after(hr, nextPara);
  } else {
    richEl.append(hr, nextPara);
  }
  setCaretAtEndOfNode(nextPara);
  onSync();
  return 'added';
}

function insertPlainTextAtRichCaret(richEl: HTMLElement, text: string, onSync: () => void): void {
  richEl.focus();
  const clean = text.replace(/\r\n/g, '\n');
  try {
    if (typeof document.execCommand === 'function' && document.execCommand('insertText', false, clean)) {
      onSync();
      return;
    }
  } catch {
    // Fallback to manual Range insertion
  }
  const range = getSelectionRangeInRich(richEl) ?? (() => {
    const r = document.createRange();
    r.selectNodeContents(richEl);
    r.collapse(false);
    return r;
  })();
  range.deleteContents();
  const txtNode = document.createTextNode(clean);
  range.insertNode(txtNode);
  range.setStartAfter(txtNode);
  range.collapse(true);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
  onSync();
}

function getRichMarkdownCursorOffset(richEl: HTMLElement): number {
  const range = getSelectionRangeInRich(richEl);
  if (!range) return serializeRichElementToMarkdown(richEl).length;
  const prefixRange = document.createRange();
  prefixRange.setStart(richEl, 0);
  prefixRange.setEnd(range.startContainer, range.startOffset);
  const scratch = document.createElement('div');
  scratch.appendChild(prefixRange.cloneContents());
  return serializeRichElementToMarkdown(scratch).length;
}

function openUnlockConfirmDialog(targetLabel: string, onConfirm: () => void): void {
  const existing = document.getElementById('qv-confirm-unlock-backdrop');
  existing?.remove();

  const close = () => backdrop.remove();

  const unlockBtn = el('button', {
    className: 'bv-btn bv-btn-primary',
    text: 'Unlock Section',
    attrs: { type: 'button' },
    on: {
      click: () => {
        close();
        onConfirm();
      },
    },
  });

  const cancelBtn = el('button', {
    className: 'bv-btn',
    text: 'Keep Locked',
    attrs: { type: 'button' },
    on: { click: close },
  });

  const dialog = el(
    'div',
    {
      className: 'qv-confirm-unlock-dialog',
      attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Confirm unlock chapter or part' },
      on: { click: (e) => e.stopPropagation() },
    },
    el(
      'div',
      { style: { display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent-amber)' } },
      icon('unlock', 16),
      el('strong', { text: 'Unlock Finalized Section?', style: { fontSize: '14px', color: 'var(--text-primary)' } }),
    ),
    el('p', {
      className: 'bv-label',
      text: `${targetLabel} is currently locked. Unlocking allows prose and title edits again.`,
      style: { margin: '4px 0 8px' },
    }),
    el('div', { style: { display: 'flex', justifyContent: 'flex-end', gap: '8px' } }, cancelBtn, unlockBtn),
  );

  const backdrop = el(
    'div',
    {
      className: 'qv-confirm-unlock-backdrop',
      id: 'qv-confirm-unlock-backdrop',
      on: {
        click: close,
        keydown: (e) => {
          if (e.key === 'Escape') close();
        },
      },
    },
    dialog,
  );

  document.body.appendChild(backdrop);
  unlockBtn.focus();
}

function resolveSelectionFromProofSheet(sheet: HTMLElement): { start: number; end: number } | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  if (!sheet.contains(range.commonAncestorContainer)) return null;

  const segments = Array.from(sheet.querySelectorAll<HTMLElement>('.bv-pr-text-seg'));
  if (segments.length === 0) return { start: 0, end: 0 };

  const findRawPoint = (container: Node, offset: number, isEnd: boolean): number | null => {
    const hostEl =
      container.nodeType === Node.ELEMENT_NODE
        ? (container as HTMLElement)
        : container.parentElement;
    const seg = hostEl?.closest<HTMLElement>('.bv-pr-text-seg');
    if (seg && seg.dataset.rawStart !== undefined) {
      const segStart = Number(seg.dataset.rawStart);
      if (container.nodeType === Node.TEXT_NODE) {
        return segStart + offset;
      }
      return isEnd ? Number(seg.dataset.rawEnd ?? segStart) : segStart;
    }

    for (const s of segments) {
      if (s.contains(container)) {
        const rawS = Number(s.dataset.rawStart ?? 0);
        return container.nodeType === Node.TEXT_NODE ? rawS + offset : rawS;
      }
    }
    return null;
  };

  let s = findRawPoint(range.startContainer, range.startOffset, false);
  let e = findRawPoint(range.endContainer, range.endOffset, true);

  if (s === null && e === null) return null;
  if (s === null) s = e!;
  if (e === null) e = s;
  return s <= e ? { start: s, end: e } : { start: e, end: s };
}

function activeReviewerInfo(actions: AppActions) {
  const project = actions.getState().project;
  const activeCollab = (project.collaborators ?? []).find(
    (c) => c.name === project.activeAuthorLabel || c.penName === project.activeAuthorLabel,
  );
  return {
    authorName:
      project.activeAuthorLabel ||
      project.authorIdentity?.penName ||
      project.author ||
      'Proofreader',
    role: activeCollab?.role ?? 'proofreader',
  };
}

export function renderEditorView(container: HTMLElement, actions: AppActions): void {
  clearNode(container);
  if (typeof document !== 'undefined') {
    document.documentElement.style.setProperty('--qv-split-w', `${editorSplitWidthPx}px`);
  }

  const state = actions.getState();
  const ctx = findSceneContext(state.project, state.activeSceneId);

  if (!ctx) {
    container.appendChild(
      el(
        'div',
        { className: 'bv-scroll-view' },
        el('p', { text: 'Select or add a scene from the Manuscript binder to begin writing.' }),
      ),
    );
    return;
  }

  const { part, chapter, scene } = ctx;
  const tier = state.settings.toolTier;
  const allowIntermediate = isTierAtLeast(tier, 'intermediate');
  const isProofMode = allowIntermediate && state.editorSubMode === 'proofread';
  const openProofCount = (scene.proofreadMarks ?? []).filter(
    (m) => m.status === 'open' || m.status === 'stet',
  ).length;

  const sessionPerms = getActiveSessionPermissions(state.project);
  const lockStatus = isSceneLocked(state.project, scene.id);
  const canEditThisScene = sessionPerms.canEditProse && !lockStatus.locked;
  const useRichFormatting = state.settings.enableRichFormatting;

  const ensureDraftEditable = (): boolean => {
    if (!sessionPerms.canEditProse) {
      actions.notify('Prose editing is locked for your collaborator role.');
      return false;
    }
    if (lockStatus.locked) {
      actions.notify(`Section locked (${lockStatus.reason}). Click the top lock seal to unlock.`);
      return false;
    }
    if (isProofMode || state.editorSubMode === 'diff') {
      actions.setState({ editorSubMode: 'draft' }, true);
      actions.notify('Switched to Draft mode for text editing.');
      return false;
    }
    return true;
  };

  const blockExt = state.settings.disableBrowserWritingExtensions;
  const spellcheckAttr = !blockExt && state.settings.enableSpellcheck ? 'true' : 'false';
  const autocorrectAttr = !blockExt && state.settings.enableSpellcheck ? 'on' : 'off';
  const extBlockAttrs = blockExt
    ? {
        'data-gramm': 'false',
        'data-gramm_editor': 'false',
        'data-enable-grammarly': 'false',
        'data-lt-active': 'false',
        'data-ms-editor': 'false',
      }
    : {};

  const proseTextarea = el('textarea', {
    className: `bv-prose-textarea${state.typewriterMode ? ' is-typewriter' : ''}`,
    attrs: {
      placeholder: 'Begin writing this scene…',
      spellcheck: spellcheckAttr,
      autocorrect: autocorrectAttr,
      'aria-label': 'Scene prose editor',
      ...extBlockAttrs,
      ...(canEditThisScene ? {} : { readonly: '' }),
    },
  });
  proseTextarea.readOnly = !canEditThisScene;
  proseTextarea.value = scene.content;

  const syncTextareaHeight = () => {
    if (useRichFormatting) return;
    proseTextarea.style.height = 'auto';
    proseTextarea.style.height = `${Math.max(460, proseTextarea.scrollHeight + 12)}px`;
  };

  const proseRich = el('div', {
    className: `bv-prose-rich${state.typewriterMode ? ' is-typewriter' : ''}${canEditThisScene ? '' : ' is-readonly'}`,
    attrs: {
      role: 'textbox',
      'aria-multiline': 'true',
      'aria-label': 'Scene rich prose editor',
      'data-placeholder': 'Begin writing this scene…',
      contenteditable: canEditThisScene ? 'true' : 'false',
      spellcheck: spellcheckAttr,
      autocorrect: autocorrectAttr,
      tabindex: '0',
      ...extBlockAttrs,
    },
  });

  if (useRichFormatting) {
    renderMarkdownToRichElement(proseRich, scene.content);
  }

  const syncRichToState = () => {
    if (!canEditThisScene) return;
    const nextMd = serializeRichElementToMarkdown(proseRich);
    actions.updateActiveSceneTextQuietly('content', nextMd);
  };

  const focusProseSurface = () => {
    if (useRichFormatting) {
      proseRich.focus();
    } else {
      proseTextarea.focus();
    }
  };

  const applyBoldFormat = () => {
    if (!ensureDraftEditable()) return;
    if (useRichFormatting) {
      applyRichInlineCommand(proseRich, 'bold', 'strong', syncRichToState);
    } else {
      wrapSelection(proseTextarea, '**', '**', actions);
      syncTextareaHeight();
    }
  };

  const applyItalicFormat = () => {
    if (!ensureDraftEditable()) return;
    if (useRichFormatting) {
      applyRichInlineCommand(proseRich, 'italic', 'em', syncRichToState);
    } else {
      wrapSelection(proseTextarea, '*', '*', actions);
      syncTextareaHeight();
    }
  };

  const applyUnderlineFormat = () => {
    if (!ensureDraftEditable()) return;
    if (useRichFormatting) {
      applyRichInlineCommand(proseRich, 'underline', 'u', syncRichToState);
    } else {
      wrapSelection(proseTextarea, '<u>', '</u>', actions);
      syncTextareaHeight();
    }
  };

  const applyStrikeFormat = () => {
    if (!ensureDraftEditable()) return;
    if (useRichFormatting) {
      applyRichInlineCommand(proseRich, 'strikeThrough', 's', syncRichToState);
    } else {
      wrapSelection(proseTextarea, '~~', '~~', actions);
      syncTextareaHeight();
    }
  };

  const applyClearFormat = () => {
    if (!ensureDraftEditable()) return;
    if (useRichFormatting) {
      applyRichInlineCommand(proseRich, 'removeFormat', 'span', syncRichToState);
    } else {
      const s = proseTextarea.selectionStart;
      const e = proseTextarea.selectionEnd;
      if (e <= s) return;
      const cleaned = proseTextarea.value
        .slice(s, e)
        .replace(/(\*\*\*|\*\*|\*|~~|<\/?u>)/g, '');
      const next = proseTextarea.value.slice(0, s) + cleaned + proseTextarea.value.slice(e);
      proseTextarea.value = next;
      proseTextarea.setSelectionRange(s, s + cleaned.length);
      syncTextareaHeight();
      actions.updateActiveSceneTextQuietly('content', next);
    }
  };

  const applyParagraphStyle = (styleId: 'p' | 'h1' | 'h2' | 'h3' | 'blockquote') => {
    if (!ensureDraftEditable()) return;
    if (useRichFormatting) {
      const map: Record<typeof styleId, 'P' | 'H1' | 'H2' | 'H3' | 'BLOCKQUOTE'> = {
        p: 'P',
        h1: 'H1',
        h2: 'H2',
        h3: 'H3',
        blockquote: 'BLOCKQUOTE',
      };
      setRichBlockElement(proseRich, map[styleId], false, syncRichToState);
    } else {
      const start = proseTextarea.selectionStart;
      const current = proseTextarea.value;
      const lineStart = current.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
      const lineEndIdx = current.indexOf('\n', lineStart);
      const lineEnd = lineEndIdx === -1 ? current.length : lineEndIdx;
      const rawLine = current.slice(lineStart, lineEnd);
      const stripped = rawLine.replace(/^(#{1,3}\s+|>\s?|[-*]\s+|\d+\.\s+)/, '');
      const prefix =
        styleId === 'h1'
          ? '# '
          : styleId === 'h2'
            ? '## '
            : styleId === 'h3'
              ? '### '
              : styleId === 'blockquote'
                ? '> '
                : '';
      const nextValue = current.slice(0, lineStart) + prefix + stripped + current.slice(lineEnd);
      proseTextarea.value = nextValue;
      proseTextarea.focus();
      const caret = lineStart + prefix.length + stripped.length;
      proseTextarea.setSelectionRange(caret, caret);
      syncTextareaHeight();
      actions.updateActiveSceneTextQuietly('content', nextValue);
    }
  };

  const applyHeadingFormat = () => {
    if (!ensureDraftEditable()) return;
    if (useRichFormatting) {
      setRichBlockElement(proseRich, 'H2', true, syncRichToState);
    } else {
      insertAtLineStart(proseTextarea, '## ', actions);
      syncTextareaHeight();
    }
  };

  const applyQuoteFormat = () => {
    if (!ensureDraftEditable()) return;
    if (useRichFormatting) {
      setRichBlockElement(proseRich, 'BLOCKQUOTE', true, syncRichToState);
    } else {
      insertAtLineStart(proseTextarea, '> ', actions);
      syncTextareaHeight();
    }
  };

  const applyListFormat = (kind: 'bullet' | 'ordered') => {
    if (!ensureDraftEditable()) return;
    if (useRichFormatting) {
      toggleRichListElement(proseRich, kind === 'ordered' ? 'OL' : 'UL', syncRichToState);
    } else {
      insertAtLineStart(proseTextarea, kind === 'ordered' ? '1. ' : '- ', actions);
      syncTextareaHeight();
    }
  };

  const applyParagraphAlignment = (align: 'left' | 'center' | 'right' | 'justify') => {
    if (useRichFormatting) {
      applyRichParagraphAlign(proseRich, align);
    } else {
      proseTextarea.style.textAlign = align === 'left' ? '' : align;
    }
  };

  const applySceneBreakInsert = () => {
    if (!ensureDraftEditable()) return;
    if (useRichFormatting) {
      const outcome = toggleRichSectionBreak(proseRich, syncRichToState);
      actions.notify(outcome === 'removed' ? 'Removed middle section line' : 'Added middle section line');
    } else {
      const pos = proseTextarea.selectionStart;
      const cur = proseTextarea.value;
      const lineStart = cur.lastIndexOf('\n', Math.max(0, pos - 1)) + 1;
      const lineEndIdx = cur.indexOf('\n', lineStart);
      const lineEnd = lineEndIdx === -1 ? cur.length : lineEndIdx;
      const curLine = cur.slice(lineStart, lineEnd).trim();
      if (/^(?:\*\s*\*\s*\*|-\s*-\s*-)$/.test(curLine)) {
        const before = cur.slice(0, lineStart).replace(/\n+$/, '');
        const after = cur.slice(lineEnd).replace(/^\n+/, '');
        const nextVal = [before, after].filter(Boolean).join('\n\n');
        proseTextarea.value = nextVal;
        proseTextarea.focus();
        const nextCaret = before.length;
        proseTextarea.setSelectionRange(nextCaret, nextCaret);
        syncTextareaHeight();
        actions.updateActiveSceneTextQuietly('content', nextVal);
        actions.notify('Removed middle section line');
        return;
      }
      const insertion = '\n\n* * *\n\n';
      const nextVal = cur.slice(0, pos) + insertion + cur.slice(pos);
      proseTextarea.value = nextVal;
      proseTextarea.focus();
      proseTextarea.setSelectionRange(pos + insertion.length, pos + insertion.length);
      syncTextareaHeight();
      actions.updateActiveSceneTextQuietly('content', nextVal);
      actions.notify('Added middle section line');
    }
  };

  proseRich.addEventListener('click', (e) => {
    if (!canEditThisScene) return;
    const hrEl = (e.target as HTMLElement | null)?.closest('hr.bv-scene-break');
    if (hrEl && proseRich.contains(hrEl)) {
      hrEl.remove();
      syncRichToState();
      actions.notify('Removed middle section line');
    }
  });

  const getActiveCursorOffset = (): number => {
    if (useRichFormatting) {
      return getRichMarkdownCursorOffset(proseRich);
    }
    return proseTextarea.selectionStart;
  };

  proseTextarea.addEventListener('input', () => {
    syncTextareaHeight();
    actions.updateActiveSceneTextQuietly('content', proseTextarea.value);
  });

  proseTextarea.addEventListener('keydown', (e) => {
    if (!canEditThisScene) return;
    const key = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && key === 'b') {
      e.preventDefault();
      applyBoldFormat();
    } else if ((e.ctrlKey || e.metaKey) && key === 'i') {
      e.preventDefault();
      applyItalicFormat();
    } else if ((e.ctrlKey || e.metaKey) && key === 'u') {
      e.preventDefault();
      applyUnderlineFormat();
    }
  });

  proseRich.addEventListener('input', () => {
    syncRichToState();
  });

  proseRich.addEventListener('paste', (e) => {
    if (!canEditThisScene) return;
    const plain = e.clipboardData?.getData('text/plain');
    if (typeof plain !== 'string') return;
    e.preventDefault();
    insertPlainTextAtRichCaret(proseRich, plain, syncRichToState);
  });

  proseRich.addEventListener('keydown', (e) => {
    if (!canEditThisScene) return;
    const key = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && key === 'b') {
      e.preventDefault();
      applyBoldFormat();
    } else if ((e.ctrlKey || e.metaKey) && key === 'i') {
      e.preventDefault();
      applyItalicFormat();
    } else if ((e.ctrlKey || e.metaKey) && key === 'u') {
      e.preventDefault();
      applyUnderlineFormat();
    }
  });

  const activeProseSurface: HTMLElement = useRichFormatting ? proseRich : proseTextarea;

  attachContextMenu(activeProseSurface, () => {
    const start = useRichFormatting ? 0 : proseTextarea.selectionStart;
    const end = useRichFormatting ? 0 : proseTextarea.selectionEnd;
    const domSel = useRichFormatting ? window.getSelection()?.toString() ?? '' : '';
    const hasSelection = useRichFormatting ? domSel.length > 0 : end > start;
    const groups: ContextMenuGroup[] = [
      {
        heading: 'Writing & Selection',
        items: [
          {
            label: 'Cut Selection',
            disabled: !hasSelection || !canEditThisScene,
            shortcut: 'Ctrl+X',
            onSelect: () => {
              if (useRichFormatting) {
                if (domSel) void navigator.clipboard?.writeText(domSel);
                const r = getSelectionRangeInRich(proseRich);
                r?.deleteContents();
                syncRichToState();
                return;
              }
              const selText = proseTextarea.value.slice(start, end);
              void navigator.clipboard?.writeText(selText);
              const nextVal = proseTextarea.value.slice(0, start) + proseTextarea.value.slice(end);
              proseTextarea.value = nextVal;
              proseTextarea.setSelectionRange(start, start);
              syncTextareaHeight();
              actions.updateActiveSceneTextQuietly('content', nextVal);
            },
          },
          {
            label: 'Copy Selection',
            disabled: !hasSelection,
            shortcut: 'Ctrl+C',
            onSelect: () => {
              const selText = useRichFormatting ? domSel : proseTextarea.value.slice(start, end);
              void navigator.clipboard?.writeText(selText);
              actions.notify('Copied selection');
            },
          },
          {
            label: 'Paste Plain Text',
            disabled: !canEditThisScene,
            shortcut: 'Ctrl+V',
            onSelect: () => {
              void navigator.clipboard?.readText().then((clip) => {
                if (!clip) return;
                if (useRichFormatting) {
                  insertPlainTextAtRichCaret(proseRich, clip, syncRichToState);
                  return;
                }
                const nextVal = proseTextarea.value.slice(0, start) + clip + proseTextarea.value.slice(end);
                proseTextarea.value = nextVal;
                proseTextarea.setSelectionRange(start + clip.length, start + clip.length);
                syncTextareaHeight();
                actions.updateActiveSceneTextQuietly('content', nextVal);
              });
            },
          },
        ],
      },
      {
        heading: 'Formatting',
        items: [
          {
            label: useRichFormatting ? 'Bold' : 'Bold (**text**)',
            shortcut: 'Ctrl+B',
            onSelect: applyBoldFormat,
          },
          {
            label: useRichFormatting ? 'Italic' : 'Italic (*text*)',
            shortcut: 'Ctrl+I',
            onSelect: applyItalicFormat,
          },
          {
            label: useRichFormatting ? 'Underline' : 'Underline (<u>text</u>)',
            shortcut: 'Ctrl+U',
            onSelect: applyUnderlineFormat,
          },
          {
            label: useRichFormatting ? 'Strikethrough' : 'Strikethrough (~~text~~)',
            onSelect: applyStrikeFormat,
          },
          {
            label: 'Heading (H2)',
            onSelect: applyHeadingFormat,
          },
          {
            label: 'Epigraph / Blockquote',
            onSelect: applyQuoteFormat,
          },
          {
            label: 'Bulleted List',
            onSelect: () => applyListFormat('bullet'),
          },
          {
            label: 'Numbered List',
            onSelect: () => applyListFormat('ordered'),
          },
          {
            label: 'Add / Remove Section Line (* * *)',
            onSelect: applySceneBreakInsert,
          },
        ],
      },
      {
        heading: 'Scene Actions',
        items: [
          {
            label: 'Insert Image into Scene…',
            icon: 'image',
            onSelect: () => imageFileInput.click(),
          },
          {
            label: 'Split Scene at Cursor',
            icon: 'split-scene',
            onSelect: () => {
              if (!ensureDraftEditable()) return;
              const res = splitSceneAtOffset(actions.getState().project, scene.id, getActiveCursorOffset());
              if (!res.newSceneId) {
                actions.notify('Place cursor inside prose before splitting.');
                return;
              }
              actions.mutateProject(() => res.project, false);
              actions.selectScene(res.newSceneId, true);
              actions.notify('Scene split at cursor');
            },
          },
          {
            label: 'Capture Revision Snapshot',
            icon: 'camera',
            shortcut: 'Ctrl+S',
            onSelect: () => actions.createSnapshot(),
          },
          {
            label: 'Toggle Inline Proofread Markup',
            icon: 'proofread',
            onSelect: () => {
              if (!isTierAtLeast(actions.getState().settings.toolTier, 'intermediate')) {
                actions.updateSettings({ toolTier: 'intermediate' });
              }
              const nextMode = actions.getState().editorSubMode === 'proofread' ? 'draft' : 'proofread';
              const patch: Partial<AppState> = { editorSubMode: nextMode };
              if (isTauriRuntime() && nextMode !== 'draft') patch.showInspector = false;
              actions.setState(patch, true);
            },
          },
          {
            label: 'Toggle Split Reference Pane',
            icon: 'split',
            onSelect: () => {
              if (!isTierAtLeast(actions.getState().settings.toolTier, 'intermediate')) {
                actions.updateSettings({ toolTier: 'intermediate' });
              }
              const nextMode = actions.getState().editorSubMode === 'split' ? 'draft' : 'split';
              const patch: Partial<AppState> = { editorSubMode: nextMode };
              if (isTauriRuntime() && nextMode !== 'draft') patch.showInspector = false;
              actions.setState(patch, true);
            },
          },
          {
            label: 'Toggle Revision Diff Pane',
            icon: 'diff',
            onSelect: () => {
              if (!isTierAtLeast(actions.getState().settings.toolTier, 'intermediate')) {
                actions.updateSettings({ toolTier: 'intermediate' });
              }
              const nextMode = actions.getState().editorSubMode === 'diff' ? 'draft' : 'diff';
              const patch: Partial<AppState> = { editorSubMode: nextMode };
              if (isTauriRuntime() && nextMode !== 'draft') patch.showInspector = false;
              actions.setState(patch, true);
            },
          },
        ],
      },
    ];
    return groups;
  });

  const sceneHeading = el('input', {
    className: 'bv-scene-heading',
    attrs: {
      type: 'text',
      value: scene.title,
      placeholder: 'Scene Title',
      'aria-label': 'Scene title',
      ...(blockExt
        ? {
            spellcheck: 'false',
            autocorrect: 'off',
            ...extBlockAttrs,
          }
        : {}),
      ...(canEditThisScene ? {} : { readonly: '' }),
    },
    on: {
      input: () => {
        if (!canEditThisScene) return;
        actions.updateActiveSceneTextQuietly('title', sceneHeading.value);
      },
      keydown: (ev) => {
        if (ev.key !== 'Enter' || ev.isComposing) return;
        ev.preventDefault();
        const sheet = sceneHeading.closest('.bv-paper-sheet');
        const richBody = sheet?.querySelector<HTMLElement>('.bv-prose-rich[contenteditable="true"]');
        if (richBody) {
          richBody.focus({ preventScroll: false });
          const sel = window.getSelection();
          if (sel) {
            const range = document.createRange();
            const firstText = richBody.firstChild;
            if (firstText) {
              range.setStart(firstText, 0);
            } else {
              range.setStart(richBody, 0);
            }
            range.collapse(true);
            sel.removeAllRanges();
            sel.addRange(range);
          }
          return;
        }
        const plainBody = sheet?.querySelector<HTMLTextAreaElement>('.bv-prose-textarea');
        if (plainBody) {
          plainBody.focus({ preventScroll: false });
          plainBody.setSelectionRange(0, 0);
        }
      },
    },
  });

  const paperSelect = el(
    'select',
    {
      className: 'bv-select',
      tooltip: {
        title: 'Paper Sheet Theme',
        short: 'Switch between Obsidian, Parchment, and Ivory paper.',
      },
      attrs: { 'aria-label': 'Paper canvas theme' },
      on: {
        change: () => {
          const val = paperSelect.value as PaperTheme;
          actions.mutateProject((prev) => ({ ...prev, paperTheme: val }));
        },
      },
    },
    el('option', { text: 'Obsidian', attrs: { value: 'obsidian', selected: state.project.paperTheme === 'obsidian' } }),
    el('option', { text: 'Parchment', attrs: { value: 'parchment', selected: state.project.paperTheme === 'parchment' } }),
    el('option', { text: 'Ivory', attrs: { value: 'ivory', selected: state.project.paperTheme === 'ivory' } }),
  );

  const effectiveSubMode: EditorSubMode = allowIntermediate
    ? state.editorSubMode
    : 'draft';

  const setSubModeWithDesktopInspectorCollapse = (targetMode: EditorSubMode) => {
    pendingComposer = null;
    const patch: Partial<AppState> = { editorSubMode: targetMode };
    if (isTauriRuntime() && targetMode !== 'draft') {
      patch.showInspector = false;
    }
    actions.setState(patch, true);
  };

  const draftToolsStrip = allowIntermediate
    ? el(
        'div',
        { className: 'qv-draft-inline-tools' },
        el(
          'button',
          {
            className: `bv-mini-btn${effectiveSubMode === 'proofread' ? ' is-active' : ''}`,
            tooltip: TOOLTIP_CATALOG.modeProofread,
            attrs: {
              type: 'button',
              'aria-pressed': String(effectiveSubMode === 'proofread'),
              'aria-label': 'Toggle Inline Proofread Markup inside Draft Mode',
            },
            on: {
              click: () =>
                setSubModeWithDesktopInspectorCollapse(
                  effectiveSubMode === 'proofread' ? 'draft' : 'proofread',
                ),
            },
          },
          icon('proofread', 12),
          openProofCount > 0 ? `Proofread (${openProofCount})` : 'Proofread',
        ),
        el(
          'button',
          {
            className: `bv-mini-btn${effectiveSubMode === 'split' ? ' is-active' : ''}`,
            tooltip: TOOLTIP_CATALOG.modeSplit,
            attrs: {
              type: 'button',
              'aria-pressed': String(effectiveSubMode === 'split'),
              'aria-label': 'Toggle Collapsible Split Reference Pane',
            },
            on: {
              click: () =>
                setSubModeWithDesktopInspectorCollapse(
                  effectiveSubMode === 'split' ? 'draft' : 'split',
                ),
            },
          },
          icon('split', 12),
          'Split Ref',
        ),
        el(
          'button',
          {
            className: `bv-mini-btn${effectiveSubMode === 'diff' ? ' is-active' : ''}`,
            tooltip: TOOLTIP_CATALOG.modeDiff,
            attrs: {
              type: 'button',
              'aria-pressed': String(effectiveSubMode === 'diff'),
              'aria-label': 'Toggle Collapsible Revision Diff Pane',
            },
            on: {
              click: () =>
                setSubModeWithDesktopInspectorCollapse(
                  effectiveSubMode === 'diff' ? 'draft' : 'diff',
                ),
            },
          },
          icon('diff', 12),
          'Diff',
        ),
      )
    : null;

  const imageFileInput = el('input', {
    attrs: { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif', multiple: true },
    style: { display: 'none' },
    on: {
      change: () => {
        if (imageFileInput.files && imageFileInput.files.length > 0) {
          void addImageFilesToScene(imageFileInput.files, scene.id, actions, 0);
        }
        imageFileInput.value = '';
      },
    },
  });

  const fontChoices = getAllAvailableFontChoices();
  const currentFontVal = state.settings.editorFontFamily || '';
  const fontFamilySelect = el(
    'select',
    {
      className: 'bv-select qv-editor-font-select',
      tooltip: {
        title: 'Writing Typeface',
        short: 'Choose the font family used on the manuscript sheet.',
      },
      attrs: { 'aria-label': 'Manuscript font family' },
      on: {
        change: () => {
          actions.updateSettings({ editorFontFamily: fontFamilySelect.value });
        },
      },
    },
    el('option', {
      text: 'Default Serif',
      attrs: { value: '', selected: currentFontVal === '' },
    }),
    ...fontChoices.map((fc) =>
      el('option', {
        text: fc.label,
        attrs: {
          value: fc.id,
          selected: currentFontVal === fc.id || currentFontVal === fc.cssStack,
        },
      }),
    ),
  );

  const fontSizeOptions = [13, 14, 15, 16, 18, 20, 22, 24, 28];
  const fontSizeSelect = el(
    'select',
    {
      className: 'bv-select qv-editor-size-select',
      tooltip: {
        title: 'Font Size',
        short: 'Adjust prose size on the writing sheet (px).',
      },
      attrs: { 'aria-label': 'Manuscript font size' },
      on: {
        change: () => {
          const px = Number(fontSizeSelect.value);
          if (Number.isFinite(px)) actions.updateSettings({ editorFontSizePx: px });
        },
      },
    },
    ...fontSizeOptions.map((px) =>
      el('option', {
        text: `${px}px`,
        attrs: { value: px, selected: state.settings.editorFontSizePx === px },
      }),
    ),
  );

  const paragraphStyleSelect = el(
    'select',
    {
      className: 'bv-select qv-editor-block-select',
      tooltip: {
        title: 'Paragraph Style',
        short: 'Switch the active paragraph between Normal, Heading 1–3, or Blockquote.',
      },
      attrs: { 'aria-label': 'Paragraph block style' },
      on: {
        change: () => {
          applyParagraphStyle(
            paragraphStyleSelect.value as 'p' | 'h1' | 'h2' | 'h3' | 'blockquote',
          );
          paragraphStyleSelect.value = 'p';
        },
      },
    },
    el('option', { text: 'Normal', attrs: { value: 'p', selected: true } }),
    el('option', { text: 'Heading 1', attrs: { value: 'h1' } }),
    el('option', { text: 'Heading 2', attrs: { value: 'h2' } }),
    el('option', { text: 'Heading 3', attrs: { value: 'h3' } }),
    el('option', { text: 'Quote', attrs: { value: 'blockquote' } }),
  );

  const lineSpacingChoices = [
    { val: 1.35, label: '1.35×' },
    { val: 1.55, label: '1.55×' },
    { val: 1.72, label: '1.72×' },
    { val: 2.0, label: '2.0×' },
  ];
  const lineSpacingSelect = el(
    'select',
    {
      className: 'bv-select qv-editor-lh-select',
      tooltip: {
        title: 'Line Spacing',
        short: 'Adjust paragraph line height on the writing sheet.',
      },
      attrs: { 'aria-label': 'Paragraph line spacing' },
      on: {
        change: () => {
          const lh = Number(lineSpacingSelect.value);
          if (Number.isFinite(lh)) actions.updateSettings({ editorLineHeight: lh });
        },
      },
    },
    ...lineSpacingChoices.map((opt) =>
      el('option', {
        text: opt.label,
        attrs: {
          value: String(opt.val),
          selected: Math.abs(state.settings.editorLineHeight - opt.val) < 0.08,
        },
      }),
    ),
  );

  const subbar = el(
    'div',
    { className: 'bv-subbar' },
    imageFileInput,
    el(
      'div',
      { className: 'bv-subbar-group' },
      el(
        'button',
        {
          className: 'bv-fmt-btn bv-btn-compact-icon',
          tooltip: { title: 'Undo (Ctrl+Z)', short: 'Undo the previous edit across this book.' },
          attrs: { type: 'button', 'aria-label': 'Undo edit', disabled: !actions.canUndo() },
          on: { click: () => actions.undo() },
        },
        icon('undo', 14),
      ),
      el(
        'button',
        {
          className: 'bv-fmt-btn bv-btn-compact-icon',
          tooltip: { title: 'Redo (Ctrl+Y)', short: 'Re-apply the reverted edit.' },
          attrs: { type: 'button', 'aria-label': 'Redo edit', disabled: !actions.canRedo() },
          on: { click: () => actions.redo() },
        },
        icon('redo', 14),
      ),
      el('span', { className: 'qv-subbar-sep', attrs: { 'aria-hidden': 'true' } }),
      fontFamilySelect,
      fontSizeSelect,
      paragraphStyleSelect,
      el('span', { className: 'qv-subbar-sep', attrs: { 'aria-hidden': 'true' } }),
      el('button', {
        className: 'bv-fmt-btn',
        text: 'B',
        tooltip: TOOLTIP_CATALOG.bold,
        attrs: { type: 'button', 'aria-label': 'Bold' },
        style: { fontWeight: '700' },
        on: { click: applyBoldFormat },
      }),
      el('button', {
        className: 'bv-fmt-btn',
        text: 'I',
        tooltip: TOOLTIP_CATALOG.italic,
        attrs: { type: 'button', 'aria-label': 'Italic' },
        style: { fontStyle: 'italic' },
        on: { click: applyItalicFormat },
      }),
      el('button', {
        className: 'bv-fmt-btn',
        text: 'U',
        tooltip: { title: 'Underline (Ctrl+U)', short: 'Underline selected prose.' },
        attrs: { type: 'button', 'aria-label': 'Underline' },
        style: { textDecoration: 'underline' },
        on: { click: applyUnderlineFormat },
      }),
      el('button', {
        className: 'bv-fmt-btn',
        text: 'S',
        tooltip: { title: 'Strikethrough', short: 'Strike through selected words or draft lines.' },
        attrs: { type: 'button', 'aria-label': 'Strikethrough' },
        style: { textDecoration: 'line-through' },
        on: { click: applyStrikeFormat },
      }),
      el(
        'button',
        {
          className: 'bv-fmt-btn bv-btn-compact-icon',
          tooltip: { title: 'Clear Formatting', short: 'Strip inline emphasis from selected text.' },
          attrs: { type: 'button', 'aria-label': 'Clear formatting' },
          on: { click: applyClearFormat },
        },
        icon('clear-format', 14),
      ),
      el('span', { className: 'qv-subbar-sep', attrs: { 'aria-hidden': 'true' } }),
      el(
        'button',
        {
          className: 'bv-fmt-btn bv-btn-compact-icon',
          tooltip: { title: 'Bulleted List', short: 'Start or toggle a bulleted list item.' },
          attrs: { type: 'button', 'aria-label': 'Bulleted list' },
          on: { click: () => applyListFormat('bullet') },
        },
        icon('list-bullet', 14),
      ),
      el(
        'button',
        {
          className: 'bv-fmt-btn bv-btn-compact-icon',
          tooltip: { title: 'Numbered List', short: 'Start or toggle a numbered list item.' },
          attrs: { type: 'button', 'aria-label': 'Numbered list' },
          on: { click: () => applyListFormat('ordered') },
        },
        icon('list-ordered', 14),
      ),
      el(
        'button',
        {
          className: 'bv-fmt-btn bv-btn-compact-icon',
          tooltip: TOOLTIP_CATALOG.quote,
          attrs: { type: 'button', 'aria-label': 'Epigraph Blockquote' },
          on: { click: applyQuoteFormat },
        },
        icon('quote', 14),
      ),
      el(
        'button',
        {
          className: 'bv-fmt-btn bv-btn-compact-icon',
          tooltip: {
            title: 'Middle Section Line',
            short: 'Add or remove a centered middle section divider (* * *) at the cursor.',
          },
          attrs: { type: 'button', 'aria-label': 'Add or remove middle section divider' },
          on: { click: applySceneBreakInsert },
        },
        icon('section-divider', 14),
      ),
      el('span', { className: 'qv-subbar-sep', attrs: { 'aria-hidden': 'true' } }),
      ...([
        { id: 'left', iconName: 'align-left', short: 'Align Left' },
        { id: 'center', iconName: 'align-center', short: 'Align Center' },
        { id: 'right', iconName: 'align-right', short: 'Align Right' },
        { id: 'justify', iconName: 'align-justify', short: 'Justify Paragraph' },
      ] as const).map((al) =>
        el(
          'button',
          {
            className: 'bv-fmt-btn bv-btn-compact-icon',
            tooltip: { title: al.short, short: `${al.short} in the active paragraph.` },
            attrs: { type: 'button', 'aria-label': al.short },
            on: { click: () => applyParagraphAlignment(al.id) },
          },
          icon(al.iconName, 14),
        ),
      ),
      lineSpacingSelect,
      el(
        'button',
        {
          className: 'bv-fmt-btn bv-btn-compact-icon',
          tooltip: {
            title: 'Insert Image into Scene',
            short: 'Add a photo or illustration with text wrap, snap-to-grid, and offline background removal (or drag & drop directly onto the page).',
          },
          attrs: { type: 'button', 'aria-label': 'Insert Image into Scene' },
          on: { click: () => imageFileInput.click() },
        },
        icon('image', 14),
      ),
      allowIntermediate
        ? el(
            'button',
            {
              className: 'bv-fmt-btn bv-btn-compact-icon',
              tooltip: TOOLTIP_CATALOG.splitScene,
              attrs: { type: 'button', 'aria-label': 'Split Scene at Cursor' },
              on: {
                click: () => {
                  if (!ensureDraftEditable()) return;
                  const res = splitSceneAtOffset(
                    actions.getState().project,
                    scene.id,
                    getActiveCursorOffset(),
                  );
                  if (!res.newSceneId) {
                    actions.notify('Place cursor inside Draft prose before splitting.');
                    return;
                  }
                  actions.mutateProject(() => res.project, false);
                  actions.selectScene(res.newSceneId, true);
                  actions.notify('Scene split at cursor');
                },
              },
            },
            icon('split-scene', 14),
          )
        : null,
    ),
    el(
      'div',
      { className: 'bv-subbar-group' },
      paperSelect,
      allowIntermediate
        ? el(
            'button',
            {
              className: `bv-fmt-btn bv-btn-compact-icon${state.typewriterMode ? ' is-active' : ''}`,
              tooltip: TOOLTIP_CATALOG.typewriter,
              attrs: { type: 'button', 'aria-label': 'Toggle Typewriter Scrolling' },
              on: {
                click: () =>
                  actions.setState({ typewriterMode: !actions.getState().typewriterMode }, true),
              },
            },
            icon('typewriter', 14),
          )
        : null,
      el(
        'button',
        {
          className: `bv-fmt-btn bv-btn-compact-icon${state.zenMode ? ' is-active' : ''}`,
          tooltip: TOOLTIP_CATALOG.zen,
          attrs: { type: 'button', 'aria-label': 'Toggle Zen Focus Mode' },
          on: {
            click: () => actions.setState({ zenMode: !actions.getState().zenMode }, true),
          },
        },
        icon('zen', 14),
      ),
      allowIntermediate
        ? el(
            'button',
            {
              className: 'bv-fmt-btn bv-btn-compact-icon',
              tooltip: TOOLTIP_CATALOG.snapshot,
              attrs: { type: 'button', 'aria-label': 'Capture Revision Snapshot' },
              on: { click: () => actions.createSnapshot() },
            },
            icon('camera', 14),
          )
        : null,
    ),
  );

  const paperFloatNav = el(
    'div',
    { className: 'bv-paper-float-nav' },
    el('span', {
      className: 'bv-scene-kicker',
      text: `${part.title} / ${chapter.title}`,
      style: {
        minWidth: '0',
        flex: '1 1 160px',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      },
    }),
    draftToolsStrip,
  );

  const splitResizer = createVerticalResizer({
    side: 'right',
    minWidth: 260,
    maxWidth: 640,
    getDynamicMaxWidth: () => {
      const stageW = panes.clientWidth || (typeof window !== 'undefined' ? window.innerWidth : 1000);
      return Math.max(260, Math.min(640, stageW - 400 - 5));
    },
    cssVarName: '--qv-split-w',
    ariaLabel: 'Resize Companion Split Reference or Diff Pane',
    getWidth: () => editorSplitWidthPx,
    onResizeEnd: (finalWidth) => saveEditorSplitWidth(finalWidth),
    onDoubleClickReset: () => {
      saveEditorSplitWidth(360);
      return 360;
    },
  });

  const panes = el('div', {
    className: `bv-editor-panes${effectiveSubMode !== 'draft' ? ' has-split' : ''}`,
  });

  if (isProofMode) {
    const { sheetWrap, paperScrollEl } = renderProofreadWorkspace(
      actions,
      scene,
      paperFloatNav,
      sceneHeading,
    );
    panes.append(sheetWrap, splitResizer, renderProofreadLedgerPane(actions, scene, paperScrollEl));
    container.append(subbar, panes);
    return;
  }

  const performChapterUnlock = () => {
    if (lockStatus.scope === 'part' && lockStatus.partId) {
      actions.mutateProject((prev) => togglePartLock(prev, lockStatus.partId!, false));
    } else if (lockStatus.chapterId) {
      actions.mutateProject((prev) => toggleChapterLock(prev, lockStatus.chapterId!, false));
    }
    actions.notify('Unlocked for editing');
  };

  const lockSealButton = lockStatus.locked
    ? el(
        'button',
        {
          className: 'qv-lock-seal-btn',
          tooltip: {
            title: `Locked (${lockStatus.reason})`,
            short: state.settings.confirmBeforeUnlock
              ? 'Click to confirm unlocking this section for editing.'
              : 'Click to unlock this section for editing.',
          },
          attrs: {
            type: 'button',
            'aria-label': `Locked (${lockStatus.reason}). Click to unlock`,
          },
          on: {
            click: () => {
              if (actions.getState().settings.confirmBeforeUnlock) {
                const targetName =
                  lockStatus.scope === 'part' ? `Part “${part.title}”` : `Chapter “${chapter.title}”`;
                openUnlockConfirmDialog(targetName, performChapterUnlock);
              } else {
                performChapterUnlock();
              }
            },
          },
        },
        icon('lock', 14),
      )
    : null;

  const readOnlyBanner = !sessionPerms.canEditProse
    ? el(
        'div',
        { className: 'qv-readonly-banner', attrs: { role: 'status' } },
        el('span', {
          text: 'Prose editing is locked for your current collaborator role. You can read or add proofread marks and notes.',
        }),
        el('button', {
          className: 'bv-mini-btn',
          text: 'Switch to Proofread Mode',
          attrs: { type: 'button' },
          on: { click: () => actions.setState({ editorSubMode: 'proofread' }, true) },
        }),
      )
    : null;

  const sceneImagesStudio = renderSceneImageComposer(scene, actions, () => {
    focusProseSurface();
    activeProseSurface.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });

  const paperSheet = el(
    'div',
    {
      className: `bv-paper-sheet${lockStatus.locked ? ' is-chapter-sealed' : ''}`,
      on: {
        dragover: (e) => {
          if (e.dataTransfer?.types.includes('Files')) {
            const hasImg = Array.from(e.dataTransfer.items ?? []).some((it) => it.type.startsWith('image/'));
            if (hasImg) {
              e.preventDefault();
              paperSheet.classList.add('is-img-drop-target');
            }
          }
        },
        dragleave: () => paperSheet.classList.remove('is-img-drop-target'),
        drop: (e) => {
          paperSheet.classList.remove('is-img-drop-target');
          const files = e.dataTransfer?.files;
          if (!files || files.length === 0) return;
          const imgFiles = Array.from(files).filter((f) => f.type.startsWith('image/'));
          if (imgFiles.length === 0) return;
          e.preventDefault();
          e.stopPropagation();
          void addImageFilesToScene(imgFiles, scene.id, actions, 0);
        },
      },
    },
    ...(lockSealButton ? [lockSealButton] : []),
    paperFloatNav,
    sceneHeading,
    ...(readOnlyBanner ? [readOnlyBanner] : []),
    ...(sceneImagesStudio ? [sceneImagesStudio] : []),
    activeProseSurface,
  );

  const paperScroll = el(
    'div',
    {
      className: 'bv-paper-scroll',
      dataset: { paper: state.project.paperTheme },
    },
    paperSheet,
  );

  // Ensure wheel / trackpad scrolling directly inside the auto-sized textarea always scrolls the paper container on Chromium & WebView2
  proseTextarea.addEventListener(
    'wheel',
    (e) => {
      if (e.ctrlKey || e.metaKey) return;
      if (proseTextarea.scrollHeight <= proseTextarea.clientHeight + 4) {
        if (Math.abs(e.deltaY) > 0 || Math.abs(e.deltaX) > 0) {
          paperScroll.scrollTop += e.deltaY;
          paperScroll.scrollLeft += e.deltaX;
          if (e.cancelable) e.preventDefault();
        }
      }
    },
    { passive: false },
  );

  panes.appendChild(paperScroll);

  if (effectiveSubMode === 'split') {
    panes.append(splitResizer, renderSplitReferencePane(actions));
  } else if (effectiveSubMode === 'diff') {
    panes.append(splitResizer, renderRevisionDiffPane(actions, scene));
  }

  container.append(subbar, panes);
  requestAnimationFrame(() => {
    syncTextareaHeight();
  });
}

function renderProofreadWorkspace(
  actions: AppActions,
  scene: NonNullable<ReturnType<typeof findSceneContext>>['scene'],
  paperFloatNav: HTMLElement,
  sceneHeading: HTMLInputElement,
): { sheetWrap: HTMLElement; paperScrollEl: HTMLElement } {
  const state = actions.getState();
  const marks = (scene.proofreadMarks ?? []).filter(
    (m) => m.status === 'open' || m.status === 'stet',
  );

  let lastKnownRange: { start: number; end: number } | null = null;
  const proseSurface = el('div', {
    className: 'bv-proof-prose',
    attrs: {
      tabindex: '0',
      'aria-label': 'Interactive Proofreading Surface — select any word or sentence to apply marks',
    },
    on: {
      mouseup: () => {
        const resolved = resolveSelectionFromProofSheet(proseSurface);
        if (resolved) lastKnownRange = resolved;
      },
      keyup: () => {
        const resolved = resolveSelectionFromProofSheet(proseSurface);
        if (resolved) lastKnownRange = resolved;
      },
    },
  });

  const triggerMarkAction = (kind: ProofreadMarkKind) => {
    const spec = PROOFREAD_MARK_SPECS[kind];
    const liveSel = state.proofreadPreviewClean
      ? null
      : resolveSelectionFromProofSheet(proseSurface) ?? lastKnownRange;

    if (!liveSel) {
      if (state.proofreadPreviewClean) {
        actions.notify('Turn off Clean Preview before adding proofreading marks.');
        return;
      }
      if (spec.requiresSelection) {
        actions.notify(`Highlight word(s) or a sentence on the page first for ${spec.label}.`);
        return;
      }
      pendingComposer = { kind, start: scene.content.length, end: scene.content.length, originalText: '' };
      renderEditorView(document.querySelector('.bv-main-stage') as HTMLElement, actions);
      return;
    }

    if (spec.requiresSelection && liveSel.start === liveSel.end) {
      actions.notify(`Highlight one or more words for ${spec.label}.`);
      return;
    }

    const originalText = scene.content.slice(liveSel.start, liveSel.end);
    if (spec.promptsReplacement || spec.promptsNote) {
      pendingComposer = {
        kind,
        start: liveSel.start,
        end: liveSel.end,
        originalText,
      };
      actions.setState({}, true);
      return;
    }

    const reviewer = activeReviewerInfo(actions);
    const res = addProofreadMark(actions.getState().project, scene.id, {
      kind,
      start: liveSel.start,
      end: liveSel.end,
      authorName: reviewer.authorName,
      role: reviewer.role,
    });
    actions.mutateProject(() => res.project, false);
    actions.setState({ activeProofreadMarkId: res.mark?.id ?? '' }, true);
    actions.notify(`Added ${spec.label} mark`);
  };

  // Proofreading Mark Palette Strip
  const markPalette = el('div', { className: 'bv-pr-toolbar' });
  const markBtns = el('div', { className: 'bv-pr-btn-row' });
  for (const kind of PROOFREAD_TOOLBAR_ORDER) {
    const spec = PROOFREAD_MARK_SPECS[kind];
    markBtns.appendChild(
      el('button', {
        className: `bv-pr-tool-btn${pendingComposer?.kind === kind ? ' is-active' : ''}`,
        text: spec.symbol,
        tooltip: {
          title: `${spec.label} (${spec.symbol})`,
          short: spec.shortDesc,
          details: spec.fullDesc,
        },
        attrs: { type: 'button', 'aria-label': spec.label },
        on: { click: () => triggerMarkAction(kind) },
      }),
    );
  }

  const bulkGroup = el(
    'div',
    { className: 'bv-pr-bulk-row' },
    el('button', {
      className: `bv-mini-btn${state.proofreadPreviewClean ? ' is-active' : ''}`,
      text: state.proofreadPreviewClean ? 'Clean Preview ✓' : 'Clean Preview',
      tooltip: {
        title: 'Clean Proof Preview',
        short: 'Temporarily preview prose with all open proof marks accepted.',
      },
      attrs: { type: 'button' },
      on: {
        click: () =>
          actions.setState({ proofreadPreviewClean: !state.proofreadPreviewClean }, true),
      },
    }),
    el('button', {
      className: 'bv-mini-btn',
      text: 'Auto-Proof',
      tooltip: {
        title: 'Run Editorial Proofing Toolkit',
        short: 'Scan active scene offline for repeated words, spacing issues, and weak verbs.',
        details: 'Runs the integrated core.editorial-proofing extension and creates reviewable marks without changing your prose directly.',
      },
      attrs: { type: 'button' },
      on: {
        click: () => {
          const ext = loadInstalledExtensions().find((e) => e.manifest.id === 'core.editorial-proofing');
          if (!ext || !ext.enabled) {
            actions.notify('Enable "Editorial Proofing Toolkit" in Extensions first.');
            return;
          }
          try {
            const res = runExtensionRulesOnScene(ext, actions.getState().project, scene.id);
            actions.mutateProject(() => res.project);
            actions.notify(
              res.addedMarks > 0
                ? `Added ${res.addedMarks} proofreading suggestion(s)`
                : 'No proofing issues found in this scene.',
            );
          } catch (err) {
            actions.notify(err instanceof Error ? err.message : 'Unable to run proofing extension.');
          }
        },
      },
    }),
    el('button', {
      className: 'bv-mini-btn',
      text: 'Accept All',
      tooltip: {
        title: 'Accept All Open Marks',
        short: 'Apply every pending edit with a safety snapshot.',
      },
      attrs: { type: 'button' },
      on: {
        click: () => {
          actions.mutateProject((prev) => acceptAllProofreadMarks(prev, scene.id));
          actions.notify('Accepted open proofreading marks (snapshot saved)');
        },
      },
    }),
    el('button', {
      className: 'bv-mini-btn',
      text: 'Reject All',
      tooltip: {
        title: 'Reject All Open Marks',
        short: 'Dismiss every open mark without altering text.',
      },
      attrs: { type: 'button' },
      on: {
        click: () => {
          actions.mutateProject((prev) => rejectAllProofreadMarks(prev, scene.id));
          actions.notify('Rejected open proofreading marks');
        },
      },
    }),
  );

  markPalette.append(markBtns, bulkGroup);

  // Build non-overlapping annotated prose DOM on proseSurface
  if (state.proofreadPreviewClean) {
    proseSurface.textContent = computeCleanProofPreview(scene.content, scene.proofreadMarks ?? []);
  } else {
    renderMarkedSegments(proseSurface, scene.content, marks, state.activeProofreadMarkId, (markId) => {
      actions.setState({ activeProofreadMarkId: markId }, true);
    });
  }

  attachContextMenu(proseSurface, (e) => {
    const resolved = resolveSelectionFromProofSheet(proseSurface);
    if (resolved) lastKnownRange = resolved;

    const hitMarkEl = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-mark-id]');
    const hitMarkId = hitMarkEl?.dataset.markId;
    const hitMark = hitMarkId ? (scene.proofreadMarks ?? []).find((m) => m.id === hitMarkId) : undefined;

    const groups: ContextMenuGroup[] = [];
    if (hitMark) {
      const hitSpec = PROOFREAD_MARK_SPECS[hitMark.kind];
      groups.push({
        heading: `Mark: ${hitSpec.label}`,
        items: [
          {
            label: 'Accept Mark',
            icon: 'check',
            onSelect: () => {
              const res = acceptProofreadMark(actions.getState().project, scene.id, hitMark.id);
              actions.mutateProject(() => res.project);
              actions.notify(res.applied ? `Accepted ${hitSpec.label}` : 'Target shifted');
            },
          },
          {
            label: 'Mark Stet (Let Stand)',
            onSelect: () => {
              actions.mutateProject((prev) => stetProofreadMark(prev, scene.id, hitMark.id));
              actions.notify('Marked stet');
            },
          },
          {
            label: 'Reject Mark',
            icon: 'trash',
            danger: true,
            onSelect: () => actions.mutateProject((prev) => rejectProofreadMark(prev, scene.id, hitMark.id)),
          },
        ],
      });
    }

    groups.push({
      heading: 'Proofread Markup',
      items: (['delete', 'insert', 'substitute', 'comment', 'highlight', 'transpose', 'stet'] as ProofreadMarkKind[]).map(
        (kind) => ({
          label: `${PROOFREAD_MARK_SPECS[kind].symbol}  ${PROOFREAD_MARK_SPECS[kind].label}`,
          onSelect: () => triggerMarkAction(kind),
        }),
      ),
    });

    groups.push({
      heading: 'Typography & Spacing Marks',
      items: (['capitalize', 'lowercase', 'italic', 'bold', 'paragraph', 'run-in', 'closeup', 'space'] as ProofreadMarkKind[]).map(
        (kind) => ({
          label: `${PROOFREAD_MARK_SPECS[kind].symbol}  ${PROOFREAD_MARK_SPECS[kind].label}`,
          onSelect: () => triggerMarkAction(kind),
        }),
      ),
    });

    groups.push({
      heading: 'Review Controls',
      items: [
        {
          label: state.proofreadPreviewClean ? 'Exit Clean Preview' : 'Toggle Clean Preview',
          icon: state.proofreadPreviewClean ? 'eye-off' : 'eye',
          checked: state.proofreadPreviewClean,
          onSelect: () => actions.setState({ proofreadPreviewClean: !state.proofreadPreviewClean }, true),
        },
        {
          label: 'Accept All Open Marks',
          icon: 'check',
          onSelect: () => {
            actions.mutateProject((prev) => acceptAllProofreadMarks(prev, scene.id));
            actions.notify('Accepted open marks (snapshot saved)');
          },
        },
        {
          label: 'Return to Draft Mode',
          icon: 'draft-sheet',
          onSelect: () => actions.setState({ editorSubMode: 'draft' }, true),
        },
      ],
    });

    return groups;
  });

  // Optional inline mark composer when a replacement/comment tool was clicked
  let composerStrip: HTMLElement | null = null;
  if (pendingComposer) {
    const comp = pendingComposer;
    const spec = PROOFREAD_MARK_SPECS[comp.kind];
    const replaceInput = el('input', {
      className: 'bv-input',
      attrs: {
        type: 'text',
        placeholder: spec.kind === 'insert' ? 'Words to insert at caret…' : 'Proposed replacement wording…',
        value: '',
      },
    });
    const noteInput = el('input', {
      className: 'bv-input',
      attrs: {
        type: 'text',
        placeholder: 'Proofreader note or query (optional)…',
      },
    });

    composerStrip = el(
      'div',
      { className: 'bv-pr-composer' },
      el(
        'div',
        { className: 'bv-pr-composer-head' },
        el('strong', { text: `${spec.symbol} ${spec.label}` }),
        comp.originalText
          ? el('span', { className: 'bv-mono-tag', text: `Target: “${comp.originalText.slice(0, 64)}”` })
          : el('span', { className: 'bv-mono-tag', text: `At char ${comp.start}` }),
      ),
      el(
        'div',
        { className: 'bv-pr-composer-fields' },
        spec.promptsReplacement ? replaceInput : null,
        noteInput,
        el('button', {
          className: 'bv-btn bv-btn-primary',
          text: 'Apply Mark',
          attrs: { type: 'button' },
          on: {
            click: () => {
              if (spec.promptsReplacement && !replaceInput.value) {
                actions.notify('Enter replacement or inserted text first.');
                return;
              }
              const reviewer = activeReviewerInfo(actions);
              const res = addProofreadMark(actions.getState().project, scene.id, {
                kind: comp.kind,
                start: comp.start,
                end: comp.end,
                replacement: spec.promptsReplacement ? replaceInput.value : undefined,
                note: noteInput.value,
                authorName: reviewer.authorName,
                role: reviewer.role,
              });
              pendingComposer = null;
              actions.mutateProject(() => res.project, false);
              actions.setState({ activeProofreadMarkId: res.mark?.id ?? '' }, true);
              actions.notify(`Added ${spec.label}`);
            },
          },
        }),
        el('button', {
          className: 'bv-btn',
          text: 'Cancel',
          attrs: { type: 'button' },
          on: {
            click: () => {
              pendingComposer = null;
              actions.setState({}, true);
            },
          },
        }),
      ),
    );
  }

  const paperSheet = el(
    'div',
    { className: 'bv-paper-sheet' },
    paperFloatNav,
    sceneHeading,
    composerStrip,
    proseSurface,
  );

  const paperScrollEl = el(
    'div',
    {
      className: 'bv-paper-scroll',
      dataset: { paper: state.project.paperTheme },
    },
    paperSheet,
  );

  const sheetWrap = el(
    'div',
    { style: { flex: '1', display: 'flex', flexDirection: 'column', minHeight: '0', minWidth: '0', maxWidth: '100%', overflow: 'hidden' } },
    markPalette,
    paperScrollEl,
  );

  return { sheetWrap, paperScrollEl };
}

function renderMarkedSegments(
  surface: HTMLElement,
  content: string,
  marks: ProofreadMark[],
  activeMarkId: string,
  onSelectMark: (markId: string) => void,
): void {
  const resolved: Array<{ mark: ProofreadMark; start: number; end: number }> = [];
  for (const m of marks) {
    const r = resolveMarkRange(content, m);
    if (r) resolved.push({ mark: m, start: r.start, end: r.end });
  }

  const points = new Set<number>([0, content.length]);
  for (const r of resolved) {
    points.add(r.start);
    points.add(r.end);
  }
  const sortedPoints = Array.from(points).sort((a, b) => a - b);

  const insertChipsAt = (pos: number) => {
    const pointMarks = resolved.filter((r) => r.start === pos && r.end === pos);
    for (const pm of pointMarks) {
      const m = pm.mark;
      const spec = PROOFREAD_MARK_SPECS[m.kind];
      const chipText =
        m.kind === 'insert' && m.replacement
          ? `∧ ${m.replacement}`
          : spec.symbol;
      const chip = el('span', {
        className: `bv-pr-chip ${spec.toneClass}${m.id === activeMarkId ? ' is-selected' : ''}`,
        text: chipText,
        attrs: { contenteditable: 'false', 'data-mark-id': m.id },
        tooltip: {
          title: `${spec.label} (${m.authorName})`,
          short: m.note || (m.replacement ? `Insert “${m.replacement}”` : spec.shortDesc),
        },
        on: {
          click: (e) => {
            e.stopPropagation();
            onSelectMark(m.id);
          },
        },
      });
      surface.appendChild(chip);
    }
  };

  for (let i = 0; i < sortedPoints.length; i++) {
    const pos = sortedPoints[i];
    insertChipsAt(pos);
    if (i === sortedPoints.length - 1) break;
    const nextPos = sortedPoints[i + 1];
    if (nextPos <= pos) continue;

    const covering = resolved.filter((r) => r.start <= pos && r.end >= nextPos && r.start < r.end);
    const primary = covering[0]?.mark;

    if (!primary) {
      surface.appendChild(
        el('span', {
          className: 'bv-pr-text-seg',
          text: content.slice(pos, nextPos),
          dataset: { rawStart: String(pos), rawEnd: String(nextPos) },
        }),
      );
    } else {
      const spec = PROOFREAD_MARK_SPECS[primary.kind];
      const seg = el('span', {
        className: `bv-pr-text-seg ${spec.toneClass}${primary.status === 'stet' ? ' bv-pr-stet' : ''}${primary.id === activeMarkId ? ' is-selected' : ''}`,
        text: content.slice(pos, nextPos),
        dataset: {
          rawStart: String(pos),
          rawEnd: String(nextPos),
          markId: primary.id,
        },
        on: {
          click: () => onSelectMark(primary.id),
        },
      });
      surface.appendChild(seg);

      // Show replacement or mark badge right after the last segment of this mark
      if (nextPos === covering[0].end && (primary.replacement || primary.kind === 'comment' || primary.kind === 'transpose')) {
        const badgeLabel =
          primary.kind === 'substitute'
            ? `⇄ ${primary.replacement}`
            : primary.kind === 'comment'
              ? 'AQ'
              : spec.symbol;
        surface.appendChild(
          el('span', {
            className: `bv-pr-chip ${spec.toneClass}${primary.id === activeMarkId ? ' is-selected' : ''}`,
            text: badgeLabel,
            attrs: { contenteditable: 'false', 'data-mark-id': primary.id },
            on: {
              click: (e) => {
                e.stopPropagation();
                onSelectMark(primary.id);
              },
            },
          }),
        );
      }
    }
  }
}

function createCompanionHead(
  actions: AppActions,
  activePane: 'proofread' | 'split' | 'diff',
  controlEl?: HTMLElement | null,
): HTMLElement {
  return el(
    'div',
    { className: 'bv-split-head' },
    el(
      'div',
      { className: 'qv-split-head-top' },
      el(
        'div',
        { className: 'qv-split-tabs' },
        ...(
          [
            { id: 'split', label: 'Reference' },
            { id: 'diff', label: 'Diff' },
            { id: 'proofread', label: 'Marks' },
          ] as const
        ).map((tab) =>
          el('button', {
            className: `bv-mini-btn${activePane === tab.id ? ' is-active' : ''}`,
            text: tab.label,
            attrs: { type: 'button', 'aria-pressed': String(activePane === tab.id) },
            on: {
              click: () => {
                pendingComposer = null;
                actions.setState(
                  { editorSubMode: activePane === tab.id ? 'draft' : tab.id },
                  true,
                );
              },
            },
          }),
        ),
      ),
      el('button', {
        className: 'bv-mini-btn',
        text: '×',
        tooltip: { title: 'Collapse Companion Pane', short: 'Close side pane and return to full Draft sheet.' },
        attrs: { type: 'button', 'aria-label': 'Collapse side pane' },
        on: {
          click: () => {
            pendingComposer = null;
            actions.setState({ editorSubMode: 'draft' }, true);
          },
        },
      }),
    ),
    controlEl ?? null,
  );
}

function renderProofreadLedgerPane(
  actions: AppActions,
  scene: NonNullable<ReturnType<typeof findSceneContext>>['scene'],
  paperScrollEl: HTMLElement,
): HTMLElement {
  const state = actions.getState();
  const allMarks = scene.proofreadMarks ?? [];
  const filtered = allMarks.filter((m) => {
    if (proofreadLedgerFilter === 'open') return m.status === 'open' || m.status === 'stet';
    if (proofreadLedgerFilter === 'resolved') return m.status === 'accepted' || m.status === 'rejected';
    return true;
  });

  const filterSelect = el(
    'select',
    {
      className: 'bv-select',
      attrs: { 'aria-label': 'Filter proofread marks' },
      on: {
        change: () => {
          proofreadLedgerFilter = filterSelect.value as 'open' | 'resolved' | 'all';
          actions.setState({}, true);
        },
      },
    },
    el('option', {
      text: `Open / Stet (${allMarks.filter((m) => m.status === 'open' || m.status === 'stet').length})`,
      attrs: { value: 'open', selected: proofreadLedgerFilter === 'open' },
    }),
    el('option', {
      text: `Resolved (${allMarks.filter((m) => m.status === 'accepted' || m.status === 'rejected').length})`,
      attrs: { value: 'resolved', selected: proofreadLedgerFilter === 'resolved' },
    }),
    el('option', {
      text: `All Marks (${allMarks.length})`,
      attrs: { value: 'all', selected: proofreadLedgerFilter === 'all' },
    }),
  );

  // Quick Mark by Phrase box for keyboard-only workflow
  const phraseIn = el('input', {
    className: 'bv-input',
    attrs: { type: 'text', placeholder: 'Find phrase in scene…', 'aria-label': 'Find phrase to mark' },
  });
  const quickKindSel = el(
    'select',
    { className: 'bv-select', attrs: { 'aria-label': 'Mark type' } },
    ...PROOFREAD_TOOLBAR_ORDER.map((k) =>
      el('option', {
        text: `${PROOFREAD_MARK_SPECS[k].symbol} ${PROOFREAD_MARK_SPECS[k].label}`,
        attrs: { value: k },
      }),
    ),
  );
  const quickReplIn = el('input', {
    className: 'bv-input',
    attrs: { type: 'text', placeholder: 'Replacement / note (optional)' },
  });

  const quickCard = el(
    'div',
    { className: 'bv-cork-card', style: { marginBottom: '12px', padding: '10px', gap: '8px' } },
    el('span', { className: 'bv-panel-title', text: 'Quick Mark by Phrase' }),
    phraseIn,
    el(
      'div',
      { style: { display: 'grid', gridTemplateColumns: '1fr auto', gap: '6px' } },
      quickKindSel,
      el('button', {
        className: 'bv-btn bv-btn-primary',
        text: 'Mark',
        attrs: { type: 'button' },
        on: {
          click: () => {
            const needle = phraseIn.value;
            if (!needle) {
              actions.notify('Type an exact word or phrase from this scene.');
              return;
            }
            const idx = scene.content.indexOf(needle);
            if (idx < 0) {
              actions.notify('Phrase not found in active scene prose.');
              return;
            }
            const kind = quickKindSel.value as ProofreadMarkKind;
            const spec = PROOFREAD_MARK_SPECS[kind];
            const reviewer = activeReviewerInfo(actions);
            const res = addProofreadMark(actions.getState().project, scene.id, {
              kind,
              start: idx,
              end: idx + needle.length,
              replacement: spec.promptsReplacement ? quickReplIn.value : undefined,
              note: !spec.promptsReplacement ? quickReplIn.value : '',
              authorName: reviewer.authorName,
              role: reviewer.role,
            });
            actions.mutateProject(() => res.project, false);
            actions.setState({ activeProofreadMarkId: res.mark?.id ?? '' }, true);
            actions.notify(`Marked “${needle}” (${spec.label})`);
          },
        },
      }),
    ),
    quickReplIn,
  );

  const list = el('div', { className: 'bv-snap-list' });
  if (filtered.length === 0) {
    list.appendChild(
      el('p', {
        className: 'bv-label',
        text: 'Select any word or sentence on the sheet and choose a mark symbol above, or use Quick Mark by Phrase.',
      }),
    );
  } else {
    for (const m of filtered) {
      const spec = PROOFREAD_MARK_SPECS[m.kind];
      const isSelected = m.id === state.activeProofreadMarkId;
      const noteIn = el('input', {
        className: 'bv-input',
        attrs: { type: 'text', value: m.note, placeholder: 'Add proofreader comment…' },
        on: {
          change: () =>
            actions.mutateProject((prev) =>
              updateProofreadMarkNote(prev, scene.id, m.id, noteIn.value),
            ),
        },
      });

      const card = el(
        'div',
        {
          className: 'bv-cork-card',
          style: {
            padding: '10px',
            gap: '6px',
            borderColor: isSelected ? 'var(--accent-ivory)' : 'var(--border-subtle)',
            cursor: 'pointer',
          },
          on: {
            click: () => {
              actions.setState({ activeProofreadMarkId: m.id }, false);
              const domTarget = paperScrollEl.querySelector(`[data-mark-id="${m.id}"]`);
              if (domTarget instanceof HTMLElement) {
                domTarget.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }
            },
          },
        },
        el(
          'div',
          { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px' } },
          el('span', {
            className: 'bv-mono-tag',
            text: `${spec.symbol} ${spec.label}`,
            style: { color: 'var(--accent-ivory)', fontWeight: '600' },
          }),
          el('span', {
            className: 'bv-mono-tag',
            text: m.status.toUpperCase(),
            style: {
              color:
                m.status === 'accepted'
                  ? 'var(--accent-emerald)'
                  : m.status === 'stet'
                    ? 'var(--accent-amber)'
                    : 'var(--text-muted)',
            },
          }),
        ),
        m.originalText
          ? el('div', {
              className: 'bv-label',
              text: m.replacement && m.replacement !== m.originalText
                ? `“${m.originalText}” → “${m.replacement}”`
                : `“${m.originalText}”`,
              style: { color: 'var(--text-primary)' },
            })
          : m.replacement
            ? el('div', { className: 'bv-label', text: `Insert: “${m.replacement}”`, style: { color: 'var(--accent-emerald)' } })
            : null,
        el('div', { className: 'bv-mono-tag', text: `By ${m.authorName}` }),
        noteIn,
        m.status === 'open' || m.status === 'stet'
          ? el(
              'div',
              { style: { display: 'flex', gap: '6px', justifyContent: 'flex-end' } },
              el('button', {
                className: 'bv-mini-btn',
                text: 'Accept',
                attrs: { type: 'button' },
                on: {
                  click: (e) => {
                    e.stopPropagation();
                    const res = acceptProofreadMark(actions.getState().project, scene.id, m.id);
                    actions.mutateProject(() => res.project);
                    actions.notify(res.applied ? `Accepted ${spec.label}` : 'Target text shifted');
                  },
                },
              }),
              el('button', {
                className: 'bv-mini-btn',
                text: 'Stet',
                attrs: { type: 'button' },
                on: {
                  click: (e) => {
                    e.stopPropagation();
                    actions.mutateProject((prev) => stetProofreadMark(prev, scene.id, m.id));
                    actions.notify('Marked stet (let stand)');
                  },
                },
              }),
              el('button', {
                className: 'bv-mini-btn',
                text: 'Reject',
                attrs: { type: 'button' },
                on: {
                  click: (e) => {
                    e.stopPropagation();
                    actions.mutateProject((prev) => rejectProofreadMark(prev, scene.id, m.id));
                  },
                },
              }),
            )
          : null,
      );
      list.appendChild(card);
    }
  }

  return el(
    'aside',
    { className: 'bv-split-pane' },
    createCompanionHead(actions, 'proofread', filterSelect),
    el('div', { className: 'bv-split-body' }, quickCard, list),
  );
}

function renderSplitReferencePane(actions: AppActions): HTMLElement {
  const state = actions.getState();
  const { project, splitTargetKind, splitTargetId } = state;

  const allScenes = getAllScenes(project);
  const options: Array<{ kind: 'scene' | 'character' | 'location' | 'lore'; id: string; label: string }> = [
    ...allScenes.map((item) => ({
      kind: 'scene' as const,
      id: item.scene.id,
      label: `Scene: ${item.scene.title}`,
    })),
    ...project.bible.characters.map((c) => ({
      kind: 'character' as const,
      id: c.id,
      label: `Character: ${c.name}`,
    })),
    ...project.bible.locations.map((l) => ({
      kind: 'location' as const,
      id: l.id,
      label: `Location: ${l.name}`,
    })),
    ...project.bible.lore.map((lr) => ({
      kind: 'lore' as const,
      id: lr.id,
      label: `Lore: ${lr.name}`,
    })),
  ];

  const activeKey = `${splitTargetKind}:${splitTargetId}`;
  const select = el('select', {
    className: 'bv-select',
    style: { maxWidth: '220px' },
    on: {
      change: () => {
        const [kind, id] = select.value.split(':');
        actions.setState(
          {
            splitTargetKind: kind as 'scene' | 'character' | 'location' | 'lore',
            splitTargetId: id,
          },
          true,
        );
      },
    },
  });

  for (const opt of options) {
    const val = `${opt.kind}:${opt.id}`;
    select.appendChild(
      el('option', {
        text: opt.label,
        attrs: { value: val, selected: val === activeKey },
      }),
    );
  }

  const body = el('div', { className: 'bv-split-body' });

  const resolved = options.find((o) => `${o.kind}:${o.id}` === activeKey) ?? options[0];
  if (resolved) {
    if (resolved.kind === 'scene') {
      const targetScene = allScenes.find((s) => s.scene.id === resolved.id)?.scene;
      if (targetScene) {
        body.append(
          el('h3', { text: targetScene.title, style: { marginTop: '0', marginBottom: '6px' } }),
          el('p', {
            className: 'bv-mono-tag',
            text: `${countWords(targetScene.content)} words, ${targetScene.pov || 'No POV'}`,
            style: { marginBottom: '14px' },
          }),
          el('div', { className: 'bv-ref-prose', text: targetScene.content || '(Empty scene)' }),
        );
      }
    } else if (resolved.kind === 'character') {
      const ch = project.bible.characters.find((c) => c.id === resolved.id);
      if (ch) {
        body.append(
          el('h3', { text: ch.name, style: { marginTop: '0', marginBottom: '4px' } }),
          el('p', { className: 'bv-mono-tag', text: ch.role }),
          el('p', { text: `Aliases: ${ch.aliases || 'None'}` }),
          el('p', { text: `Motivation: ${ch.motivation || '—'}` }),
          el('p', { text: `Appearance: ${ch.appearance || '—'}` }),
          el('p', { text: ch.notes }),
        );
      }
    } else if (resolved.kind === 'location') {
      const loc = project.bible.locations.find((l) => l.id === resolved.id);
      if (loc) {
        body.append(
          el('h3', { text: loc.name, style: { marginTop: '0', marginBottom: '4px' } }),
          el('p', { className: 'bv-mono-tag', text: loc.region }),
          el('p', { text: loc.atmosphere }),
          el('p', { text: loc.notes }),
        );
      }
    } else {
      const lr = project.bible.lore.find((item) => item.id === resolved.id);
      if (lr) {
        body.append(
          el('h3', { text: lr.name, style: { marginTop: '0', marginBottom: '4px' } }),
          el('p', { className: 'bv-mono-tag', text: lr.category }),
          el('p', { text: lr.summary }),
          el('p', { text: lr.notes }),
        );
      }
    }
  }

  return el(
    'aside',
    { className: 'bv-split-pane' },
    createCompanionHead(actions, 'split', select),
    body,
  );
}

function renderRevisionDiffPane(
  actions: AppActions,
  scene: NonNullable<ReturnType<typeof findSceneContext>>['scene'],
): HTMLElement {
  const state = actions.getState();
  const snaps = scene.snapshots;
  const body = el('div', { className: 'bv-split-body' });

  if (snaps.length === 0) {
    body.append(
      el('p', {
        text: 'No revision snapshots exist for this scene yet. Capture a snapshot to compare edits word-for-word.',
        style: { color: 'var(--text-secondary)', marginTop: '0' },
      }),
      el(
        'button',
        {
          className: 'bv-btn bv-btn-primary',
          attrs: { type: 'button' },
          on: { click: () => actions.createSnapshot('Initial Snapshot') },
        },
        icon('camera', 14),
        'Capture Snapshot Now',
      ),
    );
    return el('aside', { className: 'bv-split-pane' }, createCompanionHead(actions, 'diff'), body);
  }

  const chosen = snaps.find((s) => s.id === state.diffSnapshotId) ?? snaps[0];
  const snapSelect = el('select', {
    className: 'bv-select',
    on: {
      change: () => actions.setState({ diffSnapshotId: snapSelect.value }, true),
    },
  });
  for (const s of snaps) {
    snapSelect.appendChild(
      el('option', {
        text: `${s.label} (${s.wordCount}w)`,
        attrs: { value: s.id, selected: s.id === chosen.id },
      }),
    );
  }
  const head = createCompanionHead(actions, 'diff', snapSelect);

  const diff = computeWordDiff(chosen.content, scene.content);

  const statsRow = el(
    'div',
    {
      style: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '14px',
        paddingBottom: '10px',
        borderBottom: '1px solid var(--border-subtle)',
      },
    },
    el('span', {
      className: 'bv-mono-tag',
      text: `+${diff.addedWords} added  /  -${diff.removedWords} removed`,
    }),
    el('button', {
      className: 'bv-mini-btn',
      text: 'Restore Snapshot',
      attrs: { type: 'button' },
      on: {
        click: () => {
          actions.mutateProject((prev) => restoreSnapshotToScene(prev, scene.id, chosen.id));
          actions.notify(`Restored “${chosen.label}”`);
        },
      },
    }),
  );

  const diffBox = el('div', { className: 'bv-diff-box' });
  for (const token of diff.tokens) {
    if (token.type === 'equal') {
      diffBox.appendChild(document.createTextNode(token.value));
    } else if (token.type === 'insert') {
      diffBox.appendChild(el('span', { className: 'bv-diff-ins', text: token.value }));
    } else {
      diffBox.appendChild(el('span', { className: 'bv-diff-del', text: token.value }));
    }
  }

  body.append(statsRow, diffBox);
  return el('aside', { className: 'bv-split-pane' }, head, body);
}
