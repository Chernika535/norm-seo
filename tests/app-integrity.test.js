#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('assets/js/app.js', 'utf8');

assert.equal(/^(<<<<<<<|=======|>>>>>>>)/m.test(source), false,
  'app.js must not contain unresolved merge markers');
assert.match(source, /model:\s*'openai\/gpt-oss-120b'/,
  'Groq requests must use the supported GPT-OSS model');
assert.match(source, /title:\s*'Ошибка Groq'/,
  'Groq failures must be shown to the user');
assert.match(source, /async function requestAI\(url, opts, timeoutMs\)/,
  'AI transport must use the generic request helper');
assert.match(source, /Object\.assign\(\{\}, opts, \{ signal: ctrl\.signal \}\)/,
  'request helper must preserve request options while attaching the timeout signal');

new vm.Script(source, { filename: 'assets/js/app.js' });
console.log('App integrity checks passed.');
