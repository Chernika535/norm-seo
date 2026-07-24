/* Keeps Groq model compatibility outside the UI implementation. */
window.NS_AI_CLIENT = (function () {
  'use strict';

  const originalFetch = window.fetch && window.fetch.bind(window);
  const modelErrors = new Set([400, 404, 422]);
  const models = ['llama-3.3-70b-versatile', 'openai/gpt-oss-120b', 'openai/gpt-oss-20b'];

  function groqRequest(url, options) {
    return typeof url === 'string' && url.indexOf('https://api.groq.com/openai/v1/chat/completions') === 0 &&
      options && options.method === 'POST' && options.body;
  }

  async function fetchGroq(url, options) {
    let payload;
    try { payload = JSON.parse(options.body); } catch (error) { return originalFetch(url, options); }
    const candidates = [payload.model].concat(models.filter(model => model !== payload.model));
    let response;
    for (const model of candidates) {
      const nextPayload = Object.assign({}, payload, { model: model });
      // Не все модели Groq поддерживают response_format, но системный промпт
      // уже требует JSON, поэтому параметр безопасно убрать.
      delete nextPayload.response_format;
      response = await originalFetch(url, Object.assign({}, options, { body: JSON.stringify(nextPayload) }));
      if (!modelErrors.has(response.status)) return response;
    }
    return response;
  }

  if (originalFetch) {
    window.fetch = function (url, options) {
      return groqRequest(url, options) ? fetchGroq(url, options) : originalFetch(url, options);
    };
  }

  return { installed: !!originalFetch };
})();
