/* ============================================================
   LumiChat · 主逻辑（Claude via ai.luogu.me）
   ============================================================ */

'use strict';

// ============================================================
// API 配置
// ============================================================

const API_CONFIG = {
  baseUrl: 'https://ai.luogu.me/v1',
};

// ============================================================
// 状态管理
// ============================================================

const State = {
  apiKey: 'sk-cSlJKXHKGlVc30ePtaSvhhHQS6saDyhQl0c3us6fRrBdBAeq',
  systemPrompt: '',
  temperature: 0.7,
  model: 'claude-sonnet-4-6',
  thinkingEnabled: false,  // Claude 模型暂不支持深度思考
  chats: {},           // { id: { title, messages: [] } }
  currentChatId: null,
  isStreaming: false,
  thinkingStreaming: false,
  abortController: null,
};

// ============================================================
// 本地存储工具
// ============================================================

const Storage = {
  save() {
    try {
      localStorage.setItem('lumichat_api_key', State.apiKey);
      localStorage.setItem('lumichat_system_prompt', State.systemPrompt);
      localStorage.setItem('lumichat_temperature', String(State.temperature));
      localStorage.setItem('lumichat_model', State.model);
      localStorage.setItem('lumichat_thinking', String(State.thinkingEnabled));
      localStorage.setItem('lumichat_chats', JSON.stringify(State.chats));
      localStorage.setItem('lumichat_current_chat', State.currentChatId || '');
      localStorage.setItem('lumichat_theme', document.body.classList.contains('dark-mode') ? 'dark' : 'light');
    } catch (e) {
      console.warn('Storage save failed:', e);
    }
  },

  load() {
    try {
      State.apiKey = localStorage.getItem('lumichat_api_key') || '';
      State.systemPrompt = localStorage.getItem('lumichat_system_prompt') || '';
      State.temperature = parseFloat(localStorage.getItem('lumichat_temperature') || '0.7');
      State.model = localStorage.getItem('lumichat_model') || 'claude-haiku-4-5';
      State.thinkingEnabled = localStorage.getItem('lumichat_thinking') !== 'false';

      const chatsRaw = localStorage.getItem('lumichat_chats');
      State.chats = chatsRaw ? JSON.parse(chatsRaw) : {};
      State.currentChatId = localStorage.getItem('lumichat_current_chat') || null;

      const theme = localStorage.getItem('lumichat_theme') || 'light';
      if (theme === 'dark') {
        document.body.classList.replace('light-mode', 'dark-mode');
        updateThemeHljsStylesheet('dark');
      }
    } catch (e) {
      console.warn('Storage load failed:', e);
    }
  },
};

// ============================================================
// DOM 引用
// ============================================================

const $ = id => document.getElementById(id);

const DOM = {
  sidebar: $('sidebar'),
  sidebarOverlay: $('sidebar-overlay'),
  btnMenu: $('btn-menu'),
  btnNewChat: $('btn-new-chat'),
  chatList: $('chat-list'),
  topbarTitle: $('topbar-title'),
  btnClearChat: $('btn-clear-chat'),
  chatArea: $('chat-area'),
  welcomeScreen: $('welcome-screen'),
  messages: $('messages'),
  modelSelector: $('model-selector'),
  thinkingToggle: $('thinking-toggle'),
  userInput: $('user-input'),
  btnSend: $('btn-send'),
  charCount: $('char-count'),
  btnSettings: $('btn-settings'),
  settingsModal: $('settings-modal'),
  btnCloseSettings: $('btn-close-settings'),
  btnCancelSettings: $('btn-cancel-settings'),
  btnSaveSettings: $('btn-save-settings'),
  apiKeyInput: $('api-key-input'),
  btnToggleKey: $('btn-toggle-key'),
  systemPromptInput: $('system-prompt-input'),
  temperatureInput: $('temperature-input'),
  temperatureValue: $('temperature-value'),
  toastContainer: $('toast-container'),
  btnToggleTheme: $('btn-toggle-theme'),
};

// ============================================================
// 工具函数
// ============================================================

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function formatTime(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

function sanitizeAndRender(markdown) {
  try {
    const html = marked.parse(markdown || '');
    return DOMPurify.sanitize(html, { ADD_ATTR: ['class'], FORBID_TAGS: ['script'] });
  } catch {
    return markdown;
  }
}

function addCopyButtons(container) {
  container.querySelectorAll('pre').forEach(pre => {
    if (pre.querySelector('.btn-copy-code')) return;
    const wrapper = document.createElement('div');
    wrapper.className = 'code-block-wrapper';
    pre.parentNode.insertBefore(wrapper, pre);
    wrapper.appendChild(pre);

    const btn = document.createElement('button');
    btn.className = 'btn-copy-code';
    btn.textContent = '复制';
    btn.addEventListener('click', () => {
      const code = pre.querySelector('code')?.innerText || pre.innerText;
      navigator.clipboard.writeText(code).then(() => {
        btn.textContent = '已复制！';
        setTimeout(() => (btn.textContent = '复制'), 2000);
      });
    });
    wrapper.appendChild(btn);
  });
}

function showToast(msg, type = 'info') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = type === 'success' ? '✅ ' + msg
    : type === 'error' ? '❌ ' + msg
    : 'ℹ️ ' + msg;
  DOM.toastContainer.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

function updateThemeHljsStylesheet(theme) {
  const el = document.getElementById('hljs-theme');
  if (!el) return;
  el.href = theme === 'dark'
    ? 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css'
    : 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github.min.css';
}

function extractTitle(text) {
  const t = text.trim().slice(0, 40);
  return t.length < text.trim().length ? t + '...' : t;
}

// ============================================================
// 配置 marked
// ============================================================

marked.setOptions({
  highlight(code, lang) {
    if (lang && hljs.getLanguage(lang)) {
      return hljs.highlight(code, { language: lang }).value;
    }
    return hljs.highlightAuto(code).value;
  },
  breaks: true,
  gfm: true,
});

// ============================================================
// 聊天管理
// ============================================================

function createNewChat() {
  const id = generateId();
  State.chats[id] = { title: '新建对话', messages: [], createdAt: Date.now() };
  State.currentChatId = id;
  Storage.save();
  renderChatList();
  renderMessages();
  DOM.topbarTitle.textContent = '新建对话';
  DOM.userInput.focus();
  return id;
}

function switchToChat(id) {
  if (!State.chats[id]) return;
  State.currentChatId = id;
  Storage.save();
  renderChatList();
  renderMessages();
  DOM.topbarTitle.textContent = State.chats[id].title;
}

function deleteChat(id) {
  delete State.chats[id];
  if (State.currentChatId === id) {
    const ids = Object.keys(State.chats);
    State.currentChatId = ids.length > 0 ? ids[ids.length - 1] : null;
  }
  Storage.save();
  renderChatList();
  if (State.currentChatId) {
    switchToChat(State.currentChatId);
  } else {
    renderMessages();
    DOM.topbarTitle.textContent = '新建对话';
  }
}

function clearCurrentChat() {
  if (!State.currentChatId || !State.chats[State.currentChatId]) return;
  State.chats[State.currentChatId].messages = [];
  State.chats[State.currentChatId].title = '新建对话';
  DOM.topbarTitle.textContent = '新建对话';
  Storage.save();
  renderMessages();
  showToast('对话已清空', 'success');
}

// ============================================================
// 渲染
// ============================================================

function escapeHTML(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function renderChatList() {
  DOM.chatList.innerHTML = '';
  const ids = Object.keys(State.chats).sort(
    (a, b) => (State.chats[b].createdAt || 0) - (State.chats[a].createdAt || 0)
  );

  if (ids.length === 0) {
    DOM.chatList.innerHTML = '<div style="padding:12px 10px;font-size:12.5px;color:var(--text-muted);text-align:center;">暂无历史对话</div>';
    return;
  }

  ids.forEach(id => {
    const chat = State.chats[id];
    const item = document.createElement('div');
    item.className = 'chat-item' + (id === State.currentChatId ? ' active' : '');
    item.innerHTML = `
      <span class="chat-item-icon">💬</span>
      <span class="chat-item-title">${escapeHTML(chat.title)}</span>
      <button class="chat-item-delete" data-id="${id}" title="删除">✕</button>
    `;
    item.addEventListener('click', e => {
      if (e.target.closest('.chat-item-delete')) {
        e.stopPropagation();
        deleteChat(id);
      } else {
        switchToChat(id);
        if (window.innerWidth <= 768) closeSidebar();
      }
    });
    DOM.chatList.appendChild(item);
  });
}

function renderMessages() {
  DOM.messages.innerHTML = '';
  const chat = State.currentChatId ? State.chats[State.currentChatId] : null;

  if (!chat || chat.messages.length === 0) {
    DOM.welcomeScreen.style.display = 'flex';
    DOM.messages.style.display = 'none';
  } else {
    DOM.welcomeScreen.style.display = 'none';
    DOM.messages.style.display = 'flex';
    chat.messages.forEach(msg => appendMessageToDOM(msg));
  }
}

function renderThinkingHTML(thinkingText) {
  // 将思考过程渲染为可折叠区域
  return `
    <details class="thinking-details">
      <summary class="thinking-summary">
        <span class="thinking-icon">💡</span> 深度思考过程
        <span class="thinking-toggle-icon">▼</span>
      </summary>
      <div class="thinking-content">${escapeHTML(thinkingText)}</div>
    </details>
  `;
}

function appendMessageToDOM(msg) {
  DOM.welcomeScreen.style.display = 'none';
  DOM.messages.style.display = 'flex';

  const div = document.createElement('div');
  div.className = `message ${msg.role}`;
  div.dataset.id = msg.id;

  const avatarChar = msg.role === 'user' ? '👤' : '✨';
  const bubbleClass = msg.isError ? 'message-bubble error-bubble' : 'message-bubble';

  let contentHTML;
  if (msg.role === 'ai') {
    // 若 AI 消息包含 thinking，渲染可折叠的思考过程
    let thinkingHTML = '';
    if (msg.thinking) {
      thinkingHTML = renderThinkingHTML(msg.thinking);
    }
    contentHTML = thinkingHTML + sanitizeAndRender(msg.content);
  } else {
    contentHTML = `<p>${escapeHTML(msg.content).replace(/\n/g, '<br/>')}</p>`;
  }

  div.innerHTML = `
    <div class="message-avatar">${avatarChar}</div>
    <div class="message-content">
      <div class="${bubbleClass}">${contentHTML}</div>
      <span class="message-time">${formatTime(msg.ts)}</span>
    </div>
  `;

  if (msg.role === 'ai') {
    addCopyButtons(div);
    div.querySelectorAll('pre code').forEach(el => hljs.highlightElement(el));
  }

  DOM.messages.appendChild(div);
  scrollToBottom();
}

function scrollToBottom(smooth = true) {
  DOM.chatArea.scrollTo({ top: DOM.chatArea.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
}

// ============================================================
// Claude API 调用（OpenAI 兼容格式 · SSE 流式）
// ============================================================

async function sendMessage(userText) {
  if (!userText.trim() || State.isStreaming) return;

  // 确保有当前对话
  if (!State.currentChatId) createNewChat();
  const chat = State.chats[State.currentChatId];

  // 检查 API Key
  if (!State.apiKey) {
    showToast('请先在设置中填写 API Key', 'error');
    openSettings();
    return;
  }

  // 添加用户消息
  const userMsg = {
    id: generateId(), role: 'user', content: userText, ts: Date.now()
  };
  chat.messages.push(userMsg);
  if (chat.title === '新建对话' && chat.messages.length === 1) {
    chat.title = extractTitle(userText);
    DOM.topbarTitle.textContent = chat.title;
  }
  appendMessageToDOM(userMsg);

  // 清空输入框
  DOM.userInput.value = '';
  DOM.userInput.style.height = 'auto';
  updateCharCount();

  // 显示加载动画
  const loadingId = generateId();
  showTypingIndicator(loadingId);

  State.isStreaming = true;
  State.thinkingStreaming = false;
  State.abortController = new AbortController();
  updateSendButton(true);

  try {
    // 构建消息列表
    const messages = [];
    if (State.systemPrompt) {
      messages.push({ role: 'system', content: State.systemPrompt });
    }
    // 只取最近 30 条
    const history = chat.messages.slice(-30);
    history.forEach(m => {
      if (m.role === 'ai') {
        messages.push({ role: 'assistant', content: m.content });
      } else {
        messages.push({ role: 'user', content: m.content });
      }
    });

    // 构建请求体
    const body = {
      model: State.model,
      messages,
      temperature: State.temperature,
      max_tokens: 8192,
      stream: true,
    };

    const response = await fetch(`${API_CONFIG.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${State.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: State.abortController.signal,
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      const msg = err?.error?.message || err?.msg || `HTTP ${response.status}`;
      throw new Error(msg);
    }

    // 移除加载动画，创建 AI 消息
    removeTypingIndicator(loadingId);

    const aiMsg = {
      id: generateId(),
      role: 'ai',
      content: '',
      thinking: '',
      ts: Date.now()
    };
    chat.messages.push(aiMsg);

    // 创建 AI 气泡用于流式更新
    const aiMsgDiv = createStreamingBubble(aiMsg.id);
    const bubbleEl = aiMsgDiv.querySelector('.message-bubble');

    // 读取 SSE 流
    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let thinkingText = '';
    let contentText = '';
    let hasThinking = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === 'data: [DONE]') continue;
        if (!trimmed.startsWith('data: ')) continue;

        try {
          const json = JSON.parse(trimmed.slice(6));
          const delta = json.choices?.[0]?.delta;
          if (!delta) continue;

          // 处理深度思考内容
          if (delta.reasoning_content) {
            if (!hasThinking) {
              hasThinking = true;
              thinkingText = delta.reasoning_content;
            } else {
              thinkingText += delta.reasoning_content;
            }
            // 实时渲染思考 + 内容
            aiMsg.thinking = thinkingText;
            const thinkingHTML = thinkingText ? renderThinkingHTML(thinkingText) : '';
            bubbleEl.innerHTML = thinkingHTML + sanitizeAndRender(contentText) + '<span class="cursor">▊</span>';
            scrollToBottom(false);
          }

          // 处理正式回复内容
          if (delta.content) {
            if (!contentText) {
              contentText = delta.content;
            } else {
              contentText += delta.content;
            }
            aiMsg.content = contentText;
            // 实时渲染
            const thinkingHTML = thinkingText ? renderThinkingHTML(thinkingText) : '';
            bubbleEl.innerHTML = thinkingHTML + sanitizeAndRender(contentText) + '<span class="cursor">▊</span>';
            scrollToBottom(false);
          }
        } catch {
          // 跳过非 JSON 行
        }
      }
    }

    // 最终渲染（去掉光标）
    aiMsg.content = contentText;
    aiMsg.thinking = thinkingText;
    const thinkingHTML = thinkingText ? renderThinkingHTML(thinkingText) : '';
    bubbleEl.innerHTML = thinkingHTML + sanitizeAndRender(contentText);
    addCopyButtons(aiMsgDiv);
    aiMsgDiv.querySelectorAll('pre code').forEach(el => hljs.highlightElement(el));
    scrollToBottom();

  } catch (err) {
    removeTypingIndicator(loadingId);

    if (err.name === 'AbortError') {
      // 用户手动停止
      const lastMsg = chat.messages[chat.messages.length - 1];
      if (lastMsg?.role === 'ai' && !lastMsg.content && !lastMsg.thinking) {
        chat.messages.pop();
        const streamDiv = DOM.messages.querySelector(`[data-id="${lastMsg.id}"]`);
        streamDiv?.remove();
      }
      showToast('已停止生成', 'info');
    } else {
      // 错误消息
      const errMsg = {
        id: generateId(), role: 'ai',
        content: `**错误：** ${err.message}\n\n请检查 API Key 是否有效，或稍后重试。`,
        ts: Date.now(), isError: true,
      };
      chat.messages.push(errMsg);
      appendMessageToDOM(errMsg);
      showToast(err.message, 'error');
    }
  } finally {
    State.isStreaming = false;
    State.thinkingStreaming = false;
    State.abortController = null;
    updateSendButton(false);
    Storage.save();
    renderChatList();
  }
}

function showTypingIndicator(id) {
  DOM.welcomeScreen.style.display = 'none';
  DOM.messages.style.display = 'flex';

  const div = document.createElement('div');
  div.className = 'message ai';
  div.dataset.id = id;
  div.innerHTML = `
    <div class="message-avatar">✨</div>
    <div class="message-content">
      <div class="message-bubble">
        <div class="typing-indicator">
          <div class="typing-dot"></div>
          <div class="typing-dot"></div>
          <div class="typing-dot"></div>
        </div>
      </div>
    </div>
  `;
  DOM.messages.appendChild(div);
  scrollToBottom();
}

function removeTypingIndicator(id) {
  const el = DOM.messages.querySelector(`[data-id="${id}"]`);
  el?.remove();
}

function createStreamingBubble(id) {
  const div = document.createElement('div');
  div.className = 'message ai';
  div.dataset.id = id;
  div.innerHTML = `
    <div class="message-avatar">✨</div>
    <div class="message-content">
      <div class="message-bubble"></div>
      <span class="message-time">${formatTime(Date.now())}</span>
    </div>
  `;
  DOM.messages.appendChild(div);
  scrollToBottom();
  return div;
}

function updateSendButton(isLoading) {
  const btn = DOM.btnSend;
  if (isLoading) {
    btn.classList.add('loading');
    btn.disabled = false;
    btn.title = '停止生成';
    btn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="currentColor">
        <rect x="6" y="6" width="12" height="12" rx="2"/>
      </svg>
    `;
    btn.onclick = () => {
      State.abortController?.abort();
    };
  } else {
    btn.classList.remove('loading');
    btn.title = '发送';
    btn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
      </svg>
    `;
    btn.onclick = handleSend;
    updateSendButtonState();
  }
}

// ============================================================
// 输入区域逻辑
// ============================================================

function updateCharCount() {
  const len = DOM.userInput.value.length;
  const max = 20000;
  DOM.charCount.textContent = `${len} / ${max}`;
  DOM.charCount.className = 'char-count' +
    (len >= max ? ' at-limit' : len >= max * 0.9 ? ' near-limit' : '');
}

function updateSendButtonState() {
  DOM.btnSend.disabled = DOM.userInput.value.trim().length === 0 || State.isStreaming;
}

function autoResizeTextarea() {
  const el = DOM.userInput;
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 180) + 'px';
}

function handleSend() {
  const text = DOM.userInput.value.trim();
  if (!text || State.isStreaming) return;
  sendMessage(text);
}

// ============================================================
// 侧边栏控制
// ============================================================

function openSidebar() {
  DOM.sidebar.classList.add('open');
  DOM.sidebarOverlay.classList.add('open');
}

function closeSidebar() {
  DOM.sidebar.classList.remove('open');
  DOM.sidebarOverlay.classList.remove('open');
}

// ============================================================
// 设置弹窗
// ============================================================

function openSettings() {
  DOM.apiKeyInput.value = State.apiKey;
  DOM.systemPromptInput.value = State.systemPrompt;
  DOM.temperatureInput.value = State.temperature;
  DOM.temperatureValue.textContent = State.temperature;
  DOM.settingsModal.classList.add('open');
  DOM.settingsModal.setAttribute('aria-hidden', 'false');
}

function closeSettings() {
  DOM.settingsModal.classList.remove('open');
  DOM.settingsModal.setAttribute('aria-hidden', 'true');
}

function saveSettings() {
  State.apiKey = DOM.apiKeyInput.value.trim();
  State.systemPrompt = DOM.systemPromptInput.value.trim();
  State.temperature = parseFloat(DOM.temperatureInput.value);
  Storage.save();
  closeSettings();
  showToast('设置已保存', 'success');
}

// ============================================================
// 事件绑定
// ============================================================

function bindEvents() {
  // 发送
  DOM.btnSend.addEventListener('click', handleSend);

  // 输入框
  DOM.userInput.addEventListener('input', () => {
    updateCharCount();
    updateSendButtonState();
    autoResizeTextarea();
  });

  DOM.userInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  });

  // 建议卡片
  document.querySelectorAll('.suggestion-card').forEach(card => {
    card.addEventListener('click', () => {
      const prompt = card.dataset.prompt;
      if (!State.currentChatId) createNewChat();
      DOM.userInput.value = prompt;
      updateCharCount();
      updateSendButtonState();
      autoResizeTextarea();
      DOM.userInput.focus();
      sendMessage(prompt);
    });
  });

  // 新建对话
  DOM.btnNewChat.addEventListener('click', () => {
    createNewChat();
    if (window.innerWidth <= 768) closeSidebar();
  });

  // 清空对话
  DOM.btnClearChat.addEventListener('click', clearCurrentChat);

  // 侧边栏
  DOM.btnMenu.addEventListener('click', () => {
    DOM.sidebar.classList.contains('open') ? closeSidebar() : openSidebar();
  });
  DOM.sidebarOverlay.addEventListener('click', closeSidebar);

  // 设置
  DOM.btnSettings.addEventListener('click', openSettings);
  DOM.btnCloseSettings.addEventListener('click', closeSettings);
  DOM.btnCancelSettings.addEventListener('click', closeSettings);
  DOM.btnSaveSettings.addEventListener('click', saveSettings);

  // 点击弹窗外关闭
  DOM.settingsModal.addEventListener('click', e => {
    if (e.target === DOM.settingsModal) closeSettings();
  });

  // API Key 可见性切换
  DOM.btnToggleKey.addEventListener('click', () => {
    const input = DOM.apiKeyInput;
    input.type = input.type === 'password' ? 'text' : 'password';
  });

  // 温度滑块
  DOM.temperatureInput.addEventListener('input', () => {
    DOM.temperatureValue.textContent = DOM.temperatureInput.value;
  });

  // 模型选择
  DOM.modelSelector.addEventListener('change', () => {
    State.model = DOM.modelSelector.value;
    Storage.save();
    showToast(`已切换到 ${DOM.modelSelector.options[DOM.modelSelector.selectedIndex].text}`, 'info');
  });

  // 深度思考开关
  if (DOM.thinkingToggle) {
    DOM.thinkingToggle.addEventListener('change', () => {
      State.thinkingEnabled = DOM.thinkingToggle.checked;
      Storage.save();
      showToast(State.thinkingEnabled ? '已开启深度思考模式' : '已关闭深度思考模式', 'info');
    });
  }

  // 主题切换
  DOM.btnToggleTheme.addEventListener('click', () => {
    const isDark = document.body.classList.contains('dark-mode');
    if (isDark) {
      document.body.classList.replace('dark-mode', 'light-mode');
      updateThemeHljsStylesheet('light');
      showToast('已切换到浅色主题', 'info');
    } else {
      document.body.classList.replace('light-mode', 'dark-mode');
      updateThemeHljsStylesheet('dark');
      showToast('已切换到深色主题', 'info');
    }
    Storage.save();
  });

  // Escape 关闭弹窗
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeSettings();
  });
}

// ============================================================
// 初始化
// ============================================================

function init() {
  Storage.load();
  bindEvents();

  // 设置模型选择器
  DOM.modelSelector.value = State.model;

  // 设置深度思考开关
  if (DOM.thinkingToggle) {
    DOM.thinkingToggle.checked = State.thinkingEnabled;
  }

  // 渲染聊天列表
  renderChatList();

  // 渲染当前对话（若有）
  if (State.currentChatId && State.chats[State.currentChatId]) {
    renderMessages();
    DOM.topbarTitle.textContent = State.chats[State.currentChatId].title;
  } else {
    DOM.welcomeScreen.style.display = 'flex';
    DOM.messages.style.display = 'none';
  }

  // 无 API Key 提示
  if (!State.apiKey) {
    const banner = document.createElement('div');
    banner.className = 'api-key-banner';
    banner.id = 'api-key-banner';
    banner.innerHTML = `⚠️ 需要配置智谱 GLM API Key 才能使用。<a href="#" id="banner-settings-link">点击设置 →</a>`;
    DOM.chatArea.insertBefore(banner, DOM.chatArea.firstChild);
    document.getElementById('banner-settings-link').addEventListener('click', e => {
      e.preventDefault();
      openSettings();
    });
  }

  // 自动聚焦
  DOM.userInput.focus();
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', init);
