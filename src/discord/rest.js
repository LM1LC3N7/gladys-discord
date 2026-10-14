// -----------------------------------------------------------------------------
// The Discord REST client (API v10): who the bot is, DM channels, messages
// (text split at 2000 characters, images as multipart uploads), with the
// rate limits honoured minimally: a bucket whose `X-RateLimit-Remaining` is 0
// waits for its `X-RateLimit-Reset-After`, and a 429 is retried once after its
// `retry_after`.
// -----------------------------------------------------------------------------

import { DISCORD_API, MAX_RATE_LIMIT_WAIT } from '../constants.js';
import { httpRequest } from '../http.js';
import { decodeFile, splitText } from '../model.js';

/** A non-2xx answer of Discord. The message never contains the token. */
export class DiscordError extends Error {
  constructor(status, body, path) {
    const code = typeof body === 'object' ? body?.code : undefined;
    const detail =
      typeof body === 'object' ? (body?.message ?? '') : String(body ?? '').slice(0, 200);
    super(`Discord answered ${status}${code ? ` (code ${code})` : ''} on ${path}: ${detail}`);
    this.name = 'DiscordError';
    this.status = status;
    this.code = code;
  }
}

/** Discord JSON error codes the app explains to the user. */
export const ERROR_CODES = {
  UNKNOWN_CHANNEL: 10003,
  MISSING_ACCESS: 50001,
  CANNOT_DM_USER: 50007,
  MISSING_PERMISSIONS: 50013,
};

const header = (headers, name) => headers?.get?.(name) ?? null;

/** The wait (ms) a 429 asks for: the JSON `retry_after` (s), else the header. */
function retryAfterMs(response) {
  const seconds = Number(response.body?.retry_after ?? header(response.headers, 'retry-after'));
  return Number.isFinite(seconds) && seconds >= 0 ? Math.ceil(seconds * 1000) : 1000;
}

export class DiscordClient {
  constructor({ token, baseUrl = DISCORD_API, now = Date.now, sleep } = {}) {
    this.token = token;
    this.baseUrl = baseUrl;
    this.now = now;
    this.sleep = sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    /** route ("POST /channels/1/messages") -> instant its bucket refills. */
    this.buckets = new Map();
    this.globalUntil = 0;
  }

  async waitForBucket(route, path) {
    const until = Math.max(this.globalUntil, this.buckets.get(route) ?? 0);
    const wait = until - this.now();
    if (wait > MAX_RATE_LIMIT_WAIT) {
      throw new DiscordError(
        429,
        { message: `rate limited for ${Math.ceil(wait / 1000)} s` },
        path,
      );
    }
    if (wait > 0) {
      await this.sleep(wait);
    }
  }

  remember(route, response) {
    if (response.status === 429) {
      const until = this.now() + retryAfterMs(response);
      if (response.body?.global || header(response.headers, 'x-ratelimit-global')) {
        this.globalUntil = until;
      } else {
        this.buckets.set(route, until);
      }
      return;
    }
    const remaining = header(response.headers, 'x-ratelimit-remaining');
    const resetAfter = Number(header(response.headers, 'x-ratelimit-reset-after'));
    if (remaining === '0' && Number.isFinite(resetAfter)) {
      this.buckets.set(route, this.now() + Math.ceil(resetAfter * 1000));
    }
  }

  /** One API call; JSON in (`json`) or multipart (`form`), JSON out. */
  async request(method, path, { json, form } = {}) {
    // Our paths keep their major parameter (the channel id), so method + path
    // is a fair approximation of Discord's per-route buckets.
    const route = `${method} ${path}`;
    const headers = { Authorization: `Bot ${this.token}` };
    let body = form;
    if (json !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(json);
    }
    for (let attempt = 0; ; attempt += 1) {
      await this.waitForBucket(route, path);
      const response = await httpRequest(`${this.baseUrl}${path}`, { method, headers, body });
      this.remember(route, response);
      if (
        response.status === 429 &&
        attempt === 0 &&
        retryAfterMs(response) <= MAX_RATE_LIMIT_WAIT
      ) {
        continue; // waitForBucket sleeps the retry_after just recorded
      }
      if (response.status < 200 || response.status >= 300) {
        throw new DiscordError(response.status, response.body, path);
      }
      return response.body;
    }
  }

  /** The bot user: `{ id, username, discriminator, global_name }`. */
  me() {
    return this.request('GET', '/users/@me');
  }

  /** The application of the bot (its id is the client id of the invite link). */
  application() {
    return this.request('GET', '/applications/@me');
  }

  channel(channelId) {
    return this.request('GET', `/channels/${channelId}`);
  }

  /** Open (or get back) the DM channel with a user. */
  openDm(userId) {
    return this.request('POST', '/users/@me/channels', { json: { recipient_id: userId } });
  }

  /** One message: `content` (≤ 2000 characters) and an optional decoded file. */
  createMessage(channelId, { content, file }) {
    const path = `/channels/${channelId}/messages`;
    if (!file) {
      return this.request('POST', path, { json: { content } });
    }
    const form = new FormData();
    form.append(
      'payload_json',
      JSON.stringify({
        ...(content ? { content } : {}),
        attachments: [{ id: 0, filename: file.filename }],
      }),
    );
    form.append('files[0]', new Blob([file.bytes], { type: file.contentType }), file.filename);
    return this.request('POST', path, { form });
  }

  /**
   * A Gladys message in a channel: the text split into as many messages as
   * needed, the image attached to the last one. Resolves the last message.
   */
  async send(channelId, { text, file } = {}) {
    const chunks = splitText(text);
    const image = decodeFile(file);
    let last;
    for (const [i, content] of chunks.entries()) {
      const isLast = i === chunks.length - 1;
      last = await this.createMessage(channelId, { content, file: isLast ? image : undefined });
    }
    if (chunks.length === 0 && image) {
      last = await this.createMessage(channelId, { file: image });
    }
    return last;
  }
}
