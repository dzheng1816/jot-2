// ---- Storage ----

const Store = {
  getFolders() {
    return JSON.parse(localStorage.getItem('jot_folders') || '[]');
  },
  saveFolders(folders) {
    localStorage.setItem('jot_folders', JSON.stringify(folders));
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
  },
  getAllMessages() {
    return JSON.parse(localStorage.getItem('jot_messages') || '{}');
  }
};

// ---- Router ----

function getRoute() {
  const hash = location.hash || '#/';
  if (hash.startsWith('#/thread/')) {
    return { view: 'thread', id: hash.replace('#/thread/', '') };
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
    default: renderHome();
  }
}

// ---- Home View ----

function renderHome() {
  const folders = Store.getFolders();
  const allMessages = Store.getAllMessages();

  // Sort folders by most recent message, then creation date
  folders.sort((a, b) => {
    const aMsgs = allMessages[a.id] || [];
    const bMsgs = allMessages[b.id] || [];
    const aTime = aMsgs.length ? aMsgs[aMsgs.length - 1].timestamp : a.createdAt;
    const bTime = bMsgs.length ? bMsgs[bMsgs.length - 1].timestamp : b.createdAt;
    return bTime - aTime;
  });

  app.innerHTML = `
    <div class="home-view">
      <div class="home-header">
        <h1>Jot</h1>
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
              <div class="folder-avatar">${f.emoji || '💭'}</div>
              <div class="folder-info">
                <div class="folder-top-row">
                  <span class="folder-name">${escapeHtml(f.name)}</span>
                  <span class="folder-time">${last ? formatTime(last.timestamp) : formatTime(f.createdAt)}</span>
                </div>
                <div class="folder-preview">${last ? escapeHtml(last.text) : 'No messages yet'}</div>
              </div>
            </div>`;
        }).join('')}
      </div>
      <button class="new-folder-btn" id="newFolderBtn">+ New Folder</button>
    </div>
  `;

  // Events
  document.querySelectorAll('.folder-item').forEach(el => {
    el.addEventListener('click', () => navigate('#/thread/' + el.dataset.id));
  });

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
        <div class="folder-avatar">${f.emoji || '💭'}</div>
        <div class="folder-info">
          <div class="folder-top-row">
            <span class="folder-name">${escapeHtml(f.name)}</span>
            <span class="folder-time">${last ? formatTime(last.timestamp) : formatTime(f.createdAt)}</span>
          </div>
          <div class="folder-preview">${last ? escapeHtml(last.text) : 'No messages yet'}</div>
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
  folders.push(folder);
  Store.saveFolders(folders);
  navigate('#/thread/' + folder.id);
}

// ---- Thread View ----

function renderThread(folderId) {
  const folders = Store.getFolders();
  const folder = folders.find(f => f.id === folderId);

  if (!folder) {
    navigate('#/');
    return;
  }

  const messages = Store.getMessages(folderId);

  app.innerHTML = `
    <div class="thread-view">
      <div class="thread-header">
        <button class="back-btn" id="backBtn">← Back</button>
        <span class="thread-title">${escapeHtml(folder.name)}</span>
        <button class="thread-delete-btn" id="deleteBtn">🗑</button>
      </div>
      <div class="messages" id="messagesContainer">
        ${messages.length === 0 ? `
          <div class="thread-empty">Jot your first thought...</div>
        ` : messages.map((m, i) => `
          ${shouldShowTime(messages, i) ? `<div class="message-time" style="text-align: center; color: var(--text-muted); font-size: 11px; margin: 12px 0 4px;">${formatMessageTime(m.timestamp)}</div>` : ''}
          <div class="message">
            <div class="message-bubble">${escapeHtml(m.text)}</div>
          </div>
        `).join('')}
      </div>
      <div class="input-bar">
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

  document.getElementById('deleteBtn').addEventListener('click', () => {
    showDeleteConfirm(folder);
  });

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

  // Focus input
  input.focus();
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
    html += `<div class="message-time" style="text-align: center; color: var(--text-muted); font-size: 11px; margin: 12px 0 4px;">${formatMessageTime(Date.now())}</div>`;
  }
  html += `
    <div class="message">
      <div class="message-bubble">${escapeHtml(text)}</div>
    </div>
  `;

  container.insertAdjacentHTML('beforeend', html);
  container.scrollTop = container.scrollHeight;

  input.focus();
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
