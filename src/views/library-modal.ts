import type { AppActions } from '../core/app-context';
import { isTauriRuntime } from '../core/bridge';
import {
  checkBookOriginDevice,
  ensureAuthorIdentity,
  generateAuthorKeyPair,
  sealWorkCopyright,
  signManuscript,
} from '../core/identity';
import {
  addBookToLibrary,
  deleteBookFromLibrary,
  duplicateBookInLibrary,
  normalizeProjectDefaults,
  sortLibraryBooksByLatest,
} from '../core/library';
import { getProjectWordCount } from '../core/manuscript';
import { el, icon } from '../ui/dom';

function showDeleteBookConfirmModal(
  bookTitle: string,
  onConfirm: () => void,
): void {
  document.getElementById('qv-delete-book-confirm')?.remove();
  const expected = bookTitle.trim() || 'Untitled Book';

  const close = () => backdrop.remove();
  const confirmBtn = el('button', {
    className: 'bv-btn bv-btn-danger',
    text: 'Delete Permanently',
    attrs: { type: 'button', disabled: true },
    on: {
      click: () => {
        if (nameInput.value.trim() !== expected) return;
        close();
        onConfirm();
      },
    },
  });

  const nameInput = el('input', {
    className: 'bv-input',
    attrs: {
      type: 'text',
      placeholder: `Type "${expected}" to confirm`,
      autocomplete: 'off',
      'aria-label': 'Type exact book title to confirm deletion',
    },
    on: {
      input: () => {
        confirmBtn.disabled = nameInput.value.trim() !== expected;
      },
      keydown: (e) => {
        if (e.key === 'Enter' && nameInput.value.trim() === expected) {
          e.preventDefault();
          close();
          onConfirm();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          close();
        }
      },
    },
  });

  const backdrop = el(
    'div',
    {
      className: 'bv-modal-backdrop',
      id: 'qv-delete-book-confirm',
      on: {
        click: (e) => {
          if (e.target === backdrop) close();
        },
      },
    },
    el(
      'div',
      {
        className: 'bv-modal',
        style: { maxWidth: '450px' },
        attrs: { role: 'alertdialog', 'aria-modal': 'true', 'aria-label': 'Confirm Permanent Book Deletion' },
      },
      el(
        'div',
        { className: 'bv-panel-head' },
        el('span', { className: 'bv-panel-title', text: 'Confirm Book Deletion' }),
        el('button', { className: 'bv-mini-btn', text: 'Cancel', attrs: { type: 'button' }, on: { click: close } }),
      ),
      el(
        'div',
        { className: 'bv-modal-body', style: { display: 'flex', flexDirection: 'column', gap: '12px' } },
        el('p', {
          text: `This will permanently remove “${expected}” and its chapters, Story Bible, and cover layers from your local Quillvibe library.`,
          style: { margin: '0', fontSize: '13px', lineHeight: '1.5', color: 'var(--text-primary)' },
        }),
        el('p', {
          className: 'bv-label',
          text: `To confirm deletion, type the exact book name below: ${expected}`,
          style: { margin: '0' },
        }),
        nameInput,
        el(
          'div',
          { style: { display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '4px' } },
          el('button', { className: 'bv-btn', text: 'Cancel', attrs: { type: 'button' }, on: { click: close } }),
          confirmBtn,
        ),
      ),
    ),
  );
  document.body.appendChild(backdrop);
  requestAnimationFrame(() => nameInput.focus());
}

export function showLibraryModal(actions: AppActions): void {
  const existing = document.getElementById('bv-library-modal');
  if (existing) existing.remove();

  const renderBody = (modalBody: HTMLElement) => {
    modalBody.replaceChildren();
    const state = actions.getState();
    const library = state.library;
    const activeBook = normalizeProjectDefaults(state.project);
    const identity = ensureAuthorIdentity(activeBook);

    // 1. Multi-Book Shelf
    const newTitleIn = el('input', {
      className: 'bv-input',
      attrs: { type: 'text', placeholder: 'New book title…', 'aria-label': 'New book title' },
    });
    const newPenIn = el('input', {
      className: 'bv-input',
      attrs: { type: 'text', value: identity.penName, placeholder: 'Pen name…', 'aria-label': 'New book pen name' },
    });

    const shelfList = el('div', { className: 'bv-snap-list' });
    const sortedBooks = sortLibraryBooksByLatest(library.books);
    for (const book of sortedBooks) {
      const isCurrent = book.id === activeBook.id;
      const pen = book.authorIdentity?.penName || book.author;
      const keyBadge = book.authorIdentity?.authorKeyId || 'No Key';
      shelfList.appendChild(
        el(
          'div',
          {
            className: 'bv-list-card',
            style: {
              borderColor: isCurrent ? 'var(--accent-ivory)' : 'var(--border-subtle)',
              background: isCurrent ? 'var(--bg-elevated)' : 'var(--bg-bar)',
            },
          },
          el(
            'div',
            { style: { minWidth: '0', flex: '1' } },
            el('div', {
              text: book.title,
              style: { fontWeight: '600', fontSize: '13px', color: 'var(--text-primary)' },
            }),
            el('div', {
              className: 'bv-mono-tag',
              text: `Pen: ${pen} | ${getProjectWordCount(book).toLocaleString()}w | ${keyBadge}`,
            }),
          ),
          el(
            'div',
            { style: { display: 'flex', gap: '6px' } },
            !isCurrent
              ? el('button', {
                  className: 'bv-mini-btn',
                  text: 'Open',
                  attrs: { type: 'button' },
                  on: {
                    click: () => {
                      actions.switchBook(book.id);
                      renderBody(modalBody);
                    },
                  },
                })
              : el('span', {
                  className: 'bv-mono-tag',
                  text: 'ACTIVE',
                  style: { color: 'var(--accent-emerald)', padding: '3px 6px' },
                }),
            ...(isTauriRuntime()
              ? [
                  ...(state.settings.enableDesktopBookTabs
                    ? [
                        el(
                          'button',
                          {
                            className: 'bv-mini-btn',
                            tooltip: {
                              title: 'Open in Tab',
                              short: 'Stack this book as a tab in the current desktop window.',
                            },
                            attrs: { type: 'button' },
                            on: {
                              click: () => {
                                actions.openBookInTab(book.id);
                                renderBody(modalBody);
                              },
                            },
                          },
                          icon('plus', 11),
                          'Tab',
                        ),
                      ]
                    : []),
                  el(
                    'button',
                    {
                      className: 'bv-mini-btn',
                      tooltip: {
                        title: 'Open in New Window',
                        short: 'Open this manuscript in a parallel desktop window.',
                      },
                      attrs: { type: 'button' },
                      on: {
                        click: () => {
                          void actions.openNewWindow(book.id);
                        },
                      },
                    },
                    icon('window-new', 12),
                    'Window',
                  ),
                ]
              : []),
            el('button', {
              className: 'bv-mini-btn',
              text: 'Duplicate',
              attrs: { type: 'button' },
              on: {
                click: () => {
                  const res = duplicateBookInLibrary(actions.getState().library, book.id);
                  actions.replaceLibrary(res.library);
                  renderBody(modalBody);
                },
              },
            }),
            ...(library.books.length > 1
              ? [
                  el(
                    'button',
                    {
                      className: 'bv-mini-btn',
                      tooltip: { title: 'Delete Book', short: 'Remove this manuscript from the library shelf.' },
                      attrs: { type: 'button' },
                      on: {
                        click: () => {
                          showDeleteBookConfirmModal(book.title, () => {
                            const nextLib = deleteBookFromLibrary(actions.getState().library, book.id);
                            actions.replaceLibrary(nextLib);
                            actions.notify(`Deleted “${book.title}” from library`);
                            renderBody(modalBody);
                          });
                        },
                      },
                    },
                    icon('trash', 12),
                  ),
                ]
              : []),
          ),
        ),
      );
    }

    // 2. Active Book Pen Name, Signature Pad & Author Key
    const isKeyLocked = Boolean(identity.authorKeyId);
    const penNameIn = el('input', {
      className: 'bv-input',
      attrs: {
        type: 'text',
        value: identity.penName,
        ...(isKeyLocked ? { readonly: '' } : {}),
      },
      on: {
        change: () => {
          if (isKeyLocked) return;
          actions.mutateProject((prev) => {
            const next = normalizeProjectDefaults(prev);
            next.author = penNameIn.value;
            next.authorIdentity!.penName = penNameIn.value;
            return next;
          });
        },
      },
    });
    const sigTextIn = el('input', {
      className: 'bv-input',
      attrs: { type: 'text', value: identity.signatureText, placeholder: 'Typed signature name…' },
      on: {
        change: () => {
          actions.mutateProject((prev) => {
            const next = normalizeProjectDefaults(prev);
            next.authorIdentity!.signatureText = sigTextIn.value;
            return next;
          });
        },
      },
    });

    const sigCanvas = el('canvas', {
      className: 'bv-sig-canvas',
      attrs: { width: 420, height: 110, 'aria-label': 'Draw author signature' },
    });
    const sigCtx = sigCanvas.getContext('2d');
    if (sigCtx) {
      const inkColor =
        getComputedStyle(document.documentElement).getPropertyValue('--text-primary').trim() || '#181a20';
      sigCtx.strokeStyle = inkColor;
      sigCtx.lineWidth = 2.2;
      sigCtx.lineCap = 'round';
      sigCtx.lineJoin = 'round';
      if (identity.signatureSvgDataUrl) {
        const img = new Image();
        img.onload = () => sigCtx.drawImage(img, 0, 0, sigCanvas.width, sigCanvas.height);
        img.src = identity.signatureSvgDataUrl;
      }

      let drawing = false;
      sigCanvas.addEventListener('pointerdown', (e) => {
        drawing = true;
        sigCanvas.setPointerCapture(e.pointerId);
        const r = sigCanvas.getBoundingClientRect();
        sigCtx.beginPath();
        sigCtx.moveTo(
          ((e.clientX - r.left) / r.width) * sigCanvas.width,
          ((e.clientY - r.top) / r.height) * sigCanvas.height,
        );
      });
      sigCanvas.addEventListener('pointermove', (e) => {
        if (!drawing) return;
        const r = sigCanvas.getBoundingClientRect();
        sigCtx.lineTo(
          ((e.clientX - r.left) / r.width) * sigCanvas.width,
          ((e.clientY - r.top) / r.height) * sigCanvas.height,
        );
        sigCtx.stroke();
      });
      sigCanvas.addEventListener('pointerup', () => {
        if (!drawing) return;
        drawing = false;
        const url = sigCanvas.toDataURL('image/png');
        actions.mutateProject((prev) => {
          const next = normalizeProjectDefaults(prev);
          next.authorIdentity!.signatureSvgDataUrl = url;
          return next;
        }, false);
      });
    }

    modalBody.append(
      el(
        'div',
        { className: 'bv-two-col' },
        el(
          'section',
          { className: 'bv-cork-card' },
          el('span', { className: 'bv-panel-title', text: `Books in Library (${library.books.length})` }),
          shelfList,
          el(
            'div',
            { style: { display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '6px', marginTop: '6px' } },
            newTitleIn,
            newPenIn,
            el(
              'button',
              {
                className: 'bv-btn bv-btn-primary',
                attrs: { type: 'button' },
                on: {
                  click: () => {
                    const res = addBookToLibrary(
                      actions.getState().library,
                      newTitleIn.value || 'Untitled Book',
                      newPenIn.value || 'Pen Name',
                    );
                    actions.replaceLibrary(res.library);
                    actions.notify(`Created “${res.newBook.title}”`);
                    renderBody(modalBody);
                  },
                },
              },
              icon('plus', 13),
              'New Book',
            ),
          ),
        ),
        el(
          'section',
          { className: 'bv-cork-card' },
          el('span', { className: 'bv-panel-title', text: 'Active Book Author Identity & Key' }),
          el('div', { className: 'bv-field' }, el('label', { className: 'bv-label', text: 'Pen Name (Published Name)' }), penNameIn),
          el('div', { className: 'bv-field' }, el('label', { className: 'bv-label', text: 'Typed Signature' }), sigTextIn),
          el(
            'div',
            { className: 'bv-field' },
            el(
              'div',
              { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
              el('label', { className: 'bv-label', text: 'Handwritten Signature Pad' }),
              el('button', {
                className: 'bv-mini-btn',
                text: 'Clear Ink',
                attrs: { type: 'button' },
                on: {
                  click: () => {
                    sigCtx?.clearRect(0, 0, sigCanvas.width, sigCanvas.height);
                    actions.mutateProject((prev) => {
                      const next = normalizeProjectDefaults(prev);
                      next.authorIdentity!.signatureSvgDataUrl = '';
                      return next;
                    });
                  },
                },
              }),
            ),
            sigCanvas,
          ),
          el(
            'div',
            { style: { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' } },
            (() => {
              const origin = checkBookOriginDevice(activeBook);
              return el('div', {
                className: 'bv-mono-tag',
                text: `Author Key: ${identity.authorKeyId || 'Not created'} | Origin Device: ${origin.originDeviceId || origin.localDeviceId}`,
              });
            })(),
            ...(isKeyLocked
              ? [
                  el('span', {
                    className: 'qv-key-locked-pill',
                    text: checkBookOriginDevice(activeBook).isOriginDevice
                      ? 'Origin Device Match'
                      : 'External Copy',
                  }),
                ]
              : []),
          ),
          el('p', {
            className: 'bv-label',
            text: checkBookOriginDevice(activeBook).summary,
          }),
          ...(activeBook.copyrightOwnership
            ? [
                el('div', {
                  className: 'bv-mono-tag',
                  text: `Copyright Seal: ${activeBook.copyrightOwnership.sealId} | ${activeBook.copyrightOwnership.ownerName} (${activeBook.copyrightOwnership.rightsTerritory})`,
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
                          const penName = penNameIn.value.trim() || 'Author';
                          const pair = await generateAuthorKeyPair(penName);
                          actions.mutateProject((prev) => {
                            const next = normalizeProjectDefaults(prev);
                            next.author = penName;
                            next.authorIdentity = {
                              ...ensureAuthorIdentity(next),
                              penName,
                              ...pair,
                            };
                            return next;
                          });
                          renderBody(modalBody);
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
                    renderBody(modalBody);
                    actions.notify('Signed & sealed active book origin');
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
                    renderBody(modalBody);
                    actions.notify(`Registered Copyright Ownership Seal ${sealed.copyrightOwnership?.sealId ?? ''}`);
                  },
                },
              },
              icon('seal', 14),
              'Seal Work Copyright',
            ),
          ),
        ),
      ),
    );
  };

  const modalBody = el('div', { className: 'bv-modal-body' });
  renderBody(modalBody);

  const closeModal = () => backdrop.remove();
  const modal = el(
    'div',
    {
      className: 'bv-modal',
      attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Book Library and Author Identity' },
    },
    el(
      'div',
      { className: 'bv-panel-head' },
      el('span', { className: 'bv-panel-title', text: 'Multi-Book Library: Pen Name, Signature & Author Key' }),
      el('button', {
        className: 'bv-mini-btn',
        text: 'Close',
        attrs: { type: 'button' },
        on: { click: closeModal },
      }),
    ),
    modalBody,
  );

  const backdrop = el(
    'div',
    {
      className: 'bv-modal-backdrop',
      id: 'bv-library-modal',
      on: {
        click: (e) => {
          if (e.target === backdrop) closeModal();
        },
      },
    },
    modal,
  );

  document.body.appendChild(backdrop);
}
