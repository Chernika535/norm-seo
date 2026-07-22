/* =============================================================
   NormSEO — движок анализа текста и генерации ключей
   ============================================================= */

window.NS_ENGINE = (function (D) {
  'use strict';

  /* ---------- Утилиты обработки текста ---------- */

  function tokenize(text) {
    return (text || '')
      .toLowerCase()
      .replace(/ё/g, 'е')
      .replace(/[^\p{L}\p{N}\s\-]/gu, ' ')
      .split(/\s+/)
      .filter(Boolean);
  }

  function sentences(text) {
    return (text || '').split(/[.!?…]+/).map(s => s.trim()).filter(Boolean);
  }

  function isStop(w) { return D.STOPWORDS.has(w) || w.length < 3; }

  function titleCase(s) {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  function uniq(arr) { return Array.from(new Set(arr)); }

  /* ---------- N-граммы и частотность ---------- */

  function ngrams(tokens, n) {
    const res = {};
    for (let i = 0; i <= tokens.length - n; i++) {
      const gram = tokens.slice(i, i + n);
      // фразу не начинаем и не заканчиваем стоп-словом
      if (isStop(gram[0]) || isStop(gram[n - 1])) continue;
      const key = gram.join(' ');
      res[key] = (res[key] || 0) + 1;
    }
    return res;
  }

  function topGrams(freqMap, total, limit) {
    return Object.entries(freqMap)
      .map(([phrase, count]) => ({
        phrase,
        count,
        density: total ? +(count / total * 100).toFixed(2) : 0
      }))
      .sort((a, b) => b.count - a.count || b.phrase.length - a.phrase.length)
      .slice(0, limit);
  }

  /* ---------- Базовый анализ текста ---------- */

  function analyzeBase(text) {
    const tokens = tokenize(text);
    const content = tokens.filter(t => !isStop(t));
    const sents = sentences(text);
    const total = tokens.length;

    const uni = topGrams(ngrams(tokens, 1), total, 15);
    const bi = topGrams(ngrams(tokens, 2), total, 12);
    const tri = topGrams(ngrams(tokens, 3), total, 8);

    const avgSentLen = sents.length ? +(total / sents.length).toFixed(1) : 0;
    const uniqueRatio = total ? +(uniq(tokens).length / total * 100).toFixed(0) : 0;

    return {
      raw: text, tokens, content, sents,
      wordCount: total,
      contentWords: content.length,
      sentenceCount: sents.length,
      avgSentLen,
      uniqueRatio,
      uni, bi, tri,
      topPhrases: [...bi, ...tri].sort((a, b) => b.count - a.count).slice(0, 10)
    };
  }

  /* ---------- Генерация ключей по теме ---------- */

  function combine(seed, mods, position) {
    return mods.map(m => position === 'before' ? `${m} ${seed}` : `${seed} ${m}`);
  }

  function bucket(title, items, intent) {
    return { title, intent, items: uniq(items).filter(Boolean).slice(0, 14) };
  }

  function genSEO(seed) {
    return [
      bucket('Информационные запросы', combine(seed, D.INFO), 'info'),
      bucket('Вопросы аудитории', D.QUESTION.map(q => `${q} ${seed}`), 'info'),
      bucket('Коммерческие запросы', combine(seed, D.COMMERCIAL), 'commercial'),
      bucket('Long-tail и уточнения', combine(seed, D.AUDIENCE), 'longtail'),
      bucket('Сравнения', combine(seed, D.COMPARISON), 'compare')
    ];
  }

  function genGEO(seed) {
    const conv = [
      `что такое ${seed} и как это работает`,
      `объясни простыми словами что такое ${seed}`,
      `какие есть виды ${seed}`,
      `в чём плюсы и минусы ${seed}`,
      `как выбрать ${seed} для новичка`,
      `пошаговая инструкция ${seed}`,
      `распространённые ошибки в ${seed}`,
      `сколько стоит ${seed} и от чего зависит цена`,
      `${seed}: что важно знать перед стартом`,
      `лучшие практики ${seed} в 2026 году`
    ];
    const facts = [
      `${titleCase(seed)} — это ... (дайте чёткое определение в 1-2 предложениях)`,
      `Ключевые факты о «${seed}»: перечислите 3-5 пунктов списком`,
      `Сравнительная таблица по теме «${seed}»`,
      `Раздел FAQ: 5 вопросов и коротких ответов про ${seed}`
    ];
    return [
      bucket('Разговорные запросы к ИИ', conv, 'geo'),
      bucket('Что добавить для цитируемости', facts, 'structure')
    ];
  }

  function genATS(seed) {
    // seed трактуем как должность
    const titles = [
      seed, `senior ${seed}`, `junior ${seed}`, `${seed} удалённо`,
      `${seed} middle`, `ведущий ${seed}`
    ];
    const skills = Array.from(D.ATS_SKILLS).slice(0, 18);
    return [
      bucket('Варианты названия должности', titles, 'title'),
      bucket('Ключевые hard skills (подставьте релевантные)', skills, 'skill'),
      bucket('Глаголы достижений для резюме', D.ATS_ACTION_VERBS, 'verb')
    ];
  }

  function genSocial(seed, platform) {
    const base = seed.replace(/\s+/g, '');
    const tags = uniq([
      `#${base}`, `#${base}тренд`, `#${base}2026`,
      `#${base}советы`, `#${base}идеи`, `#${base}обзор`,
      `#рекомендации`, `#вирусное`, `#${base}challenge`, `#учусь${base}`,
      `#${base}tips`, `#for${base}`
    ]);
    const hooks = D.SOCIAL_HOOKS.map(h => `${titleCase(h)} ${seed}`);
    const captions = [
      `Как ${seed} изменил(а) мой подход — сохрани, чтобы не потерять`,
      `3 вещи про ${seed}, о которых молчат`,
      `${titleCase(seed)} за 30 секунд 👇`,
      `Пробуешь ${seed}? Держи чек-лист в описании`
    ];
    return [
      bucket('Хэштеги (микс широких и нишевых)', tags, 'hashtag'),
      bucket(platform === 'tiktok' ? 'Хуки для первых 3 секунд' : 'Хуки для Reels/сторис', hooks, 'hook'),
      bucket('Идеи подписей с ключами', captions, 'caption')
    ];
  }

  function genPinterest(seed) {
    const searches = combine(seed, D.PINTEREST_MOD);
    const boards = [
      `${titleCase(seed)}: вдохновение`,
      `Идеи ${seed}`,
      `${titleCase(seed)} эстетика`,
      `${titleCase(seed)} своими руками`
    ];
    const descriptions = [
      `${titleCase(seed)} идеи и вдохновение — сохрани в свою доску 📌`,
      `Пошаговый гайд: ${seed} для начинающих`,
      `Подборка: лучшие ${seed} 2026`
    ];
    return [
      bucket('Поисковые фразы Pinterest', searches, 'search'),
      bucket('Названия досок', boards, 'board'),
      bucket('SEO-описания пинов', descriptions, 'desc')
    ];
  }

  function generateByTopic(seed, platform) {
    seed = (seed || '').trim().toLowerCase();
    if (!seed) return [];
    switch (platform) {
      case 'seo': return genSEO(seed);
      case 'geo': return genGEO(seed);
      case 'ats': return genATS(seed);
      case 'tiktok': return genSocial(seed, 'tiktok');
      case 'instagram': return genSocial(seed, 'instagram');
      case 'pinterest': return genPinterest(seed);
      default: return [];
    }
  }

  /* ---------- Анализ существующего текста ---------- */

  function scoreCard(label, value, hint, status) {
    return { label, value, hint, status }; // status: good | warn | bad
  }

  function findQuestions(base) {
    return base.sents.filter(s =>
      /\?$/.test(base.raw) || /^(как|что|почему|зачем|когда|где|сколько|какой|какая|какие)\b/i.test(s)
    ).slice(0, 5);
  }

  function suggestAdditions(base, mods) {
    // берём топовые содержательные слова и достраиваем длинные хвосты
    const heads = base.uni.slice(0, 4).map(x => x.phrase);
    const out = [];
    heads.forEach(h => mods.slice(0, 4).forEach(m => out.push(`${m} ${h}`)));
    return uniq(out).slice(0, 12);
  }

  function analyzeText(text, platform) {
    const base = analyzeBase(text);
    if (base.wordCount === 0) return null;

    const metrics = [];
    const recs = [];
    const buckets = [];

    // общие метрики
    metrics.push(scoreCard('Слов', base.wordCount, 'Объём текста',
      base.wordCount < 100 ? 'warn' : 'good'));
    metrics.push(scoreCard('Уникальность лексики', base.uniqueRatio + '%',
      'Доля неповторяющихся слов', base.uniqueRatio < 35 ? 'warn' : 'good'));
    metrics.push(scoreCard('Ср. длина предложения', base.avgSentLen,
      'Слов в предложении', base.avgSentLen > 22 ? 'warn' : 'good'));

    const topDensity = base.uni[0] ? base.uni[0].density : 0;

    switch (platform) {
      case 'seo': {
        metrics.push(scoreCard('Плотность топ-слова', topDensity + '%',
          'Оптимум 1–3%', topDensity > 4 ? 'bad' : topDensity < 0.5 ? 'warn' : 'good'));
        if (topDensity > 4) recs.push('⚠️ Переспам по слову «' + base.uni[0].phrase + '». Снизьте частоту и добавьте синонимы (LSI).');
        if (base.wordCount < 300) recs.push('Для устойчивого ранжирования желателен объём 300+ слов.');
        if (!findQuestions(base).length) recs.push('Добавьте подзаголовок в форме вопроса — попадёте в блок «Люди также спрашивают».');
        recs.push('Убедитесь, что главный ключ есть в заголовке (H1), первом абзаце и в тексте изображения (alt).');
        buckets.push(bucket('Обнаруженные ключевые фразы', base.topPhrases.map(p => `${p.phrase} — ${p.count}×`), 'found'));
        buckets.push(bucket('Ключи, которые стоит добавить', suggestAdditions(base, D.INFO.concat(D.COMMERCIAL)), 'add'));
        break;
      }
      case 'geo': {
        const hasDef = /\b(это|—\s|представляет собой|называется)\b/i.test(base.raw);
        const hasNums = /\d/.test(base.raw);
        const hasList = /(\n\s*[-•\d]|;\s)/.test(base.raw);
        metrics.push(scoreCard('Определение', hasDef ? 'есть' : 'нет',
          'Чёткая дефиниция темы', hasDef ? 'good' : 'warn'));
        metrics.push(scoreCard('Факты/цифры', hasNums ? 'есть' : 'нет',
          'ИИ любит конкретику', hasNums ? 'good' : 'warn'));
        metrics.push(scoreCard('Структура-список', hasList ? 'есть' : 'нет',
          'Списки легче цитировать', hasList ? 'good' : 'warn'));
        if (!hasDef) recs.push('Начните с чёткого определения: «X — это …». Так ИИ проще процитировать вас.');
        if (!hasNums) recs.push('Добавьте статистику, даты, конкретные числа — это повышает цитируемость в ответах ИИ.');
        if (!hasList) recs.push('Оформите ключевые пункты списком и добавьте блок FAQ (вопрос-ответ).');
        recs.push('Пишите самодостаточными абзацами: каждый отвечает на один вопрос без отсылок «выше/ниже».');
        buckets.push(bucket('Вопросы, на которые отвечает текст', findQuestions(base), 'q'));
        buckets.push(bucket('Разговорные запросы для покрытия', suggestAdditions(base, D.QUESTION), 'add'));
        break;
      }
      case 'ats': {
        const found = base.content.filter(w => D.ATS_SKILLS.has(w));
        const foundPhrases = uniq(found);
        const verbs = base.tokens.filter(w => D.ATS_ACTION_VERBS.includes(w));
        const hasNums = /\d/.test(base.raw);
        metrics.push(scoreCard('Найдено hard skills', foundPhrases.length,
          'Точные совпадения по словарю', foundPhrases.length < 3 ? 'warn' : 'good'));
        metrics.push(scoreCard('Глаголы достижений', uniq(verbs).length,
          'Разработал, увеличил…', verbs.length ? 'good' : 'warn'));
        metrics.push(scoreCard('Оцифрованные результаты', hasNums ? 'есть' : 'нет',
          'Цифры усиливают резюме', hasNums ? 'good' : 'bad'));
        if (foundPhrases.length < 3) recs.push('Добавьте больше точных названий навыков из текста вакансии — ATS ищет буквальные совпадения.');
        if (!verbs.length) recs.push('Начинайте пункты опыта с глаголов действия: «разработал», «увеличил на 30%».');
        if (!hasNums) recs.push('Оцифруйте достижения — ATS и рекрутеры выделяют результаты в цифрах.');
        recs.push('Избегайте таблиц, колонок и графики: многие ATS их не читают. Используйте простые заголовки.');
        buckets.push(bucket('Распознанные навыки', foundPhrases.length ? foundPhrases : ['— не найдено по словарю —'], 'found'));
        buckets.push(bucket('Ключевые фразы вашего текста', base.topPhrases.map(p => p.phrase), 'add'));
        break;
      }
      case 'tiktok':
      case 'instagram': {
        const firstSent = base.sents[0] || '';
        const hookOk = firstSent.length > 0 && firstSent.length < 90;
        const hasCTA = /(подпис|сохран|коммент|ссылк|в шапк|листай|делись|переходи)/i.test(base.raw);
        const emoji = /\p{Extended_Pictographic}/u.test(base.raw);
        metrics.push(scoreCard('Хук (1-я фраза)', hookOk ? 'ок' : 'слабый',
          'Первые секунды решают', hookOk ? 'good' : 'warn'));
        metrics.push(scoreCard('Призыв к действию', hasCTA ? 'есть' : 'нет',
          'CTA двигает охваты', hasCTA ? 'good' : 'warn'));
        metrics.push(scoreCard('Эмодзи', emoji ? 'есть' : 'нет',
          'Улучшают читаемость', emoji ? 'good' : 'warn'));
        if (!hookOk) recs.push('Сократите и заострите первую фразу — это хук, который удерживает в первые 3 секунды.');
        if (!hasCTA) recs.push('Добавьте призыв: «сохрани», «листай», «пиши в комментах» — вовлечённость поднимает показы.');
        recs.push('Вплетайте ключевые слова в подпись и в текст на видео — ' + (platform === 'tiktok' ? 'TikTok' : 'Instagram') + ' индексирует их для поиска.');
        recs.push('Используйте 3–5 нишевых хэштегов вместо десятков широких.');
        buckets.push(bucket('Хэштеги из вашего текста', base.uni.slice(0, 8).map(u => `#${u.phrase.replace(/\s+/g, '')}`), 'hashtag'));
        buckets.push(bucket('Ключи для подписи', suggestAdditions(base, D.AUDIENCE), 'add'));
        break;
      }
      case 'pinterest': {
        const kwDensity = topDensity;
        const emoji = /\p{Extended_Pictographic}/u.test(base.raw);
        metrics.push(scoreCard('Плотность ключа', kwDensity + '%',
          'Ключ в описании важен', kwDensity < 0.5 ? 'warn' : 'good'));
        metrics.push(scoreCard('Длина описания', base.wordCount + ' сл.',
          'Оптимум 30–60 слов', base.wordCount < 15 ? 'warn' : 'good'));
        if (base.wordCount < 15) recs.push('Расширьте описание до 30–60 слов с ключевыми словами — Pinterest ранжирует по тексту пина.');
        recs.push('Вынесите главный ключ в начало заголовка и в название доски.');
        recs.push('Добавьте сезонные и визуальные модификаторы: «идеи», «эстетика», «2026».');
        buckets.push(bucket('Ключевые фразы описания', base.topPhrases.map(p => p.phrase), 'found'));
        buckets.push(bucket('Поисковые фразы для добавления', suggestAdditions(base, D.PINTEREST_MOD), 'add'));
        break;
      }
    }

    return { metrics, recs, buckets, base };
  }

  /* ---------- Сбор ключей для промпта ---------- */

  function collectKeywords(mode, platform, value) {
    const set = [];
    if (mode === 'topic') {
      generateByTopic(value, platform).forEach(b => {
        b.items.slice(0, 5).forEach(i => set.push(i));
      });
    } else {
      const res = analyzeText(value, platform);
      if (res) {
        res.buckets.forEach(b => b.items.slice(0, 8).forEach(i => {
          // из «найденных» вида «слово — 2×» берём только слово
          set.push(i.replace(/\s+—\s+\d+×$/, ''));
        }));
      }
    }
    return uniq(set.filter(s => s && !/не найдено/i.test(s))).slice(0, 26);
  }

  /* ---------- Требования площадок для промпта ---------- */

  const PROMPT_SPEC = {
    seo: {
      what: 'SEO-оптимизированную статью для поисковой выдачи Google и Яндекс',
      rules: [
        'заголовок H1 с главным ключом и цепляющие подзаголовки H2/H3',
        'объём 600–1000 слов, естественная плотность ключей 1–3% (без переспама)',
        'хотя бы один подзаголовок в форме вопроса (для блока «Люди также спрашивают»)',
        'главный ключ — в первом абзаце и в мета-описании до 160 символов',
        'в конце добавь мета-заголовок (title) и мета-описание'
      ]
    },
    geo: {
      what: 'текст, оптимизированный для цитирования в ответах ИИ (ChatGPT, Perplexity, AI Overviews) — GEO',
      rules: [
        'начни с чёткого определения в формате «X — это …»',
        'используй конкретные факты, цифры и даты',
        'оформи ключевые пункты маркированными списками',
        'добавь блок FAQ из 4–5 пар «вопрос — короткий ответ»',
        'пиши самодостаточными абзацами: каждый отвечает на один вопрос без отсылок «выше/ниже»'
      ]
    },
    ats: {
      what: 'раздел резюме под ATS-робот (или улучши мой текст) для указанной должности',
      rules: [
        'без таблиц, колонок и графики — только простые заголовки и абзацы/списки',
        'каждый пункт опыта начинай с глагола действия (разработал, увеличил, внедрил)',
        'оцифруй результаты (проценты, суммы, сроки)',
        'используй точные названия навыков и ключевых терминов из списка ниже',
        'добавь короткий блок «Ключевые навыки» перечислением'
      ]
    },
    tiktok: {
      what: 'сценарий короткого видео и подпись для TikTok',
      rules: [
        'мощный хук в первые 3 секунды, который заставит досмотреть',
        'короткие динамичные фразы, разбитые на реплики/кадры',
        'явный призыв к действию (подпишись, сохрани, напиши в комменты)',
        'уместные эмодзи и 3–5 нишевых хэштегов из списка',
        'вплети ключевые слова в подпись — TikTok индексирует их для поиска'
      ]
    },
    instagram: {
      what: 'сценарий Reels и подпись для Instagram',
      rules: [
        'цепляющий хук в первой строке (виден до «…ещё»)',
        'структура: хук → польза → призыв к действию',
        'уместные эмодзи для читаемости и 3–5 нишевых хэштегов',
        'ключевые слова в тексте подписи (Instagram использует их в поиске)',
        'заверши призывом сохранить/поделиться'
      ]
    },
    pinterest: {
      what: 'заголовок пина, SEO-описание и название доски для Pinterest',
      rules: [
        'главный ключ — в самом начале заголовка',
        'описание 30–60 слов, насыщенное ключевыми словами из списка',
        'добавь мягкий призыв сохранить пин',
        'предложи 1–2 названия доски с ключом',
        'при уместности добавь сезонный/визуальный модификатор (идеи, эстетика, 2026)'
      ]
    }
  };

  function buildPrompt(mode, platform, value) {
    value = (value || '').trim();
    if (!value) return '';
    const spec = PROMPT_SPEC[platform];
    const kws = collectKeywords(mode, platform, value);
    const kwBlock = kws.map(k => '• ' + k).join('\n');

    const source = mode === 'topic'
      ? `Тема: «${value}»`
      : `Вот исходный текст, с которым нужно работать:\n"""\n${value}\n"""`;

    const rules = spec.rules.map((r, i) => `${i + 1}. ${r}`).join('\n');

    return [
      `Ты — опытный редактор и специалист по контенту. Напиши ${spec.what}.`,
      '',
      source,
      '',
      'Требования площадки:',
      rules,
      '',
      'Обязательно органично используй эти ключевые слова и запросы (не меняй смысл, вплетай естественно):',
      kwBlock,
      '',
      'Пиши на русском языке, живо и по делу, без воды и клише. В конце кратко перечисли, какие из ключей ты использовал.'
    ].join('\n');
  }

  return { analyzeText, generateByTopic, analyzeBase, buildPrompt };
})(window.NS_DATA);
