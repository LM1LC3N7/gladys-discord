// -----------------------------------------------------------------------------
// Discord JSON <-> plain objects, and the text/file shaping of outgoing
// messages. Pure: no network, no clock.
// -----------------------------------------------------------------------------

import { DISCORD_MAX_CONTENT, GLADYS_MAX_TEXT, LINK_CODE, LINK_COMMAND } from './constants.js';

/**
 * A MESSAGE_CREATE dispatch -> the fields the app needs. `direct` is true
 * for a DM: a server message always carries a `guild_id`.
 */
export function incomingMessage(d = {}) {
  const author = d.author ?? {};
  return {
    id: String(d.id ?? ''),
    channelId: String(d.channel_id ?? ''),
    userId: String(author.id ?? ''),
    username: String(author.username ?? ''),
    // The display name ("global_name") when set, the unique username otherwise.
    displayName: String(author.global_name || author.username || ''),
    text: String(d.content ?? '')
      .trim()
      .slice(0, GLADYS_MAX_TEXT),
    direct: !d.guild_id,
    // Bots (ours included), system messages and webhooks never talk to Gladys.
    fromBot: Boolean(author.bot || author.system || d.webhook_id),
    attachments: Array.isArray(d.attachments) ? d.attachments.length : 0,
  };
}

/** The link code of a message: "/link CODE", "link CODE", or a bare code. */
export function linkCodeOf(text, { bare = true } = {}) {
  const value = String(text ?? '').trim();
  const command = LINK_COMMAND.exec(value);
  if (command) {
    return command[1].toUpperCase();
  }
  return bare && LINK_CODE.test(value) ? value.toUpperCase() : undefined;
}

const isHighSurrogate = (code) => code >= 0xd800 && code <= 0xdbff;

/**
 * Split a text into Discord messages of at most `max` characters, cutting at
 * a line break, else at a space, else anywhere (never inside a surrogate
 * pair, so an emoji is never cut in half).
 */
export function splitText(text, max = DISCORD_MAX_CONTENT) {
  const chunks = [];
  let rest = String(text ?? '');
  while (rest.length > max) {
    let cut = rest.lastIndexOf('\n', max);
    if (cut < max / 2) {
      cut = rest.lastIndexOf(' ', max);
    }
    if (cut < max / 2) {
      cut = isHighSurrogate(rest.charCodeAt(max - 1)) ? max - 1 : max;
    }
    chunks.push(rest.slice(0, cut).trimEnd());
    rest = rest.slice(cut).replace(/^[\n ]/, '');
  }
  if (rest.trim()) {
    chunks.push(rest);
  }
  return chunks.filter((chunk) => chunk.trim());
}

const EXTENSIONS = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
};

/**
 * The `file` of a Gladys message: a base64 image, as the camera actions send
 * it ("image/jpg;base64,..."), a data URI, or bare base64 (taken as JPEG).
 */
export function decodeFile(file) {
  if (typeof file !== 'string' || !file.trim()) {
    return undefined;
  }
  const match = /^(?:data:)?([\w.+-]+\/[\w.+-]+);base64,/i.exec(file);
  let contentType = match ? match[1].toLowerCase() : 'image/jpeg';
  if (contentType === 'image/jpg') {
    contentType = 'image/jpeg';
  }
  const bytes = Buffer.from(match ? file.slice(match[0].length) : file, 'base64');
  if (bytes.length === 0) {
    return undefined;
  }
  const extension = EXTENSIONS[contentType] ?? 'bin';
  return { bytes, contentType, filename: `gladys.${extension}` };
}

/** The OAuth2 URL that adds the bot to a server (scope `bot`). */
export function inviteUrl(applicationId, permissions) {
  const query = new URLSearchParams({ client_id: applicationId, scope: 'bot', permissions });
  return `https://discord.com/oauth2/authorize?${query}`;
}
