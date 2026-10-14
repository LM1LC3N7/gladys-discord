// -----------------------------------------------------------------------------
// A fake WebSocket for the gateway: the test plays Discord's side.
// -----------------------------------------------------------------------------

import { BOT } from './fakeFetch.js';

export class FakeSocket {
  constructor(url) {
    this.url = url;
    this.sent = [];
    this.closedWith = undefined;
    this.onmessage = null;
    this.onerror = null;
    this.onclose = null;
  }

  send(text) {
    this.sent.push(JSON.parse(text));
  }

  close(code) {
    this.closedWith = code ?? 1000;
  }

  /** The payloads of one opcode sent by the bot. */
  ops(op) {
    return this.sent.filter((m) => m.op === op);
  }

  // --- Discord's side --------------------------------------------------------
  receive(message) {
    this.onmessage?.({ data: JSON.stringify(message) });
  }

  hello(interval = 41250) {
    this.receive({ op: 10, s: null, t: null, d: { heartbeat_interval: interval } });
  }

  ready({ seq = 1, session = 'sess-1', resumeUrl = 'wss://resume.discord.test' } = {}) {
    this.receive({
      op: 0,
      s: seq,
      t: 'READY',
      d: { v: 10, session_id: session, resume_gateway_url: resumeUrl, user: BOT },
    });
  }

  dispatch(t, d, s) {
    this.receive({ op: 0, s, t, d });
  }

  drop(code = 1006, reason = '') {
    this.onclose?.({ code, reason });
  }
}

export function createSocketFactory() {
  const sockets = [];
  return {
    sockets,
    last: () => sockets.at(-1),
    factory: (url) => {
      const socket = new FakeSocket(url);
      sockets.push(socket);
      return socket;
    },
  };
}

let nextMessage = 1;

/** A MESSAGE_CREATE in a DM (no guild_id), as Discord sends it. */
export function dm(content, { userId = '2200000000000000001', username = 'alice', ...rest } = {}) {
  return {
    id: String(3300000000000000000n + BigInt(nextMessage++)),
    channel_id: `90${userId.slice(2)}`,
    author: { id: userId, username, global_name: 'Alice', discriminator: '0' },
    content,
    attachments: [],
    ...rest,
  };
}
