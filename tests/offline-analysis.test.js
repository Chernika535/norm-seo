#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const context = { window: {} };
vm.createContext(context);
vm.runInContext(fs.readFileSync('assets/js/data.js', 'utf8'), context, { filename: 'data.js' });
vm.runInContext(fs.readFileSync('assets/js/engine.js', 'utf8'), context, { filename: 'engine.js' });

const { PLATFORMS } = context.window.NS_DATA;
const { analyzeText, generateByTopic } = context.window.NS_ENGINE;
const topic = 'керамическая посуда ручной работы';
const text = 'Керамическая посуда ручной работы для дома. Рассказываем, как выбрать чашку и тарелку, ухаживать за глазурью и заказать набор.';

for (const platform of Object.keys(PLATFORMS)) {
  const topicGroups = generateByTopic(topic, platform);
  assert.ok(Array.isArray(topicGroups) && topicGroups.length, `${platform}: topic fallback must not be empty`);
  assert.ok(topicGroups.every(group => group.title && group.items && group.items.length), `${platform}: topic groups must be renderable`);

  const analysis = analyzeText(text, platform);
  assert.ok(analysis && Array.isArray(analysis.buckets) && analysis.buckets.length, `${platform}: text fallback must not be empty`);
  assert.ok(analysis.buckets.every(group => group.title && group.items && group.items.length), `${platform}: text groups must be renderable`);
}

console.log('Offline analysis checks passed for every platform and mode.');
