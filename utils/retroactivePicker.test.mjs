import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { buildSync } from 'esbuild';

// Exercise the real modal composition, not a substitute picker implementation.
const result = buildSync({ entryPoints: ['components/RetroactiveModal.tsx'], bundle: true, platform: 'node', format: 'cjs', packages: 'external', write: false });
const module = { exports: {} };
vm.runInThisContext(`(function(require,module,exports){${result.outputFiles[0].text}\n})`)(createRequire(import.meta.url), module, module.exports);
const html = renderToStaticMarkup(React.createElement(module.exports.RetroactiveModal, {
  tags: [{ id: 'work', name: 'Work' }], timezone: 'UTC', onSave() {}, onClose() {},
}));

test('both endpoints offer a clickable time picker instead of requiring typed HH:mm', () => {
  assert.match(html, /aria-label="选择开始时刻"/);
  assert.match(html, /aria-label="选择结束时刻"/);
  assert.doesNotMatch(html, /placeholder="HH:mm"/);
});

test('both pickers expose all 24 hours and exact minutes', () => {
  for (let hour = 0; hour < 24; hour++) {
    assert.equal(html.split(`aria-label="${String(hour).padStart(2, '0')} 时"`).length - 1, 2);
  }
  assert.equal(html.split('aria-label="精确分钟"').length - 1, 2);
  assert.match(html, /aria-label="持续 45 分钟"/);
});
