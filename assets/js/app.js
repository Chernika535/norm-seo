/* =============================================================
   NormSEO — интерфейс и связка с движком
   ============================================================= */

(function (D, E, R) {
  'use strict';

  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));

  const state = {
    mode: 'topic',            // 'topic' | 'text'
    platforms: ['seo']        // выбранные платформы
  };

  let lastRun = { mode: 'topic', value: '' };

  /* ---------- Рендер чипов платформ ---------- */
  function renderPlatformChips() {
    const wrap = $('#platforms');
    wrap.innerHTML = '';
    Object.values(D.PLATFORMS).forEach(p => {
      const chip = document.createElement('button');
      chip.className = 'chip';
      chip.type = 'button';
      chip.dataset.key = p.key;
      chip.style.setProperty('--accent', p.accent);
      chip.innerHTML = `<span class="chip-emoji">${p.emoji}</span><span>${p.name}</span>`;
      if (state.platforms.includes(p.key)) chip.classList.add('active');
      chip.title = p.tagline;
      chip.addEventListener('click', () => togglePlatform(p.key));
      wrap.appendChild(chip);
    });
  }

  function togglePlatform(key) {
    const i = state.platforms.indexOf(key);
    if (i >= 0) {
      if (state.platforms.length > 1) state.platforms.splice(i, 1);
    } else {
      state.platforms.push(key);
    }
    renderPlatformChips();
  }

  /* ---------- Переключение режима ---------- */
  function setMode(mode) {
    state.mode = mode;
    $$('.mode-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
    const input = $('#mainInput');
    if (mode === 'topic') {
      $('#modeHint').textContent = 'Введите тему или ключевую фразу — подберём ключи и запросы аудитории.';
      input.placeholder = 'Например: керамическая посуда ручной работы';
      input.classList.remove('tall');
    } else {
      $('#modeHint').textContent = 'Вставьте готовый текст — проанализируем и подскажем, какие ключи добавить.';
      input.placeholder = 'Вставьте сюда статью, описание, резюме, подпись к посту…';
      input.classList.add('tall');
    }
  }

  /* ---------- Копирование ---------- */
  function copyText(text, btn) {
    navigator.clipboard.writeText(text).then(() => {
      const old = btn.textContent;
      btn.textContent = '✓';
      btn.classList.add('copied');
      setTimeout(() => { btn.textContent = old; btn.classList.remove('copied'); }, 1200);
    }).catch(() => {});
  }

  /* ---------- Рендер результатов ---------- */
  function platformHeader(p) {
    return `<div class="pf-head" style="--accent:${p.accent}">
      <span class="pf-emoji">${p.emoji}</span>
      <div><h3>${p.name}</h3><p>${p.tagline}</p></div>
    </div>`;
  }

  function renderBucket(b) {
    const items = b.items.map(it => {
      if (it && typeof it === 'object' && it.text) {
        const lab = it.label ? `<div class="kw-vlabel">${escapeHtml(it.label)}</div>` : '';
        return `<li class="kw-long kw-labeled">${lab}<span>${escapeHtml(it.text)}</span><button class="copy-mini" title="Копировать">⧉</button></li>`;
      }
      const long = String(it).length > 90;
      return `<li${long ? ' class="kw-long"' : ''}><span>${escapeHtml(it)}</span><button class="copy-mini" title="Копировать">⧉</button></li>`;
    }).join('');
    const allText = b.items.map(it => (it && typeof it === 'object' && it.text) ? it.text : it).join('\n');
    return `<div class="bucket">
      <div class="bucket-title">${escapeHtml(b.title)}
        <button class="copy-all" data-all="${escapeHtml(allText)}">Копировать все</button>
      </div>
      <ul class="kw-list">${items}</ul>
    </div>`;
  }

  function renderMetric(m) {
    return `<div class="metric metric-${m.status}">
      <div class="metric-val">${escapeHtml(String(m.value))}</div>
      <div class="metric-label">${escapeHtml(m.label)}</div>
      <div class="metric-hint">${escapeHtml(m.hint)}</div>
    </div>`;
  }

  function promptZone(key) {
    return `<div class="prompt-zone" data-key="${key}">
      <button class="btn-prompt" type="button">✨ Создать промпт</button>
      <p class="prompt-status" role="status" aria-live="polite"></p>
      <div class="prompt-box" hidden>
        <div class="prompt-head">
          <span>Готовый промпт — вставьте в ChatGPT, Gemini или другой ИИ-чат</span>
          <button class="copy-prompt" type="button">Копировать</button>
        </div>
        <textarea class="prompt-text" readonly rows="10"></textarea>
      </div>
    </div>`;
  }

  const SKELETON = `<div class="skeleton">${'<span></span>'.repeat(6)}</div>`;

  function sourceBadge(kind) {
    if (kind === 'ai') return '<span class="src src-ai">🪄 подобрано ИИ</span>';
    if (kind === 'loading') return '<span class="src src-load">🪄 ИИ думает…</span>';
    if (kind === 'fallback') return '<span class="src src-fb">черновой режим</span>';
    if (kind === 'error') return '<span class="src src-fb">⚠️ ИИ недоступен — локальный текст не подставлен</span>';
    return '';
  }

  function cardShell(p, inner) {
    return `<section class="card">
      ${platformHeader(p)}
      ${inner}
      <div class="buckets" id="bk-${p.key}">${SKELETON}</div>
      <div class="src-slot" id="src-${p.key}">${sourceBadge('loading')}</div>
      ${promptZone(p.key)}
    </section>`;
  }

  function renderCardTopic(p) { return cardShell(p, ''); }

  function renderCardText(p, res) {
    const metrics = res.metrics.map(renderMetric).join('');
    const recs = res.recs.map(r => `<li>${escapeHtml(r)}</li>`).join('');
    const inner = `<div class="metrics">${metrics}</div>` +
      (res.recs.length ? `<div class="recs"><h4>Рекомендации</h4><ul>${recs}</ul></div>` : '');
    return cardShell(p, inner);
  }

  /* ---------- Клиент ИИ (бесплатно, без ключа; ключ Groq — опционально) ---------- */
  async function requestAI(url, opts, timeoutMs) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const response = await fetch(url, Object.assign({}, opts, { signal: ctrl.signal }));
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const data = await response.json();
        return (data.choices && data.choices[0] && data.choices[0].message.content) || JSON.stringify(data);
      }
      return await response.text();
    } finally { clearTimeout(timer); }
  }

  async function askAI(messages) {
    const key = localStorage.getItem('ns_groq_key');
    if (window.NS_AI_CLIENT) return window.NS_AI_CLIENT.ask(messages, key);
    if (key) {
      return requestAI('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile', temperature: 0.7,
          response_format: { type: 'json_object' }, messages
        })
      }, 45000);
    }

    // Pollinations принимает базовый OpenAI-совместимый набор полей, но на
    // части публичных маршрутов отклоняет `response_format`. JSON всё равно
    // запрошен системной инструкцией, поэтому не добавляем несовместимое поле.
    const payload = { model: 'openai', temperature: 0.7, private: true, messages };
    try {
      return await requestAI('https://text.pollinations.ai/openai', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(payload)
      }, 45000);
    } catch (postError) {
      // Запасной публичный endpoint Pollinations особенно полезен, когда
      // OpenAI-совместимый маршрут временно недоступен. URL ограничиваем,
      // чтобы не отправлять большие книги через query string.
      const prompt = messages.map(m => `${m.role}: ${m.content}`).join('\n\n');
      if (prompt.length > 6000) throw postError;
      const url = 'https://text.pollinations.ai/' + encodeURIComponent(prompt) +
        '?model=openai&seed=' + Date.now();
      return requestAI(url, { headers: { Accept: 'text/plain' } }, 45000);
    }
  }

  function offlineBuckets(mode, key, value) {
    if (mode === 'topic') return E.generateByTopic(value, key);
    const res = E.analyzeText(value, key);
    return res ? res.buckets : [];
  }

  async function fillCard(key, mode, value, smart) {
    const bk = document.getElementById('bk-' + key);
    const src = document.getElementById('src-' + key);
    if (!bk) return;
    let groups = null, kind = smart ? 'error' : '';
    if (smart) {
      try {
        const { system, user } = E.buildAIMessages(mode, key, value);
        const text = await askAI([{ role: 'system', content: system }, { role: 'user', content: user }]);
        groups = E.parseAIGroups(text, key, value);
        if (groups) kind = 'ai';
      } catch (e) { groups = null; }
    }
    // Умный режим должен показывать только результат провайдера ИИ. Локальная
    // эвристика допустима лишь когда пользователь сам выключил умный режим.
    if (!groups && !smart) groups = offlineBuckets(mode, key, value);
    if (!groups) groups = [{ title: 'Ответ ИИ недоступен', items: ['Не удалось получить ответ ИИ. Проверьте соединение и повторите анализ.'] }];
    bk.innerHTML = groups.map(renderBucket).join('');
    if (src) src.innerHTML = sourceBadge(kind);
    wireCopyWithin(bk);
  }

  async function run() {
    const value = $('#mainInput').value.trim();
    const out = $('#results');
    const empty = $('#emptyState');

    if (!value) {
      out.innerHTML = '';
      empty.style.display = 'flex';
      empty.querySelector('p').textContent = 'Введите данные и нажмите «Анализировать».';
      return;
    }
    empty.style.display = 'none';
    lastRun = { mode: state.mode, value };
    const smart = $('#smartToggle').checked;

    const cards = state.platforms.map(key => {
      const p = D.PLATFORMS[key];
      if (state.mode === 'topic') return renderCardTopic(p);
      const res = E.analyzeText(value, key);
      return res ? renderCardText(p, res) : '';
    });

    out.innerHTML = cards.join('');
    wirePromptZones();
    if (!smart) $$('.src-slot').forEach(s => s.innerHTML = '');
    out.scrollIntoView({ behavior: 'smooth', block: 'start' });

    // асинхронно наполняем каждую карточку
    state.platforms.forEach(key => fillCard(key, state.mode, value, smart));
  }

  function wireCopyWithin(root) {
    root.querySelectorAll('.copy-mini').forEach(btn => {
      btn.addEventListener('click', () => copyText(btn.previousElementSibling.textContent, btn));
    });
    root.querySelectorAll('.copy-all').forEach(btn => {
      btn.addEventListener('click', () => copyText(btn.dataset.all, btn));
    });
  }

  function wirePromptZones() {
    $$('.prompt-zone').forEach(zone => {
      const key = zone.dataset.key;
      const toggle = zone.querySelector('.btn-prompt');
      const box = zone.querySelector('.prompt-box');
      const ta = zone.querySelector('.prompt-text');
      const copyBtn = zone.querySelector('.copy-prompt');
      const status = zone.querySelector('.prompt-status');
      toggle.addEventListener('click', () => {
        const open = box.hasAttribute('hidden');
        if (open) {
          let prompt;
          try {
            prompt = E.buildPrompt(lastRun.mode, key, lastRun.value);
          } catch (e) {
            prompt = '';
          }
          if (typeof prompt !== 'string' || !prompt.trim()) {
            status.textContent = '⚠️ Не удалось создать промпт. Попробуйте повторить анализ.';
            status.className = 'prompt-status prompt-status-error';
            return;
          }
          ta.value = prompt;
          box.removeAttribute('hidden');
          toggle.classList.add('open');
          toggle.textContent = '✨ Промпт готов — ниже';
          status.textContent = '✓ Промпт готов.';
          status.className = 'prompt-status prompt-status-success';
          ta.focus();
          ta.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        } else {
          box.setAttribute('hidden', '');
          toggle.classList.remove('open');
          toggle.textContent = '✨ Создать промпт';
          status.textContent = '';
          status.className = 'prompt-status';
        }
      });
      copyBtn.addEventListener('click', () => copyText(ta.value, copyBtn));
    });
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  /* ---------- Инициализация ---------- */
  function init() {
    renderPlatformChips();
    setMode('topic');

    $$('.mode-btn').forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));
    $('#runBtn').addEventListener('click', run);
    $('#mainInput').addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') run();
    });

    // умный режим: помним выбор
    const smart = $('#smartToggle');
    if (localStorage.getItem('ns_smart') === '0') smart.checked = false;
    smart.addEventListener('change', () => localStorage.setItem('ns_smart', smart.checked ? '1' : '0'));

    // опциональный ключ API
    const keyInput = $('#apiKey');
    const savedKey = localStorage.getItem('ns_groq_key');
    if (savedKey) keyInput.value = savedKey;
    $('#saveKey').addEventListener('click', () => {
      const v = keyInput.value.trim();
      if (v) localStorage.setItem('ns_groq_key', v); else localStorage.removeItem('ns_groq_key');
      const btn = $('#saveKey'); btn.textContent = '✓ Сохранено';
      setTimeout(() => btn.textContent = 'Сохранить', 1400);
    });

    // загрузка файла (txt/md/fb2/html/srt/vtt/docx/pdf)
    const fileInput = $('#fileInput');
    if (fileInput) fileInput.addEventListener('change', e => {
      const f = e.target.files[0];
      if (!f) return;
      const label = $('#fileName');
      label.className = 'file-name';
      label.textContent = '⏳ читаю файл…';
      R.readFile(f).then(res => {
        // Не обрезаем книги и транскрибации: анализ и умный режим должны
        // получать весь извлечённый материал, а не только его первую часть.
        const txt = (res.text || '').replace(/[ \t]{2,}/g, ' ').trim();
        if (!txt) {
          label.className = 'file-name file-warn';
          label.textContent = '⚠️ не удалось извлечь текст (возможно, скан или картинка)';
          return;
        }
        setMode('text');
        $('#mainInput').value = txt;
        if (res.kind === 'pdf' && res.weak) {
          label.className = 'file-name file-warn';
          label.textContent = '⚠️ ' + f.name + ': текст извлечён частично — проверьте (скан/необычные шрифты)';
        } else {
          label.className = 'file-name';
          label.textContent = '✓ ' + f.name + ' · ' + txt.length + ' знаков';
        }
      }).catch(err => {
        label.className = 'file-name file-warn';
        label.textContent = '⚠️ ' + (err && err.message ? err.message : 'ошибка чтения файла');
      });
    });

    // примеры
    $$('.example').forEach(ex => ex.addEventListener('click', () => {
      setMode(ex.dataset.mode || 'topic');
      $('#mainInput').value = ex.dataset.text;
      if (ex.dataset.platform) state.platforms = [ex.dataset.platform];
      renderPlatformChips();
      run();
    }));
  }

  document.addEventListener('DOMContentLoaded', init);
})(window.NS_DATA, window.NS_ENGINE, window.NS_READERS);
