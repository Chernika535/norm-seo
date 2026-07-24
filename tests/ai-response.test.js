#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const context = { window: {} };
vm.createContext(context);
vm.runInContext(fs.readFileSync('assets/js/data.js', 'utf8'), context, { filename: 'data.js' });
vm.runInContext(fs.readFileSync('assets/js/engine.js', 'utf8'), context, { filename: 'engine.js' });
vm.runInContext(fs.readFileSync('assets/js/ai-response.js', 'utf8'), context, { filename: 'ai-response.js' });

const { parseAIGroups } = context.window.NS_ENGINE;
const groups = parseAIGroups(JSON.stringify({
  groups: [{ title: 'Подпись', items: ['Короткий, но реальный ответ ИИ.'] }]
}), 'tiktok', 'керамика');
assert.equal(groups[0].items[0], 'Короткий, но реальный ответ ИИ.');
assert.equal(groups.at(-1).title, 'Целевая аудитория');
assert.equal(parseAIGroups('Ответ без JSON')[0].title, 'Ответ ИИ');
console.log('AI response adapter checks passed.');
