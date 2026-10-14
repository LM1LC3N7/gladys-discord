// -----------------------------------------------------------------------------
// The manifest is the contract with Gladys and the store: these tests tie it
// to the code, so a key renamed on one side only fails here.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DEFAULTS } from '../src/config.js';
import { ACTIONS, SCENE_ACTIONS, SCENE_TRIGGERS } from '../src/constants.js';
import { commandEvent } from '../src/triggers.js';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const manifest = JSON.parse(read('gladys-assistant-integration.json'));
const index = read('index.js');

function* texts(node, path = '') {
  if (Array.isArray(node)) {
    for (const [i, item] of node.entries()) {
      yield* texts(item, `${path}[${i}]`);
    }
  } else if (node && typeof node === 'object') {
    if ('en' in node || 'fr' in node) {
      yield [path, node];
      return;
    }
    for (const [key, value] of Object.entries(node)) {
      yield* texts(value, `${path}.${key}`);
    }
  }
}

test('the store basics', () => {
  assert.equal(manifest.manifest_version, 1);
  assert.equal(manifest.type, 'communication');
  assert.deepEqual(manifest.messaging, { receive: true }, 'a chat channel, linked by code');
  assert.equal(manifest.contact_schema, undefined, 'forbidden on a receiving channel');
  assert.match(manifest.gladys_version, />=5\.1\.0/, 'scene triggers and actions need 5.1');
  assert.equal(manifest.docker_image, `ghcr.io/lm1lc3n7/gladys-discord:${manifest.version}`);
  assert.equal(manifest.version, JSON.parse(read('package.json')).version);
  for (const lang of ['en', 'fr']) {
    const length = manifest.description[lang].length;
    assert.ok(length >= 10 && length <= 100, `description.${lang}: ${length} characters`);
    assert.ok(read(`docs/${lang}.md`).length >= 300, `docs/${lang}.md is too short for the store`);
  }
  assert.match(manifest.description.en, /Unofficial/);
  assert.match(manifest.description.fr, /non officiel/);
  const intro = manifest.config_schema.find((f) => f.key === 'intro');
  assert.match(intro.description.en, /not affiliated with Discord/);
  assert.match(intro.description.fr, /sans lien avec Discord/);
});

test('every text is bilingual', () => {
  for (const [path, text] of texts(manifest)) {
    assert.ok(text.en?.trim() && text.fr?.trim(), `${path} needs en and fr`);
  }
});

test('the configuration matches the code', () => {
  const fields = manifest.config_schema.filter((f) => f.type !== 'section');
  assert.deepEqual(fields.map((f) => f.key).sort(), Object.keys(DEFAULTS).sort());
  const token = fields.find((f) => f.key === 'bot_token');
  assert.equal(token.type, 'secret', 'the token is never sent back to the browser');
  assert.equal(token.required, true);
  for (const field of fields) {
    assert.equal(field.default, undefined, `${field.key}: an empty value means "not used"`);
  }
});

test('the keys of the manifest are the keys of the code', () => {
  assert.deepEqual(manifest.actions.map((a) => a.key).sort(), Object.values(ACTIONS).sort());
  assert.deepEqual(
    manifest.scene_actions.map((a) => a.key).sort(),
    Object.values(SCENE_ACTIONS).sort(),
  );
  assert.deepEqual(
    manifest.scene_triggers.map((t) => t.key).sort(),
    Object.values(SCENE_TRIGGERS).sort(),
  );
  assert.ok(index.includes('gladys.onSendMessage('), 'the messaging channel is wired');
  for (const name of Object.keys(SCENE_ACTIONS)) {
    assert.ok(index.includes(`onSceneAction(SCENE_ACTIONS.${name}`), name);
  }
  for (const name of Object.keys(ACTIONS)) {
    assert.ok(index.includes(`onAction(ACTIONS.${name}`), name);
  }
  // The event carries every declared filter and variable, and nothing else.
  const [trigger] = manifest.scene_triggers;
  const { data } = commandEvent(
    { command: 'x', args: '' },
    { text: '!x', userId: '1', username: 'u', contact: { user: {} } },
  );
  assert.deepEqual(Object.keys(data).sort(), trigger.variables.map((v) => v.key).sort());
  for (const field of trigger.fields) {
    assert.ok(field.key in data, `filter ${field.key}`);
  }
  const [post] = manifest.scene_actions;
  assert.deepEqual(post.outputs.map((o) => o.key).sort(), ['channel_id', 'message_id']);
});
