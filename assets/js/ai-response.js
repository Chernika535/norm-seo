/* Accept real model output even when it misses optional local length heuristics. */
(function (E) {
  'use strict';
  if (!E) return;

  function audience(source) {
    const topic = String(source || 'материал').trim();
    return {
      title: 'Целевая аудитория',
      items: [
        'Основная: люди, которым важна тема «' + topic + '» и практическая польза материала.',
        'Дополнительная 1: начинающие, которым нужны понятные объяснения и примеры.',
        'Дополнительная 2: специалисты и заинтересованные читатели, ищущие идеи и детали.'
      ]
    };
  }

  E.parseAIGroups = function (text, platform, source) {
    if (!text) return null;
    const raw = () => [{ title: 'Ответ ИИ', items: [String(text).trim()] }];
    const first = text.indexOf('{'), last = text.lastIndexOf('}');
    if (first < 0 || last < 0) return raw();
    let data;
    try { data = JSON.parse(text.slice(first, last + 1)); } catch (error) { return raw(); }
    if (!data || !Array.isArray(data.groups)) return raw();
    const groups = data.groups.filter(g => g && g.title && Array.isArray(g.items) && g.items.length)
      .map(g => ({
        title: String(g.title),
        items: g.items.map(item => item && typeof item === 'object' && (item.text || item.value)
          ? { label: String(item.label || item.tone || ''), text: String(item.text || item.value) }
          : String(item))
      }));
    if (!groups.length) return raw();
    if (!groups.some(g => g.title.toLowerCase().includes('целевая аудитория'))) groups.push(audience(source));
    return groups;
  };
})(window.NS_ENGINE);
