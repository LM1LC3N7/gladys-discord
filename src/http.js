// -----------------------------------------------------------------------------
// The only HTTP access: `fetch` with a timeout and the User-Agent Discord asks
// for. Rate limits and errors are the REST client's job (src/discord/rest.js).
// The tests replace fetch with `setFetch()`.
// -----------------------------------------------------------------------------

import { HTTP_TIMEOUT, USER_AGENT } from './constants.js';

let fetchImpl = (...args) => globalThis.fetch(...args);

/** Replace the fetch implementation (tests only). Returns the previous one. */
export function setFetch(impl) {
  const previous = fetchImpl;
  fetchImpl = impl;
  return previous;
}

/**
 * Send one request; resolves `{ status, headers, body }` whatever the status
 * (`body` parsed when JSON). `headers` must never be logged: it holds the token.
 */
export async function httpRequest(url, { method = 'GET', headers = {}, body, timeout } = {}) {
  const response = await fetchImpl(url, {
    method,
    headers: { 'User-Agent': USER_AGENT, ...headers },
    body,
    redirect: 'error',
    signal: AbortSignal.timeout(Math.max(1, timeout ?? HTTP_TIMEOUT)),
  });
  const text = await response.text();
  let parsed = text;
  try {
    parsed = text ? JSON.parse(text) : undefined;
  } catch {
    // not JSON: keep the text
  }
  return { status: response.status, headers: response.headers, body: parsed };
}
