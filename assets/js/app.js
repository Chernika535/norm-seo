/* =============================================================
   NormSEO — интерфейс и связка с движком
   ============================================================= */

(function (D, E) {
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
    const items = b.items.map(it =>
      `<li><span>${escapeHtml(it)}</span><button class="copy-mini" title="Копировать">⧉</button></li>`
    ).join('');
    return `<div class="bucket">
      <div class="bucket-title">${escapeHtml(b.title)}
        <button class="copy-all" data-all="${escapeHtml(b.items.join('\n'))}">Копировать все</button>
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
      <button class="btn-prompt">✨ Создать промпт</button>
      <div class="prompt-box" hidden>
        <div class="prompt-head">
          <span>Готовый промпт — вставьте в ChatGPT, Gemini или другой ИИ-чат</span>
          <button class="copy-prompt">Копировать</button>
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
  async function askAI(messages) {
    const key = localStorage.getItem('ns_groq_key');
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 32000);
    try {
      let url, opts;
      if (key) {
        url = 'https://api.groq.com/openai/v1/chat/completions';
        opts = {
          method: 'POST', signal: ctrl.signal,
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
          body: JSON.stringify({
            model: 'llama-3.3-70b-versatile', temperature: 0.7,
            response_format: { type: 'json_object' }, messages
          })
        };
      } else {
        url = 'https://text.pollinations.ai/openai';
        opts = {
          method: 'POST', signal: ctrl.signal,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: 'openai', temperature: 0.7, private: true, referrer: 'normseo', messages })
        };
      }
      const r = await fetch(url, opts);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const ct = r.headers.get('content-type') || '';
      if (ct.includes('application/json')) {
        const data = await r.json();
        return (data.choices && data.choices[0] && data.choices[0].message.content) || JSON.stringify(data);
      }
      return await r.text();
    } finally { clearTimeout(timer); }
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
    let groups = null, kind = 'fallback';
    if (smart) {
      try {
        const { system, user } = E.buildAIMessages(mode, key, value);
        const text = await askAI([{ role: 'system', content: system }, { role: 'user', content: user }]);
        groups = E.parseAIGroups(text);
        if (groups) kind = 'ai';
      } catch (e) { groups = null; }
    } else { kind = ''; }
    if (!groups) { groups = offlineBuckets(mode, key, value); if (smart) kind = 'fallback'; }
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
      toggle.addEventListener('click', () => {
        const open = box.hasAttribute('hidden');
        if (open) {
          ta.value = E.buildPrompt(lastRun.mode, key, lastRun.value);
          box.removeAttribute('hidden');
          toggle.classList.add('open');
          toggle.textContent = '✨ Промпт готов — ниже';
          ta.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        } else {
          box.setAttribute('hidden', '');
          toggle.classList.remove('open');
          toggle.textContent = '✨ Создать промпт';
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
})(window.NS_DATA, window.NS_ENGINE);
