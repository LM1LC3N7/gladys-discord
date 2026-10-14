// -----------------------------------------------------------------------------
// The gateway client against a fake socket: the test plays Discord's side.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Gateway } from '../src/discord/gateway.js';
import { BOT } from './helpers/fakeFetch.js';
import { createSocketFactory } from './helpers/fakeSocket.js';
import { createFakeTimers } from './helpers/fakeTimers.js';

const quiet = { info() {}, warn() {}, error() {}, debug() {} };

function setup({ random = () => 0.5 } = {}) {
  const sockets = createSocketFactory();
  const timers = createFakeTimers();
  const statuses = [];
  const dispatched = [];
  const gateway = new Gateway({
    token: 'tok',
    intents: 1 << 12,
    socketFactory: sockets.factory,
    timers,
    random,
    logger: quiet,
    onStatus: (s) => statuses.push(s),
    onDispatch: (t, d) => dispatched.push([t, d]),
  });
  gateway.start();
  return { gateway, sockets, timers, statuses, dispatched };
}

test('hello, identify, heartbeat with jitter and ACK, dispatch', async () => {
  const { sockets, timers, statuses, dispatched } = setup();
  const socket = sockets.last();
  assert.equal(socket.url, 'wss://gateway.discord.gg/?v=10&encoding=json');
  socket.hello(40000);
  const [identify] = socket.ops(2);
  assert.equal(identify.d.token, 'tok');
  assert.equal(identify.d.intents, 4096, 'direct messages only');
  assert.equal(identify.d.properties.browser, 'gladys-discord');
  assert.equal(timers.timeouts()[0].ms, 20000, 'first beat after interval * jitter');
  socket.ready({ seq: 1 });
  assert.deepEqual(statuses, [{ state: 'connected', user: BOT }]);
  await timers.runTimeouts();
  assert.deepEqual(socket.ops(1), [{ op: 1, d: 1 }]);
  assert.equal(timers.intervals()[0].ms, 40000);
  socket.receive({ op: 11 });
  socket.dispatch('MESSAGE_CREATE', { content: 'hi' }, 2);
  assert.deepEqual(dispatched, [['MESSAGE_CREATE', { content: 'hi' }]]);
  await timers.runIntervals();
  assert.deepEqual(socket.ops(1).at(-1), { op: 1, d: 2 }, 'the beat carries the last sequence');
  socket.receive({ op: 1 });
  assert.equal(socket.ops(1).length, 3, 'Discord may ask for a beat right away');
});

test('a missing ACK is a zombie connection: reconnect and resume', async () => {
  const { sockets, timers, statuses } = setup();
  const first = sockets.last();
  first.hello(40000);
  first.ready({ seq: 5 });
  await timers.runTimeouts(); // first beat, never acknowledged
  await timers.runIntervals();
  assert.equal(first.closedWith, 4900, 'not 1000: the session must stay resumable');
  assert.deepEqual(statuses.at(-1), { state: 'disconnected' });
  assert.equal(timers.intervals().length, 0, 'heartbeat stopped');
  assert.equal(timers.timeouts()[0].ms, 1000);
  await timers.runTimeouts();
  const second = sockets.last();
  assert.equal(second.url, 'wss://resume.discord.test/?v=10&encoding=json');
  second.hello();
  assert.deepEqual(second.ops(6), [{ op: 6, d: { token: 'tok', session_id: 'sess-1', seq: 5 } }]);
  assert.equal(second.ops(2).length, 0, 'no new identify');
  second.dispatch('RESUMED', {}, 6);
  assert.deepEqual(statuses.at(-1), { state: 'connected', user: undefined });
});

test('op 7 reconnects at once, op 9 identifies again after 1 to 5 s', async () => {
  const { sockets, timers } = setup();
  const first = sockets.last();
  first.hello();
  first.ready({ seq: 3 });
  first.receive({ op: 7, d: null });
  assert.equal(first.closedWith, 4900);
  assert.deepEqual(
    timers.timeouts().map((t) => t.ms),
    [0],
  );
  await timers.runTimeouts();
  const second = sockets.last();
  second.hello();
  assert.equal(second.ops(6).length, 1, 'resumed');
  second.receive({ op: 9, d: false });
  assert.equal(timers.timeouts()[0].ms, 3000, '1 s + 4 s * jitter 0.5');
  await timers.runTimeouts();
  const third = sockets.last();
  assert.equal(third.url, 'wss://gateway.discord.gg/?v=10&encoding=json', 'a new session');
  third.hello();
  assert.equal(third.ops(2).length, 1, 'identified again');
  assert.equal(third.ops(6).length, 0);
});

test('close codes: 4004 and 4014 are final, 4009 starts a new session, others back off', async () => {
  const bad = setup();
  bad.sockets.last().hello();
  bad.sockets.last().drop(4004, 'Authentication failed.');
  assert.deepEqual(bad.statuses.at(-1), { state: 'fatal', code: 4004, reason: 'bad_token' });
  assert.equal(bad.timers.pending.size, 0, 'no retry with a refused token');

  const intents = setup();
  intents.sockets.last().drop(4014);
  assert.equal(intents.statuses.at(-1).reason, 'disallowed_intents');
  assert.equal(intents.timers.pending.size, 0);

  const expired = setup();
  expired.sockets.last().hello();
  expired.sockets.last().ready();
  expired.sockets.last().drop(4009);
  await expired.timers.runTimeouts();
  expired.sockets.last().hello();
  assert.equal(expired.sockets.last().ops(2).length, 1, 'session timed out: identify');

  const flaky = setup();
  flaky.sockets.last().drop(1006);
  assert.equal(flaky.timers.timeouts()[0].ms, 1000);
  await flaky.timers.runTimeouts();
  flaky.sockets.last().drop(1006);
  assert.equal(flaky.timers.timeouts()[0].ms, 2000, 'exponential backoff');
  flaky.gateway.stop();
  assert.equal(flaky.timers.pending.size, 0);
  await flaky.timers.runTimeouts();
  assert.equal(flaky.sockets.sockets.length, 2, 'no reconnection once stopped');
});
