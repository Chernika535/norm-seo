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

  // применяет набор шаблонов к каждому концепту темы
  function perConcept(seed, tpls) {
    const cs = concepts(seed);
    const out = [];
    cs.forEach(c => tpls.forEach(t => out.push(t(c))));
    return out;
  }
  function concepts(seed) {
    const c = extractConcepts(seed);
    return c.length ? c : [seed];
  }

  function genSEO(seed) {
    return [
      bucket('Информационные запросы', perConcept(seed, [
        c => `что такое ${c}`, c => `${c} для начинающих`,
        c => `как выбрать ${c}`, c => `виды ${c}`
      ]), 'info'),
      bucket('Вопросы аудитории', perConcept(seed, [
        c => `как ${c}`, c => `почему ${c}`, c => `с чего начать ${c}`
      ]), 'info'),
      bucket('Коммерческие запросы', perConcept(seed, [
        c => `книги про ${c}`, c => `лучшие ${c}`, c => `${c} купить`, c => `${c} отзывы`
      ]), 'commercial'),
      bucket('Смежные и long-tail', perConcept(seed, [
        c => `${c} 2026`, c => `${c} топ`, c => `${c} бесплатно`
      ]), 'longtail')
    ];
  }

  function genGEO(seed) {
    const conv = perConcept(seed, [
      c => `что такое ${c} и как это работает`,
      c => `объясни простыми словами что такое ${c}`,
      c => `какие есть виды ${c}`,
      c => `в чём плюсы и минусы ${c}`,
      c => `с чего начать ${c}`,
      c => `распространённые ошибки в ${c}`
    ]);
    const facts = [
      `Чёткое определение по теме «${seed}» (1–2 предложения)`,
      `Ключевые факты и цифры: 3–5 пунктов списком`,
      `Сравнительная таблица по теме`,
      `Раздел FAQ: 5 вопросов и коротких ответов`
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
    const cs = concepts(seed);
    const tags = [];
    cs.forEach(c => {
      const b = c.replace(/\s+/g, '');
      tags.push(`#${b}`, `#${b}советы`, `#${b}2026`, `#${b}tips`);
    });
    tags.push('#рекомендации', '#вирусное', '#обучение');
    const hooks = cs.slice(0, 3).flatMap(c =>
      D.SOCIAL_HOOKS.slice(0, 4).map(h => `${titleCase(h)} ${c}`));
    const captions = cs.slice(0, 2).flatMap(c => [
      `3 вещи про ${c}, о которых молчат — сохрани`,
      `${titleCase(c)} за 30 секунд 👇`
    ]);
    const main = cs[0] || seed;
    const extra = cs.slice(1, 3).join(', ');
    const tagLine = uniq(tags).slice(0, 6).join(' ');
    const longCaps = [
      `${titleCase(main)} — то, что реально меняет подход. В этом видео разбираю по шагам: с чего начать, каких ошибок избегать и что даёт результат уже на этой неделе${extra ? ' (' + extra + ')' : ''}. Сохрани, чтобы не потерять, и напиши в комментариях, что откликнулось. ${tagLine}`,
      `Если тебе близка тема «${main}» — этот ролик для тебя. Коротко и по делу: главное, что стоит знать, простыми словами и с примерами. Листай до конца, там самое важное. Подпишись, чтобы не пропустить продолжение, и сохрани в закладки. ${tagLine}`,
      `Разбираем ${main}${extra ? ' и ' + extra : ''}: почему это работает, кому подходит и как применить уже сегодня. Забирай чек-лист в закреплённом, делись с тем, кому это нужно, и пиши свой вопрос — отвечу в следующем видео. ${tagLine}`
    ];
    return [
      bucket('Хэштеги (микс широких и нишевых)', uniq(tags), 'hashtag'),
      bucket(platform === 'tiktok' ? 'Хуки для первых 3 секунд' : 'Хуки для Reels/сторис', hooks, 'hook'),
      bucket('Идеи подписей с ключами', captions, 'caption'),
      bucket('Длинные подписи (200–400 знаков)', longCaps, 'longcap')
    ];
  }

  function genLitres(seed) {
    const cs = concepts(seed);
    // подбираем категории/подкатегории по совпадению ниши
    const cats = [], subs = [];
    const lc = seed.toLowerCase();
    Object.keys(D.LITRES_SUBS).forEach(niche => {
      if (lc.includes(niche) || cs.some(c => c.includes(niche) || niche.includes(c))) {
        subs.push(...D.LITRES_SUBS[niche]);
      }
    });
    // категории — из общих разделов по ключевым словам
    D.LITRES_GENRES.forEach(g => {
      const gl = g.toLowerCase();
      if (cs.some(c => gl.includes(c) || c.includes(gl.split(/[ ,]/)[0]))) cats.push(g);
    });
    const catList = uniq(cats).slice(0, 3);
    const subList = uniq(subs).slice(0, 5);
    const main = cs[0] || seed;
    const blurb = `«${titleCase(seed)}» — книга о том, что волнует читателя прямо сейчас. ` +
      `Автор простым языком разбирает ${main}${cs[1] ? ' и ' + cs[1] : ''}, помогает разобраться в теме и применить знания на практике. ` +
      `Внутри — понятная структура, живые примеры и конкретные шаги. ` +
      `Эта книга для тех, кто хочет ${main} без воды и лишней теории. Начните читать — и сделайте первый шаг уже сегодня.`;
    return [
      bucket('Категории ЛитРес (3)', catList.length ? catList : ['— включите умный режим (ИИ) для точного подбора —'], 'cat'),
      bucket('Подкатегории (5)', subList.length ? subList : ['— включите умный режим (ИИ) —'], 'sub'),
      bucket('Оптимизированная аннотация (блерб)', [blurb], 'blurb'),
      bucket('Ключевые слова для карточки', perConcept(seed, [c => c, c => `книги про ${c}`, c => `${c} книга`]), 'kw')
    ];
  }

  function genPinterest(seed) {
    const searches = perConcept(seed, [
      c => `${c} идеи`, c => `${c} вдохновение`, c => `${c} эстетика`,
      c => `${c} своими руками`, c => `${c} 2026`
    ]);
    const boards = concepts(seed).slice(0, 4).map(c => `${titleCase(c)}: вдохновение`);
    const descriptions = concepts(seed).slice(0, 3).map(c =>
      `${titleCase(c)} — идеи и вдохновение, сохрани в свою доску 📌`);
    return [
      bucket('Поисковые фразы Pinterest', searches, 'search'),
      bucket('Названия досок', boards, 'board'),
      bucket('SEO-описания пинов', descriptions, 'desc')
    ];
  }

  function genPodcast(seed) {
    const cs = concepts(seed);
    const main = cs[0] || seed;
    const desc = `В этом выпуске говорим про ${main}${cs[1] ? ' и ' + cs[1] : ''} — просто, честно и по делу. ` +
      `Разбираем, что действительно важно, делимся примерами и рабочими идеями, которые можно применить сразу. ` +
      `Вы узнаете главное по теме, поймёте, с чего начать, и заберёте конкретные выводы. ` +
      `Слушайте до конца, подписывайтесь, чтобы не пропустить новые выпуски, и делитесь с теми, кому это будет полезно.`;
    const titles = cs.slice(0, 3).flatMap(c => [
      `${titleCase(c)}: всё, что нужно знать`,
      `Как разобраться в теме «${c}»`
    ]);
    const kws = perConcept(seed, [c => c, c => `${c} подкаст`, c => `${c} выпуск`, c => `что такое ${c}`]);
    const moments = cs.slice(0, 6).map((c, i) => `${String(i).padStart(2, '0')}:00 — ${titleCase(c)}`);
    return [
      bucket('Готовое описание выпуска', [desc], 'desc'),
      bucket('Варианты заголовка выпуска', titles, 'title'),
      bucket('Ключевые слова для подкаст-поиска', kws, 'kw'),
      bucket('Ключевые моменты / таймкоды', moments.length ? moments : ['00:00 — вступление'], 'time')
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
      case 'litres': return genLitres(seed);
      case 'podcast': return genPodcast(seed);
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
      case 'litres': {
        const kw = base.content.length;
        metrics.push(scoreCard('Слов в тексте', base.wordCount, 'Объём для анализа', base.wordCount < 20 ? 'warn' : 'good'));
        metrics.push(scoreCard('Ключевых основ', uniq(base.content).length, 'Смысловые слова', kw < 10 ? 'warn' : 'good'));
        recs.push('Вынесите главный крючок в первое предложение аннотации — его видно в поиске и превью.');
        recs.push('Включите в аннотацию слова, по которым книгу будут искать: тема, проблема, для кого.');
        recs.push('Для точных категорий и SEO-аннотации ЛитРес используйте умный режим (ИИ).');
        genLitres(base.content.slice(0, 12).join(' ') || text).forEach(b => buckets.push(b));
        break;
      }
      case 'podcast': {
        const hasCTA = /(подпис|слушай|делись|ставь|коммент|ссылк|поддержи)/i.test(base.raw);
        metrics.push(scoreCard('Слов в тексте', base.wordCount, 'Описание/транскрибация', base.wordCount < 20 ? 'warn' : 'good'));
        metrics.push(scoreCard('Призыв к действию', hasCTA ? 'есть' : 'нет', 'Подписка, репост', hasCTA ? 'good' : 'warn'));
        recs.push('Первая строка описания — крючок: её видно в превью на площадках, сделайте её цепляющей.');
        recs.push('Добавьте ключевые слова темы и имена гостей — по ним ищут выпуски.');
        recs.push('Для готового описания, заголовков и таймкодов включите умный режим (ИИ).');
        genPodcast(base.content.slice(0, 14).join(' ') || text).forEach(b => buckets.push(b));
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

  /* ---------- Извлечение концептов (для оффлайн-режима) ---------- */

  const NOISE = new Set([
    'книга','книги','книгу','формула','эффект','метод','методика','секрет','секреты',
    'сила','путь','правило','правила','принцип','принципы','искусство','наука','основы',
    'руководство','гайд','курс','теория','практика','система','подход','способ','способы',
    'техника','техники','версия','часть','глава','мир','жизнь','день','год','человек'
  ]);
  // явные окончания прилагательных (не трогаем -ая/-ую: пересекаются с сущ.)
  const ADJ_END = /(ый|ий|ой|ое|ее|ые|ых|их|ого|его|ому|ему|ым|им)$/;

  // грубое приведение к именительному падежу (частые окончания)
  function toNominative(w) {
    if (/ости$/.test(w)) return w.replace(/ости$/, 'ость');
    if (/(ани|ени|ити|стви)ю$/.test(w)) return w.slice(0, -1) + 'е';
    if (/(ци|си|зи|ги|ло|ти)ю$/.test(w)) return w.slice(0, -1) + 'я';
    if (/ию$/.test(w)) return w.replace(/ию$/, 'ие');
    if (/(ени|ани|iti)я$/.test(w)) return w.slice(0, -1) + 'е';
    return w;
  }

  function extractConcepts(seed) {
    const toks = tokenize(seed)
      .filter(t => t.length >= 4 && !isStop(t) && !NOISE.has(t) && !ADJ_END.test(t))
      .map(toNominative);
    return uniq(toks).slice(0, 8);
  }

  /* ---------- Умный режим: сборка запроса к ИИ ---------- */

  const AI_SPEC = {
    seo: 'Верни 5 групп: "Информационные запросы", "Вопросы аудитории", "Коммерческие запросы", "Смежные темы", "Long-tail". В каждой 6–10 реальных поисковых запросов на русском, грамматически верных, как их реально вводят в Google/Яндекс.',
    geo: 'Верни 2 группы: "Разговорные запросы к ИИ" (6–10 полных вопросов, как их задают ChatGPT/Perplexity) и "Что добавить для цитируемости" (6–8 конкретных элементов: определения, факты, списки, FAQ по теме).',
    ats: 'Тему трактуй как должность/профессию. Верни 3 группы: "Варианты названия должности" (6–8), "Ключевые hard skills" (10–14 конкретных навыков и инструментов для этой роли), "Глаголы достижений для резюме" (8–10).',
    tiktok: 'Верни 4 группы: "Хэштеги" (10–14, микс широких и нишевых, с #), "Хуки для первых 3 секунд" (6–8 цепляющих первых фраз), "Идеи подписей с ключами" (5–7 коротких), "Длинные подписи (200–400 знаков)" (ровно 3 развёрнутых подписи для описания видео, каждая 200–400 символов, живые и вовлекающие, максимально насыщенные ключевыми словами и с призывом к действию).',
    instagram: 'Верни 4 группы: "Хэштеги" (10–14, с #), "Хуки для Reels" (6–8 первых строк), "Идеи подписей с ключами" (5–7 коротких), "Длинные подписи (200–400 знаков)" (ровно 3 развёрнутых подписи, каждая 200–400 символов, с ключами и призывом к действию).',
    pinterest: 'Верни 3 группы: "Поисковые фразы Pinterest" (8–12, как ищут визуальный контент), "Названия досок" (5–7), "SEO-описания пинов" (4–6).',
    litres: 'Это книга (тебе дают название, концепцию, текст или аннотацию). Верни 4 группы: ' +
      '"Категории ЛитРес (3)" — ровно 3 наиболее подходящих раздела; ' +
      '"Подкатегории (5)" — ровно 5 поджанров; ' +
      'И категории, и подкатегории выбирай ТОЛЬКО из реальной классификации ЛитРес. Основные разделы ЛитРес: ' +
      window.NS_DATA.LITRES_GENRES.join(', ') + '. ' +
      '"Оптимизированная аннотация (блерб)" — ровно 1 элемент: готовый продающий текст аннотации 700–1100 знаков под поиск ЛитРес, ' +
      'с правильной структурой (цепляющий первый абзац-крючок → о чём книга и какую проблему решает → что читатель получит → короткий призыв), ' +
      'естественно насыщенный ключевыми словами по теме книги; ' +
      '"Ключевые слова для карточки" — 8–12 поисковых ключей, по которым книгу будут искать на ЛитРес.',
    podcast: 'Тебе дают текущее описание выпуска подкаста или его транскрибацию. ' +
      'Верни 4 группы: ' +
      '"Готовое описание выпуска" — ровно 1 элемент: понятное, интересное и цепляющее описание для площадок (Apple Podcasts, Spotify, Яндекс Музыка), 600–1200 знаков, ' +
      'с чёткой структурой (крючок-первая строка → о чём выпуск и почему стоит слушать → что слушатель узнает/заберёт → призыв подписаться и поделиться), ' +
      'написанное живым языком и естественно насыщенное ключевыми словами по теме выпуска; ' +
      '"Варианты заголовка выпуска" — 5–6 цепляющих названий с ключами; ' +
      '"Ключевые слова для подкаст-поиска" — 10–14 запросов, по которым выпуск будут искать; ' +
      '"Ключевые моменты / таймкоды" — 5–8 пунктов основных тем выпуска (если есть транскрибация — с примерными таймкодами в формате 00:00 — тема, иначе просто темы по порядку).'
  };

  function buildAIMessages(mode, platform, value) {
    const spec = AI_SPEC[platform] || AI_SPEC.seo;
    const source = mode === 'topic'
      ? `Тема: «${value}»`
      : `Проанализируй этот текст и подбери ключи по его смыслу:\n"""${value.slice(0, 2500)}"""`;

    const system = 'Ты — опытный SEO- и контент-специалист, носитель русского языка. ' +
      'Твоя задача — не приклеивать шаблоны к фразе, а понять СМЫСЛ темы, разбить её на отдельные концепты ' +
      'и подобрать реальные, грамматически правильные запросы аудитории по каждому концепту, включая смежные темы. ' +
      'Пример: из «Эффект самурая. Формула самоценности» нужно получить «книги по саморазвитию», «как развить самооценку», ' +
      '«что такое самоценность», «книги про самураев» — а НЕ «эффект самурая купить». ' +
      'Отвечай ТОЛЬКО валидным JSON без markdown и пояснений.';

    const user = `${source}\n\nПлощадка: ${platform.toUpperCase()}. ${spec}\n\n` +
      'Формат ответа строго: {"groups":[{"title":"Название группы","items":["запрос 1","запрос 2"]}]}';

    return { system, user };
  }

  function parseAIGroups(text) {
    if (!text) return null;
    const a = text.indexOf('{'), b = text.lastIndexOf('}');
    if (a < 0 || b < 0) return null;
    let obj;
    try { obj = JSON.parse(text.slice(a, b + 1)); } catch (e) { return null; }
    if (!obj || !Array.isArray(obj.groups)) return null;
    const groups = obj.groups
      .filter(g => g && g.title && Array.isArray(g.items) && g.items.length)
      .map(g => bucket(String(g.title), g.items.map(x => String(x).trim()), 'ai'));
    return groups.length ? groups : null;
  }

  return {
    analyzeText, generateByTopic, analyzeBase, buildPrompt,
    extractConcepts, buildAIMessages, parseAIGroups
  };
})(window.NS_DATA);
