// -----------------------------------------------------------------------------
// Fake `fetch` for the tests: plays the Discord REST API. Routes requests to
// handlers, records every call, and fails loudly on an unexpected request.
// No test touches the network.
// -----------------------------------------------------------------------------

import { setFetch } from '../../src/http.js';

setFetch(async (url) => {
  throw new Error(`Network call without a fake fetch in a test: ${url}`);
});

export const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });

/**
 * Install a fake fetch; `routes` is a list of ["METHOD /path/regexp", handler(call)].
 * A call is `{ method, url, path, headers, body, json }` (`json` parsed when
 * the body is JSON, `body` the raw FormData of a multipart upload).
 */
export function installFetch(routes) {
  const calls = [];
  const compiled = routes.map(([spec, handler]) => {
    const [method, pattern] = spec.split(' ');
    return { method, pattern: new RegExp(`^${pattern}$`), handler };
  });
  const previous = setFetch(async (url, init = {}) => {
    const method = init.method ?? 'GET';
    const path = new URL(url).pathname.replace(/^\/api\/v10/, '');
    const call = { method, url, path, headers: init.headers ?? {}, body: init.body };
    if (typeof init.body === 'string') {
      call.json = JSON.parse(init.body);
    }
    calls.push(call);
    const route = compiled.find((r) => r.method === method && r.pattern.test(path));
    if (!route) {
      throw new Error(`Unexpected network call in a test: ${method} ${url}`);
    }
    return route.handler(call);
  });
  return { calls, restore: () => setFetch(previous) };
}

/** The bot as /users/@me and READY describe it. */
export const BOT = {
  id: '1100000000000000001',
  username: 'gladys-bot',
  discriminator: '0',
  global_name: null,
  bot: true,
};

/** The usual Discord answers; a test overrides what it needs. */
export function discordRoutes(overrides = []) {
  let next = 5000;
  return [
    ...overrides,
    ['GET /users/@me', () => json(BOT)],
    ['GET /applications/@me', () => json({ id: '1100000000000000002', name: 'Gladys' })],
    [
      'POST /users/@me/channels',
      (call) => json({ id: `90${call.json.recipient_id.slice(2)}`, type: 1 }),
    ],
    [
      'POST /channels/\\d+/messages',
      (call) => json({ id: String((next += 1)), channel_id: call.path.split('/')[2] }),
    ],
    ['GET /channels/\\d+', (call) => json({ id: call.path.split('/')[2], name: 'maison' })],
  ];
}
