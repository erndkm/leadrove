/// <reference types="node" />
import test from 'node:test';
import assert from 'node:assert/strict';
import { externalLink, phoneLink } from '../src/services/external-links';

test('public listing phone links cannot contain service codes, extensions or extra actions', () => {
  assert.equal(phoneLink('+49 (30) 123-456'), 'tel:+4930123456');
  for (const raw of ['*21*123456#', '*#06#', '123,456', '123;456', '123%0a456', '123/456', '123 or 456'])
    assert.throws(() => phoneLink(raw), /verification/);
});

test('external links enforce the action and reject URL credentials and control characters', () => {
  assert.equal(externalLink('https://example.com/contact', ['https:']), 'https://example.com/contact');
  assert.equal(externalLink('tel:+4930123456', ['tel:']), 'tel:+4930123456');
  for (const raw of ['javascript:alert(1)', 'intent://example', 'file:///data/test', 'https://trusted.example@evil.example', 'https://exam\nple.com'])
    assert.throws(() => externalLink(raw, ['https:', 'http:']), /safely/);
  assert.throws(() => externalLink('tel:*21*123#', ['tel:']), /verification/);
});
