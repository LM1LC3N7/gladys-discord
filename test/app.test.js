// -----------------------------------------------------------------------------
// The integration against the SDK's fake Gladys, a fake Discord REST API and
// a fake gateway socket.
// -----------------------------------------------------------------------------

import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { GladysApiError } from '@gladysassistant/integration-sdk';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { DiscordApp } from '../src/app.js';
import { ACTIONS, SCENE_ACTIONS, SCENE_TRIGGERS } from '../src/constants.js';
import { BOT, discordRoutes, installFetch, json } from './helpers/fakeFetch.js';
import { createSocketFactory, dm } from './helpers/fakeSocket.js';
import { createFakeTimers } from './helpers/fakeTimers.js';

const quiet = {
  info() {},
  warn: (...a) => process.env.DEBUG_TEST && console.error(...a),
  error() {},
  debug() {},
};

const ALICE = '2200000000000000001';
const BOB = '2200000000000000002';
const CODE = 'AB23CD45';
const CHANNEL = '7700000000000000001';
const TOKEN = 'abc.def.ghi';

let fake;
afterEach(() => fake?.restore());

const linked = (id, firstName = 'John', language = 'fr') => ({
  contact_id: id,
  contact_name: 'Alice',
  linked_at: '2026-10-13T08:00:00.000Z',
  user: { selector: firstName.toLowerCase(), first_name: firstName, language },
});

async function setup({ config = { bot_token: TOKEN }, contacts = [], routes = [] } = {}) {
  fake = installFetch(discordRoutes(routes));
  const sockets = createSocketFactory();
  const timers = createFakeTimers();
  const gladys = createFakeGladys({ selector: 'discord', config, contacts });
  // The fake host API accepts everything: play the core's 404s (an unknown
  // contact, an invalid or expired link code).
  const publish = gladys.publishMessage.bind(gladys);
  gladys.publishMessage = async (contactId, ...rest) => {
    if (!gladys.fake.contacts.some((c) => c.contact_id === contactId)) {
      throw new GladysApiError(404, 'NOT_FOUND', 'CONTACT_NOT_FOUND');
    }
    return publish(contactId, ...rest);
  };
  const link = gladys.linkContact.bind(gladys);
  gladys.linkContact = async (code, ...rest) => {
    if (code !== CODE) {
      throw new GladysApiError(404, 'NOT_FOUND', 'INVALID_LINK_CODE');
    }
    return link(code, ...rest);
  };
  const app = new DiscordApp({
    gladys,
    logger: quiet,
    timers,
    sleep: async () => {},
    random: () => 0,
    socketFactory: sockets.factory,
  });
  gladys.onSendMessage((contact, message) => app.sendMessage(contact, message));
  gladys.onSceneAction(SCENE_ACTIONS.POST, (fields) => app.postInChannel(fields));
  gladys.onAction(ACTIONS.TEST, () => app.testConnection());
  await gladys.connect();
  return { app, gladys, sockets, timers };
}

/** Start the app and let the gateway reach READY. */
async function online(options) {
  const context = await setup(options);
  await context.app.start(context.gladys.fake.config);
  const socket = context.sockets.last();
  socket.hello();
  socket.ready();
  await context.app.idle();
  await new Promise((resolve) => setImmediate(resolve));
  return { ...context, socket };
}

/** Discord delivers a DM; resolves once the app handled it. */
async function receive({ app, socket }, content, options) {
  socket.dispatch('MESSAGE_CREATE', dm(content, options), 2);
  await app.idle();
}

/** The texts the bot posted, in order. */
const posted = () =>
  fake.calls
    .filter((c) => c.method === 'POST' && /\/messages$/.test(c.path))
    .map((c) => c.json?.content ?? JSON.parse(c.body.get('payload_json')).content);

test('no token: the status explains, nothing is called', async () => {
  const { app, gladys, sockets } = await setup({ config: {} });
  await app.start({});
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.en, /Paste the token/);
  assert.equal(fake.calls.length, 0);
  assert.equal(sockets.sockets.length, 0);
  const test = await gladys.fake.action(ACTIONS.TEST);
  assert.match(test.data.message.fr, /Collez le jeton/);
});

test('a refused token: clear status, no gateway', async () => {
  const { app, gladys, sockets } = await setup({
    routes: [['GET /users/@me', () => json({ message: '401: Unauthorized', code: 0 }, 401)]],
  });
  await app.start({ bot_token: TOKEN });
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.en, /refused the bot token/);
  assert.equal(sockets.sockets.length, 0);
});

test('online: identify with the DM intent, status with the linked accounts', async () => {
  const { gladys, socket, app } = await online({ contacts: [linked(ALICE)] });
  assert.equal(socket.ops(2)[0].d.intents, 1 << 12);
  assert.equal(socket.ops(2)[0].d.token, TOKEN);
  assert.equal(gladys.fake.connectionStatus.connected, true);
  assert.match(
    gladys.fake.connectionStatus.message.en,
    /Connected as gladys-bot\. 1 linked account:/,
  );
  // A reconnection to Gladys with the same configuration keeps the session.
  await app.start(gladys.fake.config);
  assert.equal(socket.closedWith, undefined);
  app.stop();
  assert.equal(socket.closedWith, 1000);
});

test('linking: not linked -> instructions, bad code -> explained, code -> linked', async () => {
  const context = await online();
  const { gladys } = context;
  await receive(context, 'Turn on the lights');
  assert.equal(gladys.fake.messages.length, 0);
  assert.match(posted()[0], /not linked to Gladys yet[\s\S]*pas encore lié/);
  assert.equal(fake.calls.at(-1).path, '/channels/9000000000000000001/messages', 'reply in the DM');
  await receive(context, 'ZZZZZZZZ');
  assert.match(posted()[1], /invalid or expired/);
  await receive(context, CODE.toLowerCase());
  assert.equal(gladys.fake.contacts.length, 1);
  assert.equal(gladys.fake.contacts[0].contact_id, ALICE);
  assert.equal(gladys.fake.contacts[0].contact_name, 'Alice', 'the Discord display name');
  assert.match(posted()[2], /^Linked! Hello John/);
  assert.match(gladys.fake.connectionStatus.message.en, /1 linked account/);
  // From now on, the messages go to the brain.
  await receive(context, 'Turn on the lights');
  assert.deepEqual(gladys.fake.messages, [{ contact_id: ALICE, text: 'Turn on the lights' }]);
  assert.equal(posted().length, 3, 'no reply of our own: Gladys answers');
});

test('the explicit "/link CODE" works for an already linked user too', async () => {
  const context = await online({ contacts: [linked(ALICE)] });
  await receive(context, `/link ${CODE}`);
  assert.equal(context.gladys.fake.messages.length, 0, 'not sent to the brain');
  assert.match(posted()[0], /^Linked!/);
});

test('ignored: bots, this bot, server messages, users outside the allowed list', async () => {
  const context = await online({
    config: { bot_token: TOKEN, allowed_user_ids: ALICE },
    contacts: [linked(ALICE), linked(BOB, 'Bob')],
  });
  const { gladys } = context;
  const bot = dm('hello');
  bot.author.bot = true;
  context.socket.dispatch('MESSAGE_CREATE', bot, 3);
  context.socket.dispatch('MESSAGE_CREATE', dm('echo', { userId: BOT.id }), 4);
  context.socket.dispatch('MESSAGE_CREATE', dm('in a server', { guild_id: '1' }), 5);
  context.socket.dispatch('MESSAGE_CREATE', dm(CODE, { userId: BOB, username: 'bob' }), 6);
  await context.app.idle();
  assert.equal(gladys.fake.messages.length, 0);
  assert.equal(posted().length, 0, 'strangers get no answer at all');
  await receive(context, 'hello from alice');
  assert.deepEqual(
    gladys.fake.messages.map((m) => m.contact_id),
    [ALICE],
  );
  await receive(context, '', { attachments: [{ id: '1' }] });
  assert.equal(posted()[0], 'Je ne lis que les messages texte.', 'in the linked user language');
});

test('"!command" fires the scene trigger instead of talking to the brain', async () => {
  const context = await online({ contacts: [linked(ALICE)] });
  const { gladys } = context;
  await receive(context, '!Garage ouvre');
  assert.equal(gladys.fake.messages.length, 0);
  assert.deepEqual(gladys.fake.sceneEvents, [
    {
      key: SCENE_TRIGGERS.COMMAND,
      data: {
        command: 'garage',
        text: 'ouvre',
        message: '!Garage ouvre',
        user: 'John',
        user_selector: 'john',
        discord_user_id: ALICE,
        discord_username: 'alice',
      },
    },
  ]);
  assert.equal(posted()[0], 'Commande « garage » transmise à vos scènes.');
  // An unknown user cannot run commands.
  await receive(context, '!garage', { userId: BOB });
  assert.equal(gladys.fake.sceneEvents.length, 1);
  assert.match(posted()[1], /not linked/);
});

test('Gladys -> Discord: the DM is opened once, long texts split, images uploaded', async () => {
  const { gladys } = await online({ contacts: [linked(ALICE)] });
  const long = `${'x'.repeat(1990)}\n${'y'.repeat(1500)}`;
  const ack = await gladys.fake.sendMessage({ id: ALICE }, { text: long, file: null });
  assert.equal(ack.success, true);
  const image = Buffer.from('jpeg').toString('base64');
  await gladys.fake.sendMessage(
    { id: ALICE },
    { text: 'Garden', file: `image/jpg;base64,${image}` },
  );
  const opens = fake.calls.filter((c) => c.path === '/users/@me/channels');
  assert.equal(opens.length, 1, 'the DM channel is cached');
  assert.deepEqual(opens[0].json, { recipient_id: ALICE });
  assert.deepEqual(posted(), ['x'.repeat(1990), 'y'.repeat(1500), 'Garden']);
  assert.equal(fake.calls.at(-1).body.get('files[0]').type, 'image/jpeg');
  // A user who closed their DMs: the error says why.
  fake.restore();
  fake = installFetch(
    discordRoutes([
      [
        'POST /users/@me/channels',
        () => json({ message: 'Cannot send messages to this user', code: 50007 }, 403),
      ],
    ]),
  );
  const refused = await gladys.fake.sendMessage({ id: BOB }, { text: 'hi', file: null });
  assert.equal(refused.success, false);
  assert.match(refused.error, /share a server with the bot/);
  const nonsense = await gladys.fake.sendMessage({ id: 'john' }, { text: 'hi', file: null });
  assert.equal(nonsense.success, false);
});

test('scene action "post in a channel"', async () => {
  const { gladys } = await online({
    config: { bot_token: TOKEN, notification_channel_id: CHANNEL },
  });
  const byDefault = await gladys.fake.sceneAction(SCENE_ACTIONS.POST, { text: 'Alarm armed' });
  assert.equal(byDefault.success, true);
  assert.deepEqual(byDefault.data.outputs, { message_id: '5001', channel_id: CHANNEL });
  assert.equal(fake.calls.at(-1).path, `/channels/${CHANNEL}/messages`);
  const other = '7700000000000000002';
  const explicit = await gladys.fake.sceneAction(SCENE_ACTIONS.POST, {
    text: 'Hi',
    channel_id: other,
  });
  assert.equal(explicit.data.outputs.channel_id, other);
  assert.equal(
    (await gladys.fake.sceneAction(SCENE_ACTIONS.POST, { text: ' ' })).success,
    false,
    'empty text',
  );
  fake.restore();
  fake = installFetch(
    discordRoutes([
      ['POST /channels/\\d+/messages', () => json({ message: 'Missing Access', code: 50001 }, 403)],
    ]),
  );
  const denied = await gladys.fake.sceneAction(SCENE_ACTIONS.POST, { text: 'x' });
  assert.match(denied.error, /invited to that server/);
});

test('scene action without any channel fails with an explanation', async () => {
  const { gladys } = await online();
  const result = await gladys.fake.sceneAction(SCENE_ACTIONS.POST, { text: 'x' });
  assert.equal(result.success, false);
  assert.match(result.error, /No Discord channel/);
});

test('the test button: bot, gateway, linked accounts, channel, invite link', async () => {
  const { gladys } = await online({
    config: { bot_token: TOKEN, notification_channel_id: CHANNEL },
    contacts: [linked(ALICE), linked(BOB)],
  });
  const result = await gladys.fake.action(ACTIONS.TEST);
  const { en, fr } = result.data.message;
  assert.match(en, /Bot: gladys-bot\./);
  assert.match(en, /Gateway \(direct messages\): connected/);
  assert.match(en, /Linked accounts: 2/);
  assert.match(fr, /Salon par défaut : #maison/);
  assert.match(
    en,
    /https:\/\/discord\.com\/oauth2\/authorize\?client_id=1100000000000000002&scope=bot&permissions=35840/,
  );
  assert.doesNotMatch(JSON.stringify(result), new RegExp(TOKEN), 'the token never shows');
});

test('gateway outages: a short one stays green, a long one turns red, 4004 explains', async () => {
  const { gladys, socket, sockets, timers } = await online();
  const before = gladys.fake.connectionStatuses.length;
  socket.drop(1006);
  assert.equal(gladys.fake.connectionStatuses.length, before, 'still green during the grace');
  const grace = timers.timeouts().find((t) => t.ms === 30_000);
  assert.ok(grace);
  // Reconnection fails to come back before the grace ends.
  timers.pending.delete(grace.id);
  await grace.fn();
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.en, /reconnecting/);
  await timers.runTimeouts(); // the reconnection
  const second = sockets.last();
  second.hello();
  assert.equal(second.ops(6).length, 1, 'resumed');
  second.dispatch('RESUMED', {}, 3);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(gladys.fake.connectionStatus.connected, true);
  second.drop(4004, 'Authentication failed.');
  await new Promise((resolve) => setImmediate(resolve));
  assert.match(gladys.fake.connectionStatus.message.fr, /Discord a refusé le jeton/);
});

test('Gladys unavailable: the user is told to retry', async () => {
  const context = await online({ contacts: [linked(ALICE)] });
  context.gladys.publishMessage = async () => {
    throw new GladysApiError(503, 'UNAVAILABLE', 'busy');
  };
  await receive(context, 'hello');
  assert.match(posted()[0], /could not take this message/);
  context.gladys.publishSceneEvent = async () => {
    throw new GladysApiError(429, 'TOO_MANY_REQUESTS', 'RATE_LIMIT_EXCEEDED');
  };
  await receive(context, '!garage');
  assert.equal(
    posted()[1],
    'Gladys n’a pas pu prendre ce message pour le moment : réessayez dans un instant.',
  );
});
