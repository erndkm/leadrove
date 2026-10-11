/// <reference types="node" />
import test from 'node:test';
import assert from 'node:assert/strict';
import { redirectSystemPath } from '../app/+native-intent';

test('cold and warm native links reject malformed decoding input and excessive lengths', () => {
  for (const initial of [false, true]) {
    for (const path of ['leadrove://discover?q=%C0%AF', 'leadrove://discover?q=%FF'.repeat(200),
      'leadrove://discover?q=%', '/discover?q=' + 'a'.repeat(4096), '/discover\u0000']) {
      assert.equal(redirectSystemPath({ path, initial }), '/');
    }
    const valid = 'leadrove://business/node%2F42?label=Caf%C3%A9';
    assert.equal(redirectSystemPath({ path: valid, initial }), valid);
  }
});
