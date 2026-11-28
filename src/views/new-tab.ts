import type { AppActions } from '../core/app-context';
import {
  addBookToLibrary,
  getBookLastModifiedMs,
  sortLibraryBooksByLatest,
  upsertBookInLibrary,
} from '../core/library';
import { getProjectWordCount } from '../core/manuscript';
import { clearNode, el, icon, quillvibeLogo } from '../ui/dom';

export interface NewTabViewOptions {
  isBookOpenElsewhere: (bookId: string) => boolean;
  onPickBook: (bookId: string) => void;
  onCreateBlankBook: (title: string, penName: string) => void;
}

export function renderNewTabView(
  container: HTMLElement,
  actions: AppActions,
  options: NewTabViewOptions,
): void {
  clearNode(container);
  const state = actions.getState();
  const books = sortLibraryBooksByLatest(state.library.books);

  const bookGrid = el('div', { className: 'qv-newtab-grid' });
  for (const book of books) {
    const words = getProjectWordCount(book);
    const pen = book.authorIdentity?.penName || book.author || 'Author';
    const openElsewhere = options.isBookOpenElsewhere(book.id);
    const latestTs = getBookLastModifiedMs(book);
    const updatedLabel = latestTs
      ? new Date(latestTs).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
      : 'Local';

    bookGrid.appendChild(
      el(
        'button',
        {
          className: 'qv-newtab-book-card',
          attrs: { type: 'button' },
          on: { click: () => options.onPickBook(book.id) },
        },
        el(
          'div',
          { className: 'qv-newtab-book-head' },
          el('strong', { className: 'qv-newtab-book-title', text: book.title || 'Untitled Book' }),
          openElsewhere
            ? el('span', { className: 'qv-newtab-live-badge', text: 'Open Elsewhere (Live Sync)' })
            : null,
        ),
        el('div', {
          className: 'qv-newtab-book-meta',
          text: `${pen}, ${words.toLocaleString()} words, Updated ${updatedLabel}`,
        }),
      ),
    );
  }

  const defaultPen = state.project.authorIdentity?.penName || state.project.author || 'Author';

  const actionsRow = el(
    'div',
    { className: 'qv-newtab-actions' },
    el(
      'button',
      {
        className: 'bv-btn bv-btn-primary',
        attrs: { type: 'button' },
        on: {
          click: () => {
            const num = state.library.books.length + 1;
            options.onCreateBlankBook(`Untitled Book ${num}`, defaultPen);
          },
        },
      },
      icon('plus', 14),
      'New Blank Book',
    ),
    el(
      'button',
      {
        className: 'bv-btn',
        attrs: { type: 'button' },
        on: { click: () => void actions.openAnyQuillvibeFile() },
      },
      icon('folder', 14),
      'Open .qv File…',
    ),
    el(
      'button',
      {
        className: 'bv-btn',
        attrs: { type: 'button' },
        on: { click: () => void actions.importExternalDocument() },
      },
      icon('save', 14),
      'Import .docx / .md…',
    ),
    el(
      'button',
      {
        className: 'bv-btn',
        attrs: { type: 'button' },
        on: { click: () => actions.openCoursePage() },
      },
      icon('course', 14),
      'Book Writing Course',
    ),
  );

  const page = el(
    'div',
    { className: 'qv-newtab-page' },
    el(
      'div',
      { className: 'qv-newtab-shell' },
      el(
        'div',
        { className: 'qv-newtab-header' },
        quillvibeLogo(40),
        el(
          'div',
          {},
          el('h1', { className: 'qv-newtab-title', text: 'New Book Tab' }),
          el('p', {
            className: 'qv-newtab-sub',
            text: 'Choose a recent book from your local library or start a fresh manuscript in this tab.',
          }),
        ),
      ),
      actionsRow,
      el('h2', {
        className: 'qv-newtab-section-title',
        text: `Recent & Local Books (${books.length})`,
      }),
      bookGrid,
    ),
  );

  container.appendChild(page);
}

export function createBookForNewTab(
  actions: AppActions,
  title: string,
  penName: string,
): { newBookId: string } {
  const st = actions.getState();
  const baseLib = upsertBookInLibrary(st.library, st.project);
  const res = addBookToLibrary(baseLib, title, penName);
  actions.replaceLibrary(res.library);
  return { newBookId: res.newBook.id };
}
