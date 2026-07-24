/* AI transport kept separate from the UI to make provider changes isolated. */
window.NS_AI_CLIENT = (function () {
  'use strict';

  async function request(url, options, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, Object.assign({}, options, { signal: controller.signal }));
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const type = response.headers.get('content-type') || '';
      if (!type.includes('application/json')) return await response.text();
      const data = await response.json();
      const choice = data.choices && data.choices[0];
      const content = choice && choice.message && choice.message.content;
      if (content) return content;
      if (typeof data.content === 'string') return data.content;
      if (typeof data.message === 'string') return data.message;
      throw new Error('ИИ вернул ответ без текста');
    } finally { clearTimeout(timer); }
  }

  async function askGroq(messages, key) {
    const models = ['llama-3.3-70b-versatile', 'openai/gpt-oss-120b', 'openai/gpt-oss-20b'];
    let lastError;
    for (const model of models) {
      try {
        return await request('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key.trim() },
          body: JSON.stringify({ model: model, temperature: 0.7, messages: messages })
        }, 45000);
      } catch (error) {
        lastError = error;
        if (!/^HTTP (400|404|422)$/.test(String(error && error.message))) throw error;
      }
    }
    throw lastError || new Error('Groq не вернул ответ');
  }

  async function askPublic(messages) {
    const payload = { model: 'openai', temperature: 0.7, private: true, messages: messages };
    try {
      return await request('https://text.pollinations.ai/openai', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(payload)
      }, 45000);
    } catch (postError) {
      const prompt = messages.map(m => m.role + ': ' + m.content).join('\n\n');
      if (prompt.length > 6000) throw postError;
      return request('https://text.pollinations.ai/' + encodeURIComponent(prompt) + '?model=openai&seed=' + Date.now(),
        { headers: { Accept: 'text/plain' } }, 45000);
    }
  }

  return { ask: (messages, groqKey) => groqKey ? askGroq(messages, groqKey) : askPublic(messages) };
})();
