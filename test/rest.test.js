// -----------------------------------------------------------------------------
// The REST client against a fake Discord: headers, message splitting, the
// multipart upload, the rate limits and the errors.
// -----------------------------------------------------------------------------

import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { DiscordClient, DiscordError } from '../src/discord/rest.js';
import { discordRoutes, installFetch, json } from './helpers/fakeFetch.js';

let fake;
afterEach(() => fake?.restore());

function client() {
  const sleeps = [];
  const clock = { now: 1_000_000 };
  const discord = new DiscordClient({
    token: 'secret-token',
    now: () => clock.now,
    sleep: async (ms) => {
      sleeps.push(ms);
      clock.now += ms;
    },
  });
  return { discord, sleeps, clock };
}

test('every call carries the bot token and the DiscordBot User-Agent', async () => {
  fake = installFetch(discordRoutes());
  const { discord } = client();
  const me = await discord.me();
  assert.equal(me.username, 'gladys-bot');
  const [call] = fake.calls;
  assert.equal(call.url, 'https://discord.com/api/v10/users/@me');
  assert.equal(call.headers.Authorization, 'Bot secret-token');
  assert.match(
    call.headers['User-Agent'],
    /^DiscordBot \(https:\/\/github\.com\/LM1LC3N7\/gladys-discord, \d+\.\d+\.\d+\)$/,
  );
  const dm = await discord.openDm('2200000000000000001');
  assert.equal(dm.id, '9000000000000000001');
  assert.deepEqual(fake.calls[1].json, { recipient_id: '2200000000000000001' });
});

test('a long text becomes several messages of at most 2000 characters', async () => {
  fake = installFetch(discordRoutes());
  const { discord } = client();
  const text = `${'a'.repeat(1900)}\n${'b'.repeat(1900)}\n${'c'.repeat(600)}`;
  const last = await discord.send('900', { text });
  const posts = fake.calls.filter((c) => c.method === 'POST');
  assert.equal(posts.length, 3);
  assert.ok(posts.every((c) => c.path === '/channels/900/messages'));
  assert.ok(posts.every((c) => c.json.content.length <= 2000));
  assert.equal(posts.map((c) => c.json.content).join('\n'), text);
  assert.equal(last.id, '5003');
});

test('an image is uploaded as multipart: payload_json + files[0]', async () => {
  fake = installFetch(discordRoutes());
  const { discord } = client();
  const bytes = Buffer.from('fake jpeg bytes');
  await discord.send('900', {
    text: 'Motion in the garden',
    file: `image/jpg;base64,${bytes.toString('base64')}`,
  });
  assert.equal(fake.calls.length, 1, 'the text and the image in one message');
  const { body, headers } = fake.calls[0];
  assert.ok(body instanceof FormData);
  assert.equal(headers['Content-Type'], undefined, 'fetch sets the multipart boundary');
  assert.deepEqual(JSON.parse(body.get('payload_json')), {
    content: 'Motion in the garden',
    attachments: [{ id: 0, filename: 'gladys.jpg' }],
  });
  const file = body.get('files[0]');
  assert.equal(file.name, 'gladys.jpg');
  assert.equal(file.type, 'image/jpeg');
  assert.deepEqual(Buffer.from(await file.arrayBuffer()), bytes);
  // An image without text: no empty content.
  await discord.send('900', { text: '', file: bytes.toString('base64') });
  assert.deepEqual(JSON.parse(fake.calls[1].body.get('payload_json')), {
    attachments: [{ id: 0, filename: 'gladys.jpg' }],
  });
});

test('a 429 is retried once after retry_after, a second one fails', async () => {
  let answers = 0;
  fake = installFetch([
    [
      'POST /channels/900/messages',
      () =>
        ++answers === 1
          ? json({ message: 'You are being rate limited.', retry_after: 1.5, global: false }, 429)
          : json({ id: '1' }),
    ],
  ]);
  const { discord, sleeps } = client();
  const posted = await discord.createMessage('900', { content: 'hi' });
  assert.equal(posted.id, '1');
  assert.deepEqual(sleeps, [1500]);

  fake.restore();
  fake = installFetch([
    ['POST /channels/900/messages', () => json({ message: 'Slow down', retry_after: 0.2 }, 429)],
  ]);
  const again = client();
  await assert.rejects(again.discord.createMessage('900', { content: 'hi' }), (err) => {
    assert.ok(err instanceof DiscordError);
    assert.equal(err.status, 429);
    return true;
  });
  assert.equal(fake.calls.length, 2, 'retried exactly once');
});

test('an empty bucket waits for its reset, a long wait fails fast', async () => {
  fake = installFetch([
    [
      'POST /channels/900/messages',
      () =>
        json({ id: '1' }, 200, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset-after': '2.25' }),
    ],
    [
      'POST /channels/901/messages',
      () => json({ message: 'Global', retry_after: 120, global: true }, 429),
    ],
    ['GET /users/@me', () => json({ id: '1' })],
  ]);
  const { discord, sleeps } = client();
  await discord.createMessage('900', { content: 'one' });
  await discord.createMessage('900', { content: 'two' });
  assert.deepEqual(sleeps, [2250], 'the second call waited for the bucket');
  await discord.me();
  assert.equal(sleeps.length, 1, 'another route is not delayed');
  await assert.rejects(discord.createMessage('901', { content: 'x' }), /429/);
  await assert.rejects(discord.me(), /rate limited for 120 s/, 'a global limit blocks every route');
});

test('errors carry the status and the Discord code, never the token', async () => {
  fake = installFetch([
    ['GET /users/@me', () => json({ message: '401: Unauthorized', code: 0 }, 401)],
    [
      'POST /channels/\\d+/messages',
      () => json({ message: 'Cannot send messages to this user', code: 50007 }, 403),
    ],
  ]);
  const { discord } = client();
  await assert.rejects(discord.me(), (err) => {
    assert.equal(err.status, 401);
    assert.match(err.message, /401: Unauthorized/);
    assert.doesNotMatch(err.message, /secret-token/);
    return true;
  });
  await assert.rejects(discord.send('900', { text: 'hi' }), (err) => err.code === 50007);
});
