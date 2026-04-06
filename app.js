// ---- Storage ----

const Store = {
  getFolders() {
    return JSON.parse(localStorage.getItem('jot_folders') || '[]');
  },
  saveFolders(folders) {
    localStorage.setItem('jot_folders', JSON.stringify(folders));
  },
  getFolderOrder() {
    return JSON.parse(localStorage.getItem('jot_folder_order') || 'null');
  },
  saveFolderOrder(order) {
    localStorage.setItem('jot_folder_order', JSON.stringify(order));
  },
  getOrderedFolders() {
    const folders = this.getFolders();
    const order = this.getFolderOrder();
    if (!order) return null; // no custom order yet
    const map = {};
    folders.forEach(f => map[f.id] = f);
    const ordered = order.filter(id => map[id]).map(id => map[id]);
    // Add any folders not in the order (new folders) at the top
    folders.forEach(f => { if (!order.includes(f.id)) ordered.unshift(f); });
    return ordered;
  },
  getMessages(folderId) {
    const all = JSON.parse(localStorage.getItem('jot_messages') || '{}');
    return all[folderId] || [];
  },
  saveMessages(folderId, messages) {
    const all = JSON.parse(localStorage.getItem('jot_messages') || '{}');
    all[folderId] = messages;
    localStorage.setItem('jot_messages', JSON.stringify(all));
  },
  deleteFolder(folderId) {
    const folders = this.getFolders().filter(f => f.id !== folderId);
    this.saveFolders(folders);
    const all = JSON.parse(localStorage.getItem('jot_messages') || '{}');
    delete all[folderId];
    localStorage.setItem('jot_messages', JSON.stringify(all));
    // Clean up order
    const order = this.getFolderOrder();
    if (order) this.saveFolderOrder(order.filter(id => id !== folderId));
    // Clean up archive
    const archive = JSON.parse(localStorage.getItem('jot_archive') || '{}');
    delete archive[folderId];
    localStorage.setItem('jot_archive', JSON.stringify(archive));
  },
  getAllMessages() {
    return JSON.parse(localStorage.getItem('jot_messages') || '{}');
  },
  // Archive
  getArchive(folderId) {
    const all = JSON.parse(localStorage.getItem('jot_archive') || '{}');
    return all[folderId] || [];
  },
  getAllArchive() {
    return JSON.parse(localStorage.getItem('jot_archive') || '{}');
  },
  archiveMessage(folderId, messageId) {
    const msgs = this.getMessages(folderId);
    const idx = msgs.findIndex(m => m.id === messageId);
    if (idx === -1) return;
    const [msg] = msgs.splice(idx, 1);
    this.saveMessages(folderId, msgs);
    const all = JSON.parse(localStorage.getItem('jot_archive') || '{}');
    if (!all[folderId]) all[folderId] = [];
    all[folderId].push(msg);
    localStorage.setItem('jot_archive', JSON.stringify(all));
  },
  restoreMessage(folderId, messageId) {
    const all = JSON.parse(localStorage.getItem('jot_archive') || '{}');
    const archived = all[folderId] || [];
    const idx = archived.findIndex(m => m.id === messageId);
    if (idx === -1) return;
    const [msg] = archived.splice(idx, 1);
    all[folderId] = archived;
    if (archived.length === 0) delete all[folderId];
    localStorage.setItem('jot_archive', JSON.stringify(all));
    const msgs = this.getMessages(folderId);
    msgs.push(msg);
    msgs.sort((a, b) => a.timestamp - b.timestamp);
    this.saveMessages(folderId, msgs);
  },
  permanentlyDeleteArchived(folderId, messageId) {
    const all = JSON.parse(localStorage.getItem('jot_archive') || '{}');
    const archived = all[folderId] || [];
    all[folderId] = archived.filter(m => m.id !== messageId);
    if (all[folderId].length === 0) delete all[folderId];
    localStorage.setItem('jot_archive', JSON.stringify(all));
  }
};

// ---- Router ----

function getRoute() {
  const hash = location.hash || '#/';
  if (hash.startsWith('#/thread/')) {
    return { view: 'thread', id: hash.replace('#/thread/', '') };
  }
  if (hash === '#/archive') {
    return { view: 'archive' };
  }
  if (hash.startsWith('#/archive/')) {
    return { view: 'archive-thread', id: hash.replace('#/archive/', '') };
  }
  if (hash === '#/new') {
    return { view: 'new' };
  }
  return { view: 'home' };
}

function navigate(hash) {
  location.hash = hash;
}

// ---- Time Formatting ----

function formatTime(ts) {
  const d = new Date(ts);
  const now = new Date();
  const diffMs = now - d;
  const diffDays = Math.floor(diffMs / 86400000);

  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  if (diffDays === 0) return time;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return d.toLocaleDateString([], { weekday: 'short' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function formatMessageTime(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function shouldShowTime(messages, index) {
  if (index === 0) return true;
  const gap = messages[index].timestamp - messages[index - 1].timestamp;
  return gap > 300000; // 5 minutes
}

// ---- Emojis ----

const EMOJIS = ['💡', '🎲', '📝', '💭', '🔥', '🎯', '🌟', '📖', '🎵', '🏃', '💻', '🍕'];

// ---- Render ----

const app = document.getElementById('app');

function render() {
  const route = getRoute();
  switch (route.view) {
    case 'home': renderHome(); break;
    case 'thread': renderThread(route.id); break;
    case 'archive': renderArchiveHome(); break;
    case 'archive-thread': renderArchiveThread(route.id); break;
    default: renderHome();
  }
}

// ---- Home View ----

function renderHome() {
  const allMessages = Store.getAllMessages();
  const allArchive = Store.getAllArchive();
  const hasArchive = Object.keys(allArchive).some(k => allArchive[k].length > 0);

  // Use custom order if available, otherwise sort by recency
  let folders = Store.getOrderedFolders();
  if (!folders) {
    folders = Store.getFolders();
    folders.sort((a, b) => {
      const aMsgs = allMessages[a.id] || [];
      const bMsgs = allMessages[b.id] || [];
      const aTime = aMsgs.length ? aMsgs[aMsgs.length - 1].timestamp : a.createdAt;
      const bTime = bMsgs.length ? bMsgs[bMsgs.length - 1].timestamp : b.createdAt;
      return bTime - aTime;
    });
  }

  app.innerHTML = `
    <div class="home-view">
      <div class="home-header">
        <div class="home-header-row">
          <h1>Jot</h1>
          ${hasArchive ? `<button class="archive-btn" id="archiveBtn">🗑</button>` : ''}
        </div>
        <div class="search-bar">
          <span class="search-icon">🔍</span>
          <input type="text" placeholder="Search thoughts..." id="searchInput" autocomplete="off">
          <span class="search-clear" id="searchClear">✕</span>
        </div>
      </div>
      <div class="folder-list" id="folderList">
        ${folders.length === 0 ? `
          <div class="empty-state">
            <div class="empty-icon">💭</div>
            <p>No folders yet.<br>Create one to start jotting.</p>
          </div>
        ` : folders.map(f => {
          const msgs = allMessages[f.id] || [];
          const last = msgs[msgs.length - 1];
          return `
            <div class="folder-item" data-id="${f.id}">
              <div class="folder-delete-action">Delete</div>
              <div class="folder-item-inner">
                <div class="folder-avatar">${f.emoji || '💭'}</div>
                <div class="folder-info">
                  <div class="folder-top-row">
                    <span class="folder-name">${escapeHtml(f.name)}</span>
                    <span class="folder-time">${last ? formatTime(last.timestamp) : formatTime(f.createdAt)}</span>
                  </div>
                  <div class="folder-preview">${last ? escapeHtml(last.text) : 'No messages yet'}</div>
                </div>
              </div>
            </div>`;
        }).join('')}
      </div>
      <button class="new-folder-btn" id="newFolderBtn">+ New Folder</button>
    </div>
  `;

  // Events
  if (hasArchive) {
    document.getElementById('archiveBtn').addEventListener('click', () => navigate('#/archive'));
  }

  setupFolderInteractions(folders);

  document.getElementById('newFolderBtn').addEventListener('click', showNewFolderModal);

  const searchInput = document.getElementById('searchInput');
  const searchClear = document.getElementById('searchClear');

  searchInput.addEventListener('input', () => {
    const q = searchInput.value.trim().toLowerCase();
    searchClear.classList.toggle('visible', q.length > 0);
    filterFolders(q, folders, allMessages);
  });

  searchClear.addEventListener('click', () => {
    searchInput.value = '';
    searchClear.classList.remove('visible');
    filterFolders('', folders, allMessages);
    searchInput.focus();
  });
}

// ---- Folder long-press reorder ----

function setupFolderInteractions(folders) {
  const items = document.querySelectorAll('.folder-item');
  let longPressTimer = null;
  let dragging = false;
  let dragEl = null;
  let dragPlaceholder = null;
  let startY = 0;
  let offsetY = 0;
  // Swipe state
  let swipeEl = null;
  let swipeStartX = 0;
  let swipeStartY = 0;
  let swipeDx = 0;
  let isSwiping = false;
  let swipeLocked = false;

  items.forEach(el => {
    el.addEventListener('touchstart', (e) => {
      // Init swipe tracking
      swipeEl = el;
      swipeStartX = e.touches[0].clientX;
      swipeStartY = e.touches[0].clientY;
      swipeDx = 0;
      isSwiping = false;
      swipeLocked = false;

      longPressTimer = setTimeout(() => {
        if (isSwiping) return; // Don't start drag if swiping
        e.preventDefault();
        dragging = true;
        dragEl = el;
        swipeEl = null; // Cancel swipe
        const rect = el.getBoundingClientRect();
        startY = e.touches[0].clientY;
        offsetY = startY - rect.top;

        dragPlaceholder = document.createElement('div');
        dragPlaceholder.className = 'folder-item-placeholder';
        dragPlaceholder.style.height = rect.height + 'px';
        el.parentNode.insertBefore(dragPlaceholder, el);

        el.classList.add('folder-dragging');
        el.style.width = rect.width + 'px';
        el.style.top = (rect.top) + 'px';
        el.style.left = rect.left + 'px';
        document.body.appendChild(el);
      }, 500);
    }, { passive: false });

    el.addEventListener('touchmove', (e) => {
      // Handle swipe
      if (swipeEl && !dragging) {
        const dx = e.touches[0].clientX - swipeStartX;
        const dy = e.touches[0].clientY - swipeStartY;

        if (!isSwiping && !swipeLocked && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) {
          if (Math.abs(dx) > Math.abs(dy) && dx < 0) {
            isSwiping = true;
            clearTimeout(longPressTimer);
          } else {
            swipeLocked = true; // vertical scroll, don't swipe
            clearTimeout(longPressTimer);
          }
        }

        if (isSwiping) {
          e.preventDefault();
          swipeDx = Math.max(-120, Math.min(0, dx));
          const inner = el.querySelector('.folder-item-inner') || el;
          inner.style.transform = `translateX(${swipeDx}px)`;
          inner.style.transition = 'none';

          // Show delete action behind
          const deleteAction = el.querySelector('.folder-delete-action');
          if (deleteAction) {
            deleteAction.style.opacity = Math.min(1, Math.abs(swipeDx) / 60);
          }
          return;
        }
      }

      // Handle drag reorder
      if (!dragging) {
        clearTimeout(longPressTimer);
        return;
      }
      e.preventDefault();
      const y = e.touches[0].clientY;
      dragEl.style.top = (y - offsetY) + 'px';

      const list = document.getElementById('folderList');
      const siblings = [...list.querySelectorAll('.folder-item:not(.folder-dragging), .folder-item-placeholder')];
      for (const sib of siblings) {
        const r = sib.getBoundingClientRect();
        if (y > r.top && y < r.bottom && sib !== dragPlaceholder) {
          if (y < r.top + r.height / 2) {
            list.insertBefore(dragPlaceholder, sib);
          } else {
            list.insertBefore(dragPlaceholder, sib.nextSibling);
          }
          break;
        }
      }
    }, { passive: false });

    el.addEventListener('touchend', () => {
      clearTimeout(longPressTimer);

      // Handle swipe end
      if (isSwiping && swipeEl) {
        const inner = el.querySelector('.folder-item-inner') || el;
        if (swipeDx < -60) {
          // Show delete state
          if (!el.classList.contains('folder-delete-ready')) {
            el.classList.add('folder-delete-ready');
            inner.style.transition = 'transform 0.25s ease';
            inner.style.transform = 'translateX(-80px)';
          } else {
            // Already showing delete — second swipe deletes
            inner.style.transition = 'transform 0.3s ease, opacity 0.3s ease';
            inner.style.transform = 'translateX(-400px)';
            inner.style.opacity = '0';
            const folderId = el.dataset.id;
            setTimeout(() => {
              Store.deleteFolder(folderId);
              render();
            }, 300);
          }
        } else {
          // Snap back
          el.classList.remove('folder-delete-ready');
          inner.style.transition = 'transform 0.25s ease';
          inner.style.transform = '';
          const deleteAction = el.querySelector('.folder-delete-action');
          if (deleteAction) deleteAction.style.opacity = '0';
          setTimeout(() => { inner.style.transition = ''; }, 250);
        }
        isSwiping = false;
        swipeEl = null;
        return;
      }

      // Handle drag end
      if (dragging) {
        dragging = false;
        const list = document.getElementById('folderList');
        el.classList.remove('folder-dragging');
        el.style.width = '';
        el.style.top = '';
        el.style.left = '';
        if (dragPlaceholder && dragPlaceholder.parentNode) {
          list.insertBefore(el, dragPlaceholder);
          dragPlaceholder.remove();
        }
        dragPlaceholder = null;
        dragEl = null;

        const newOrder = [...list.querySelectorAll('.folder-item')].map(item => item.dataset.id);
        Store.saveFolderOrder(newOrder);
        return;
      }

      // Normal tap — navigate (unless delete-ready, then reset)
      if (el.classList.contains('folder-delete-ready')) {
        el.classList.remove('folder-delete-ready');
        const inner = el.querySelector('.folder-item-inner') || el;
        inner.style.transition = 'transform 0.25s ease';
        inner.style.transform = '';
        const deleteAction = el.querySelector('.folder-delete-action');
        if (deleteAction) deleteAction.style.opacity = '0';
        setTimeout(() => { inner.style.transition = ''; }, 250);
        return;
      }
      navigate('#/thread/' + el.dataset.id);
    });

    el.addEventListener('touchcancel', () => {
      clearTimeout(longPressTimer);
      if (isSwiping && swipeEl) {
        const inner = el.querySelector('.folder-item-inner') || el;
        inner.style.transition = 'transform 0.25s ease';
        inner.style.transform = '';
        setTimeout(() => { inner.style.transition = ''; }, 250);
      }
      if (dragging && dragEl) {
        const list = document.getElementById('folderList');
        dragEl.classList.remove('folder-dragging');
        dragEl.style.width = '';
        dragEl.style.top = '';
        dragEl.style.left = '';
        if (dragPlaceholder && dragPlaceholder.parentNode) {
          list.insertBefore(dragEl, dragPlaceholder);
          dragPlaceholder.remove();
        }
      }
      dragging = false;
      isSwiping = false;
      dragPlaceholder = null;
      dragEl = null;
      swipeEl = null;
    });

    // Desktop: click to navigate
    el.addEventListener('click', (e) => {
      if (!('ontouchstart' in window)) {
        navigate('#/thread/' + el.dataset.id);
      }
    });
  });
}

function filterFolders(query, folders, allMessages) {
  const list = document.getElementById('folderList');
  if (!query) {
    // Re-render full list
    renderFolderList(list, folders, allMessages, '');
    return;
  }

  // Filter: match folder name or any message text
  const results = [];
  folders.forEach(f => {
    const nameMatch = f.name.toLowerCase().includes(query);
    const msgs = allMessages[f.id] || [];
    const matchingMsg = msgs.find(m => m.text.toLowerCase().includes(query));

    if (nameMatch || matchingMsg) {
      results.push({ folder: f, matchingMsg: matchingMsg && !nameMatch ? matchingMsg : null });
    }
  });

  if (results.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🔍</div>
        <p>No results found</p>
      </div>`;
    return;
  }

  list.innerHTML = results.map(({ folder: f, matchingMsg }) => {
    const msgs = allMessages[f.id] || [];
    const last = msgs[msgs.length - 1];
    const preview = matchingMsg
      ? `<span class="search-match-label">Match: </span>${highlightMatch(matchingMsg.text, query)}`
      : (last ? escapeHtml(last.text) : 'No messages yet');

    return `
      <div class="folder-item" data-id="${f.id}">
        <div class="folder-avatar">${f.emoji || '💭'}</div>
        <div class="folder-info">
          <div class="folder-top-row">
            <span class="folder-name">${highlightMatch(f.name, query)}</span>
            <span class="folder-time">${last ? formatTime(last.timestamp) : formatTime(f.createdAt)}</span>
          </div>
          <div class="folder-preview">${preview}</div>
        </div>
      </div>`;
  }).join('');

  list.querySelectorAll('.folder-item').forEach(el => {
    el.addEventListener('click', () => navigate('#/thread/' + el.dataset.id));
  });
}

function renderFolderList(list, folders, allMessages) {
  if (folders.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">💭</div>
        <p>No folders yet.<br>Create one to start jotting.</p>
      </div>`;
    return;
  }

  list.innerHTML = folders.map(f => {
    const msgs = allMessages[f.id] || [];
    const last = msgs[msgs.length - 1];
    return `
      <div class="folder-item" data-id="${f.id}">
        <div class="folder-delete-action">Delete</div>
        <div class="folder-item-inner">
          <div class="folder-avatar">${f.emoji || '💭'}</div>
          <div class="folder-info">
            <div class="folder-top-row">
              <span class="folder-name">${escapeHtml(f.name)}</span>
              <span class="folder-time">${last ? formatTime(last.timestamp) : formatTime(f.createdAt)}</span>
            </div>
            <div class="folder-preview">${last ? escapeHtml(last.text) : 'No messages yet'}</div>
          </div>
        </div>
      </div>`;
  }).join('');

  list.querySelectorAll('.folder-item').forEach(el => {
    el.addEventListener('click', () => navigate('#/thread/' + el.dataset.id));
  });
}

function highlightMatch(text, query) {
  const escaped = escapeHtml(text);
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return escaped;
  const before = escapeHtml(text.slice(0, idx));
  const match = escapeHtml(text.slice(idx, idx + query.length));
  const after = escapeHtml(text.slice(idx + query.length));
  return `${before}<mark>${match}</mark>${after}`;
}

// ---- New Folder Modal ----

function showNewFolderModal() {
  let selectedEmoji = EMOJIS[0];

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <h2>New Folder</h2>
      <input type="text" id="folderNameInput" placeholder="Folder name..." maxlength="40" autocomplete="off">
      <div class="emoji-picker">
        ${EMOJIS.map((e, i) => `<div class="emoji-option${i === 0 ? ' selected' : ''}" data-emoji="${e}">${e}</div>`).join('')}
      </div>
      <div class="modal-actions">
        <button class="cancel-btn" id="modalCancel">Cancel</button>
        <button class="create-btn" id="modalCreate" disabled>Create</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const nameInput = document.getElementById('folderNameInput');
  const createBtn = document.getElementById('modalCreate');

  nameInput.focus();

  nameInput.addEventListener('input', () => {
    createBtn.disabled = !nameInput.value.trim();
  });

  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && nameInput.value.trim()) {
      createFolder(nameInput.value.trim(), selectedEmoji);
      overlay.remove();
    }
  });

  overlay.querySelectorAll('.emoji-option').forEach(el => {
    el.addEventListener('click', () => {
      overlay.querySelector('.emoji-option.selected')?.classList.remove('selected');
      el.classList.add('selected');
      selectedEmoji = el.dataset.emoji;
    });
  });

  document.getElementById('modalCancel').addEventListener('click', () => overlay.remove());
  document.getElementById('modalCreate').addEventListener('click', () => {
    if (nameInput.value.trim()) {
      createFolder(nameInput.value.trim(), selectedEmoji);
      overlay.remove();
    }
  });

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });
}

function createFolder(name, emoji) {
  const folders = Store.getFolders();
  const folder = {
    id: 'f_' + Date.now(),
    name,
    emoji,
    createdAt: Date.now()
  };
  folders.unshift(folder);
  Store.saveFolders(folders);
  // Save explicit order now that user has folders
  Store.saveFolderOrder(folders.map(f => f.id));
  render();
}

// ---- Thread View ----

function renderMessageBubble(m) {
  const pinClass = m.pinned ? ' pinned' : '';
  return `<div class="message${pinClass}" data-id="${m.id}">
    <div class="message-bubble">${escapeHtml(m.text)}</div>
  </div>`;
}

function renderThread(folderId) {
  const folders = Store.getFolders();
  const folder = folders.find(f => f.id === folderId);

  if (!folder) {
    navigate('#/');
    return;
  }

  const messages = Store.getMessages(folderId);

  app.innerHTML = `
    <div class="thread-view" id="threadView">
      <div class="thread-header">
        <button class="back-btn" id="backBtn">← Back</button>
        <span class="thread-title">${escapeHtml(folder.name)}</span>
        <button class="focus-btn" id="focusBtn">◎</button>
      </div>
      <div class="messages" id="messagesContainer">
        ${messages.length === 0 ? `
          <div class="thread-empty">Jot your first thought...</div>
        ` : messages.map((m, i) => `
          ${shouldShowTime(messages, i) ? `<div class="message-time" >${formatMessageTime(m.timestamp)}</div>` : ''}
          ${renderMessageBubble(m)}
        `).join('')}
      </div>
      <div class="input-bar" id="inputBar">
        <textarea id="messageInput" placeholder="Jot something..." rows="1"></textarea>
        <button class="send-btn" id="sendBtn" disabled><span>↑</span></button>
      </div>
    </div>
  `;

  // Scroll to bottom
  const container = document.getElementById('messagesContainer');
  container.scrollTop = container.scrollHeight;

  // Events
  document.getElementById('backBtn').addEventListener('click', () => navigate('#/'));

  const input = document.getElementById('messageInput');
  const sendBtn = document.getElementById('sendBtn');

  // Auto-resize textarea
  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 120) + 'px';
    sendBtn.disabled = !input.value.trim();
  });

  // Enter inserts newline; send via button only

  sendBtn.addEventListener('click', () => {
    if (input.value.trim()) sendMessage(folderId, input);
  });

  // Setup swipe gestures on messages
  setupMessageSwipe(folderId);

  // Setup keyboard viewport handling
  setupKeyboardHandler();

  // Focus mode
  setupFocusMode(folderId);

  // Focus input
  input.focus();
}

// ---- Focus Mode ----

function setupFocusMode(folderId) {
  const focusBtn = document.getElementById('focusBtn');
  let focusActive = false;
  let overlay = null;

  focusBtn.addEventListener('click', () => {
    if (focusActive) {
      exitFocusMode();
    } else {
      enterFocusMode();
    }
  });

  function enterFocusMode() {
    const messages = Store.getMessages(folderId);
    const pinned = messages.filter(m => m.pinned);

    if (pinned.length === 0) return; // nothing to focus on

    focusActive = true;
    focusBtn.classList.add('focus-active');

    // Create overlay
    overlay = document.createElement('div');
    overlay.className = 'focus-overlay';
    overlay.innerHTML = `
      <div class="focus-backdrop"></div>
      <div class="focus-content">
        ${pinned.map(m => `
          <div class="focus-message">
            <div class="focus-bubble">${escapeHtml(m.text)}</div>
          </div>
        `).join('')}
      </div>
    `;

    const threadView = document.getElementById('threadView');
    threadView.appendChild(overlay);

    // Trigger animation on next frame
    requestAnimationFrame(() => {
      overlay.classList.add('focus-visible');
    });

    // Exit on backdrop tap
    overlay.querySelector('.focus-backdrop').addEventListener('click', exitFocusMode);
  }

  function exitFocusMode() {
    if (!overlay) return;
    focusActive = false;
    focusBtn.classList.remove('focus-active');

    overlay.classList.remove('focus-visible');
    overlay.classList.add('focus-exiting');

    overlay.addEventListener('transitionend', () => {
      if (overlay && overlay.parentNode) {
        overlay.remove();
      }
      overlay = null;
    }, { once: true });

    // Fallback removal
    setTimeout(() => {
      if (overlay && overlay.parentNode) {
        overlay.remove();
        overlay = null;
      }
    }, 400);
  }
}

// ---- Keyboard viewport handling ----

function setupKeyboardHandler() {
  if (!window.visualViewport) return;

  const threadView = document.getElementById('threadView');
  const inputBar = document.getElementById('inputBar');
  const container = document.getElementById('messagesContainer');
  let keyboardOpen = false;

  function onViewportChange() {
    const vv = window.visualViewport;
    const keyboardHeight = window.innerHeight - vv.height;

    if (keyboardHeight > 50) {
      // Keyboard open — offset the entire thread view up by keyboard height
      // and remove safe area padding since keyboard covers the bottom
      threadView.style.height = vv.height + 'px';
      inputBar.style.paddingBottom = '6px';
      inputBar.style.transition = 'none';

      if (!keyboardOpen) {
        keyboardOpen = true;
        // Scroll to bottom after keyboard settles
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            container.scrollTop = container.scrollHeight;
          });
        });
      }
    } else {
      // Keyboard closed
      threadView.style.height = '';
      inputBar.style.paddingBottom = '';
      inputBar.style.transition = '';
      keyboardOpen = false;
    }

    // Keep messages scrolled to bottom during keyboard resize
    container.scrollTop = container.scrollHeight;
  }

  // Use both resize and scroll events on visualViewport for smooth tracking
  window.visualViewport.addEventListener('resize', onViewportChange);
  window.visualViewport.addEventListener('scroll', onViewportChange);
}

// ---- Message swipe gestures ----

function setupMessageSwipe(folderId) {
  const container = document.getElementById('messagesContainer');
  let swipeEl = null;
  let startX = 0;
  let startY = 0;
  let currentX = 0;
  let swiping = false;
  let swipeDirection = null;

  container.addEventListener('touchstart', (e) => {
    const msgEl = e.target.closest('.message');
    if (!msgEl) return;
    swipeEl = msgEl;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    currentX = 0;
    swiping = false;
    swipeDirection = null;
  }, { passive: true });

  container.addEventListener('touchmove', (e) => {
    if (!swipeEl) return;
    const dx = e.touches[0].clientX - startX;
    const dy = e.touches[0].clientY - startY;

    // Determine direction on first significant movement
    if (!swiping && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) {
      if (Math.abs(dx) > Math.abs(dy)) {
        swiping = true;
        swipeDirection = dx > 0 ? 'right' : 'left';
      } else {
        // Vertical scroll — abort swipe
        swipeEl = null;
        return;
      }
    }

    if (!swiping) return;
    e.preventDefault();
    currentX = dx;

    // Only allow intended direction
    if (swipeDirection === 'left' && dx > 0) currentX = 0;
    if (swipeDirection === 'right' && dx < 0) currentX = 0;

    // Cap swipe distance
    currentX = Math.max(-120, Math.min(120, currentX));

    const bubble = swipeEl.querySelector('.message-bubble');
    bubble.style.transform = `translateX(${currentX}px)`;
    bubble.style.transition = 'none';

    // Show hint colors based on message state
    const hintPinned = swipeEl.classList.contains('pinned');
    if (swipeDirection === 'right' && currentX > 60) {
      // Right swipe: archive (yellow) or unpin (purple)
      swipeEl.style.background = hintPinned ? 'rgba(245, 217, 106, 0.15)' : 'rgba(224, 64, 64, 0.15)';
    } else if (swipeDirection === 'left' && currentX < -60 && !hintPinned) {
      // Left swipe on yellow: pin hint
      swipeEl.style.background = 'rgba(160, 100, 255, 0.15)';
    } else {
      swipeEl.style.background = '';
    }
  }, { passive: false });

  container.addEventListener('touchend', () => {
    if (!swipeEl || !swiping) {
      if (swipeEl) swipeEl = null;
      return;
    }

    const bubble = swipeEl.querySelector('.message-bubble');
    const msgId = swipeEl.dataset.id;
    const isPinned = swipeEl.classList.contains('pinned');

    if (swipeDirection === 'left' && currentX < -60 && !isPinned) {
      // Swipe left on yellow: pin it (turn purple)
      togglePin(folderId, msgId, true);
      swipeEl.classList.add('pinned');
    } else if (swipeDirection === 'right' && currentX > 60 && isPinned) {
      // Swipe right on purple: unpin it (turn yellow)
      togglePin(folderId, msgId, false);
      swipeEl.classList.remove('pinned');
    } else if (swipeDirection === 'right' && currentX > 60 && !isPinned) {
      // Swipe right on yellow: archive
      bubble.style.transition = 'transform 0.3s ease, opacity 0.3s ease';
      bubble.style.transform = 'translateX(400px)';
      bubble.style.opacity = '0';
      swipeEl.style.background = '';
      setTimeout(() => {
        Store.archiveMessage(folderId, msgId);
        renderThread(folderId);
      }, 300);
      swipeEl = null;
      return;
    }

    // Snap back
    bubble.style.transition = 'transform 0.25s ease';
    bubble.style.transform = '';
    swipeEl.style.background = '';
    setTimeout(() => {
      if (bubble) bubble.style.transition = '';
    }, 250);

    swipeEl = null;
    swiping = false;
    swipeDirection = null;
  });
}

function togglePin(folderId, messageId, pinned) {
  const messages = Store.getMessages(folderId);
  const msg = messages.find(m => m.id === messageId);
  if (msg) {
    msg.pinned = pinned;
    Store.saveMessages(folderId, messages);
  }
}

function sendMessage(folderId, input) {
  const text = input.value.trim();
  if (!text) return;

  const messages = Store.getMessages(folderId);
  messages.push({
    id: 'm_' + Date.now(),
    text,
    timestamp: Date.now()
  });
  Store.saveMessages(folderId, messages);

  // Clear and reset input
  input.value = '';
  input.style.height = 'auto';
  document.getElementById('sendBtn').disabled = true;

  // Re-render messages area only (keep input focused)
  const container = document.getElementById('messagesContainer');
  const emptyMsg = container.querySelector('.thread-empty');
  if (emptyMsg) emptyMsg.remove();

  // Check if we should show timestamp
  const showTime = shouldShowTime(messages, messages.length - 1);

  let html = '';
  if (showTime) {
    html += `<div class="message-time">${formatMessageTime(Date.now())}</div>`;
  }
  const msg = messages[messages.length - 1];
  const pinClass = msg.pinned ? ' pinned' : '';
  html += `<div class="message${pinClass} msg-new" data-id="${msg.id}">
    <div class="message-bubble">${escapeHtml(msg.text)}</div>
  </div>`;

  container.insertAdjacentHTML('beforeend', html);
  container.scrollTop = container.scrollHeight;

  input.focus();
}

// ---- Archive Views ----

function renderArchiveHome() {
  const folders = Store.getFolders();
  const allArchive = Store.getAllArchive();

  const foldersWithArchive = folders.filter(f => {
    const archived = allArchive[f.id];
    return archived && archived.length > 0;
  });

  app.innerHTML = `
    <div class="home-view">
      <div class="home-header">
        <div class="home-header-row">
          <button class="back-btn" id="archiveBackBtn">← Back</button>
          <h1 class="archive-title">Archive</h1>
        </div>
      </div>
      <div class="folder-list" id="folderList">
        ${foldersWithArchive.length === 0 ? `
          <div class="empty-state">
            <div class="empty-icon">🗑</div>
            <p>No archived messages.</p>
          </div>
        ` : foldersWithArchive.map(f => {
          const archived = allArchive[f.id] || [];
          const last = archived[archived.length - 1];
          return `
            <div class="folder-item" data-id="${f.id}">
              <div class="folder-avatar">${f.emoji || '💭'}</div>
              <div class="folder-info">
                <div class="folder-top-row">
                  <span class="folder-name">${escapeHtml(f.name)}</span>
                  <span class="folder-time">${archived.length} archived</span>
                </div>
                <div class="folder-preview">${last ? escapeHtml(last.text) : ''}</div>
              </div>
            </div>`;
        }).join('')}
      </div>
    </div>
  `;

  document.getElementById('archiveBackBtn').addEventListener('click', () => navigate('#/'));

  document.querySelectorAll('.folder-item').forEach(el => {
    el.addEventListener('click', () => navigate('#/archive/' + el.dataset.id));
  });
}

function renderArchiveThread(folderId) {
  const folders = Store.getFolders();
  const folder = folders.find(f => f.id === folderId);

  if (!folder) {
    navigate('#/archive');
    return;
  }

  const archived = Store.getArchive(folderId);

  app.innerHTML = `
    <div class="thread-view">
      <div class="thread-header">
        <button class="back-btn" id="backBtn">← Back</button>
        <span class="thread-title">${escapeHtml(folder.name)} - Archive</span>
      </div>
      <div class="messages" id="messagesContainer">
        ${archived.length === 0 ? `
          <div class="thread-empty">No archived messages</div>
        ` : archived.map((m, i) => `
          ${shouldShowTime(archived, i) ? `<div class="message-time" >${formatMessageTime(m.timestamp)}</div>` : ''}
          <div class="message archived-message" data-id="${m.id}">
            <div class="message-bubble archived-bubble">${escapeHtml(m.text)}</div>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  document.getElementById('backBtn').addEventListener('click', () => navigate('#/archive'));

}

// ---- Delete Confirmation ----

function showDeleteConfirm(folder) {
  const overlay = document.createElement('div');
  overlay.className = 'delete-confirm';
  overlay.innerHTML = `
    <div class="modal">
      <h2>Delete "${escapeHtml(folder.name)}"?</h2>
      <p>All messages in this folder will be permanently deleted.</p>
      <div class="modal-actions">
        <button class="cancel-btn" id="delCancel">Cancel</button>
        <button class="delete-btn" id="delConfirm">Delete</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  document.getElementById('delCancel').addEventListener('click', () => overlay.remove());
  document.getElementById('delConfirm').addEventListener('click', () => {
    Store.deleteFolder(folder.id);
    overlay.remove();
    navigate('#/');
  });
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });
}

// ---- Utilities ----

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ---- Init ----

window.addEventListener('hashchange', render);
render();
