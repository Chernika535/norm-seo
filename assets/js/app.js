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

  function renderCardTopic(p, buckets) {
    return `<section class="card">
      ${platformHeader(p)}
      <div class="buckets">${buckets.map(renderBucket).join('')}</div>
    </section>`;
  }

  function renderCardText(p, res) {
    const metrics = res.metrics.map(renderMetric).join('');
    const recs = res.recs.map(r => `<li>${escapeHtml(r)}</li>`).join('');
    return `<section class="card">
      ${platformHeader(p)}
      <div class="metrics">${metrics}</div>
      ${res.recs.length ? `<div class="recs"><h4>Рекомендации</h4><ul>${recs}</ul></div>` : ''}
      <div class="buckets">${res.buckets.map(renderBucket).join('')}</div>
    </section>`;
  }

  function run() {
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

    const cards = state.platforms.map(key => {
      const p = D.PLATFORMS[key];
      if (state.mode === 'topic') {
        const buckets = E.generateByTopic(value, key);
        return renderCardTopic(p, buckets);
      } else {
        const res = E.analyzeText(value, key);
        if (!res) return '';
        return renderCardText(p, res);
      }
    });

    out.innerHTML = cards.join('');
    wireCopy();
    out.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function wireCopy() {
    $$('.copy-mini').forEach(btn => {
      btn.addEventListener('click', () => {
        const txt = btn.previousElementSibling.textContent;
        copyText(txt, btn);
      });
    });
    $$('.copy-all').forEach(btn => {
      btn.addEventListener('click', () => copyText(btn.dataset.all, btn));
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
