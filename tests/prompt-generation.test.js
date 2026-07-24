#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const context = { window: {} };
vm.createContext(context);
vm.runInContext(fs.readFileSync('assets/js/data.js', 'utf8'), context, { filename: 'data.js' });
vm.runInContext(fs.readFileSync('assets/js/engine.js', 'utf8'), context, { filename: 'engine.js' });

const { buildPrompt, buildAIMessages, generateByTopic } = context.window.NS_ENGINE;
const platforms = ['tiktok', 'instagram', 'pinterest'];
const cases = [
  ['topic', 'керамическая посуда ручной работы'],
  ['text', 'Керамическая посуда ручной работы для уютного дома. Покажем, как выбрать чашку и тарелку.']
];

for (const platform of platforms) {
  for (const [mode, value] of cases) {
    const prompt = buildPrompt(mode, platform, value);
    assert.equal(typeof prompt, 'string', `${platform}/${mode}: prompt must be a string`);
    assert.ok(prompt.trim(), `${platform}/${mode}: prompt must not be empty`);
  }
}

assert.equal(buildPrompt('topic', 'unknown-platform', 'тест'), '');

const socialRequirements = [
  ['tiktok', 'Текст видео', 2],
  ['instagram', 'Текст карусели', 7]
];
for (const [platform, title, count] of socialRequirements) {
  const groups = generateByTopic('психология выгорания', platform);
  const longCaptions = groups.find(group => group.title.includes('Длинные подписи'));
  const content = groups.find(group => group.title.includes(title));
  const audience = groups.find(group => group.title === 'Целевая аудитория');
  assert.ok(longCaptions.items.every(item => item.length >= 400), `${platform}: long captions must contain at least 400 characters`);
  assert.equal(content.items.length, count, `${platform}: required content section must have the requested number of items`);
  assert.equal(audience.items.length, 3, `${platform}: audience must include one main and two additional segments`);
}

for (const platform of ['litres', 'podcast']) {
  const groups = generateByTopic('психология выгорания', platform);
  const descriptions = groups.find(group => /Аннотации|Описания выпуска/.test(group.title));
  assert.ok(descriptions.items.every(item => item.text.length >= 700), `${platform}: long descriptions must contain at least 700 characters`);
}

const fullDocument = 'начало ' + 'середина '.repeat(3000) + 'конец';
const messages = buildAIMessages('text', 'podcast', fullDocument);
assert.ok(messages.user.includes(fullDocument), 'AI messages must include the complete uploaded document');
console.log('Prompt generation checks passed for TikTok, Instagram, and Pinterest in topic and text modes.');
