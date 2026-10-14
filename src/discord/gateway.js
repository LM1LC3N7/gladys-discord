// -----------------------------------------------------------------------------
// The Discord gateway: one WebSocket that receives the direct messages.
//
// (https://discord.com/developers/docs/events/gateway)
//   <- op 10 Hello { heartbeat_interval }
//   -> op 1 Heartbeat every interval (the first one after interval * jitter)
//   <- op 11 Heartbeat ACK (none before the next beat: zombie, reconnect)
//   -> op 2 Identify { token, intents }      | op 6 Resume { session_id, seq }
//   <- op 0 READY { session_id, resume_gateway_url, user } | RESUMED
//   <- op 0 MESSAGE_CREATE ...
//   <- op 7 Reconnect, op 9 Invalid Session, close codes (4004: bad token)
//
// The socket comes from a factory (Node's global WebSocket by default) so the
// tests play Discord's side with a fake one.
// -----------------------------------------------------------------------------

import {
  FATAL_CLOSE_CODES,
  GATEWAY_QUERY,
  GATEWAY_RECONNECT,
  GATEWAY_URL,
  INVALID_SESSION_WAIT,
  NEW_SESSION_CLOSE_CODES,
  OP,
  RESUME_CLOSE_CODE,
} from '../constants.js';

const defaultSocketFactory = (url) => new globalThis.WebSocket(url);

export class Gateway {
  constructor({
    token,
    intents,
    url = GATEWAY_URL,
    onDispatch = () => {},
    onStatus = () => {},
    logger = console,
    socketFactory = defaultSocketFactory,
    timers = { setTimeout, clearTimeout, setInterval, clearInterval },
    random = Math.random,
  }) {
    this.token = token;
    this.intents = intents;
    this.url = url;
    this.onDispatch = onDispatch;
    this.onStatus = onStatus;
    this.logger = logger;
    this.socketFactory = socketFactory;
    this.timers = timers;
    this.random = random;
    this.socket = undefined;
    this.stopped = true;
    this.connected = false;
    this.attempts = 0;
    this.retryTimer = undefined;
    this.beatTimer = undefined;
    this.beatInterval = undefined;
    this.acked = true;
    /** The session to resume: { id, url, seq } once READY arrived. */
    this.session = undefined;
    this.seq = null;
  }

  start() {
    this.stopped = false;
    this.attempts = 0;
    this.open();
  }

  stop() {
    this.stopped = true;
    this.timers.clearTimeout(this.retryTimer);
    this.retryTimer = undefined;
    // 1000: a deliberate stop ends the session, the bot shows offline.
    this.close(1000);
    this.session = undefined;
  }

  // --- Socket ----------------------------------------------------------------

  open() {
    if (this.stopped) {
      return;
    }
    const base = this.session?.url ?? this.url;
    let socket;
    try {
      socket = this.socketFactory(`${base.replace(/\/+$/, '')}/${GATEWAY_QUERY}`);
    } catch (err) {
      this.logger.warn(`Gateway socket failed to open: ${err.message}`);
      this.scheduleReconnect();
      return;
    }
    this.socket = socket;
    socket.onmessage = (event) => this.handle(socket, String(event.data));
    socket.onerror = (event) => {
      this.logger.warn(`Gateway socket error: ${event?.message ?? 'unknown'}`);
    };
    socket.onclose = (event) => {
      if (this.socket === socket) {
        this.closed(event?.code, event?.reason);
      }
    };
  }

  /** Close our socket (the onclose that follows is ignored). */
  close(code) {
    this.stopHeartbeat();
    if (this.socket) {
      const socket = this.socket;
      this.socket = undefined;
      try {
        socket.close(code);
      } catch {
        // already closed
      }
    }
    this.setConnected(false);
  }

  /** Discord (or the network) closed the socket. */
  closed(code, reason) {
    this.socket = undefined;
    this.stopHeartbeat();
    this.setConnected(false);
    const fatal = FATAL_CLOSE_CODES[code];
    if (fatal) {
      this.logger.error(`Gateway closed with ${code} (${reason || fatal}): not reconnecting`);
      this.stopped = true;
      this.session = undefined;
      this.onStatus({ state: 'fatal', code, reason: fatal });
      return;
    }
    if (NEW_SESSION_CLOSE_CODES.includes(code)) {
      this.session = undefined;
    }
    this.logger.warn(`Gateway closed (${code ?? '?'}${reason ? ` ${reason}` : ''}): reconnecting`);
    this.scheduleReconnect();
  }

  /** Drop the socket on purpose and come back, resuming when possible. */
  reconnect(delay) {
    this.close(RESUME_CLOSE_CODE);
    this.scheduleReconnect(delay);
  }

  scheduleReconnect(delay) {
    if (this.stopped || this.retryTimer) {
      return;
    }
    const wait =
      delay ?? Math.min(GATEWAY_RECONNECT.max, GATEWAY_RECONNECT.base * 2 ** this.attempts);
    this.attempts += 1;
    this.retryTimer = this.timers.setTimeout(() => {
      this.retryTimer = undefined;
      this.open();
    }, wait);
  }

  send(payload) {
    try {
      this.socket?.send(JSON.stringify(payload));
    } catch (err) {
      this.logger.warn(`Gateway send failed: ${err.message}`);
    }
  }

  setConnected(connected, user) {
    if (connected !== this.connected) {
      this.connected = connected;
      this.onStatus(connected ? { state: 'connected', user } : { state: 'disconnected' });
    }
  }

  // --- Heartbeat -------------------------------------------------------------

  startHeartbeat(interval) {
    this.stopHeartbeat();
    this.acked = true;
    // Discord asks for a random jitter before the first beat, so that bots
    // reconnecting together do not beat together.
    this.beatTimer = this.timers.setTimeout(
      () => {
        this.beatTimer = undefined;
        this.beat();
        this.beatInterval = this.timers.setInterval(() => this.beat(), interval);
      },
      Math.floor(interval * this.random()),
    );
  }

  stopHeartbeat() {
    this.timers.clearTimeout(this.beatTimer);
    this.timers.clearInterval(this.beatInterval);
    this.beatTimer = undefined;
    this.beatInterval = undefined;
  }

  beat() {
    if (!this.acked) {
      // No ACK since the last beat: the connection is a zombie.
      this.logger.warn('Gateway heartbeat not acknowledged: reconnecting');
      this.reconnect();
      return;
    }
    this.acked = false;
    this.send({ op: OP.HEARTBEAT, d: this.seq });
  }

  // --- Messages --------------------------------------------------------------

  handle(socket, raw) {
    if (socket !== this.socket) {
      return;
    }
    let message;
    try {
      message = JSON.parse(raw);
    } catch {
      return;
    }
    switch (message.op) {
      case OP.HELLO:
        this.startHeartbeat(message.d?.heartbeat_interval ?? 41_250);
        if (this.session) {
          this.send({
            op: OP.RESUME,
            d: { token: this.token, session_id: this.session.id, seq: this.seq },
          });
        } else {
          this.identify();
        }
        break;
      case OP.HEARTBEAT_ACK:
        this.acked = true;
        break;
      case OP.HEARTBEAT:
        // Discord may ask for a beat right away.
        this.send({ op: OP.HEARTBEAT, d: this.seq });
        break;
      case OP.RECONNECT:
        this.logger.info('Gateway asked to reconnect');
        this.reconnect(0);
        break;
      case OP.INVALID_SESSION:
        if (!message.d) {
          this.session = undefined;
          this.seq = null;
        }
        this.reconnect(
          INVALID_SESSION_WAIT.min +
            Math.floor((INVALID_SESSION_WAIT.max - INVALID_SESSION_WAIT.min) * this.random()),
        );
        break;
      case OP.DISPATCH:
        this.dispatch(message);
        break;
      default:
        break;
    }
  }

  identify() {
    this.seq = null;
    this.send({
      op: OP.IDENTIFY,
      d: {
        token: this.token,
        intents: this.intents,
        properties: { os: process.platform, browser: 'gladys-discord', device: 'gladys-discord' },
      },
    });
  }

  dispatch({ t, s, d }) {
    if (typeof s === 'number') {
      this.seq = s;
    }
    if (t === 'READY') {
      this.session = { id: d?.session_id, url: d?.resume_gateway_url || this.url };
      this.attempts = 0;
      this.setConnected(true, d?.user);
      return;
    }
    if (t === 'RESUMED') {
      this.attempts = 0;
      this.setConnected(true);
      return;
    }
    try {
      this.onDispatch(t, d);
    } catch (err) {
      this.logger.warn(`Handling ${t} failed: ${err.message}`);
    }
  }
}
