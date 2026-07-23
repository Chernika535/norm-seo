#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const context = { window: {} };
vm.createContext(context);
vm.runInContext(fs.readFileSync('assets/js/data.js', 'utf8'), context, { filename: 'data.js' });
vm.runInContext(fs.readFileSync('assets/js/engine.js', 'utf8'), context, { filename: 'engine.js' });

const { buildPrompt } = context.window.NS_ENGINE;
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
console.log('Prompt generation checks passed for TikTok, Instagram, and Pinterest in topic and text modes.');
