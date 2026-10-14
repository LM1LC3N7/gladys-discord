// -----------------------------------------------------------------------------
// Constants of the Discord integration.
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';

// Read from package.json so the Release workflow (which bumps package.json)
// keeps the User-Agent in step without anyone editing a version by hand.
const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

/** Discord REST API, version 10 (https://discord.com/developers/docs/reference). */
export const DISCORD_API = 'https://discord.com/api/v10';
/** The gateway; READY hands back a `resume_gateway_url` used for resuming. */
export const GATEWAY_URL = 'wss://gateway.discord.gg';
export const GATEWAY_QUERY = '?v=10&encoding=json';

/** Discord asks bots for this exact User-Agent shape: "DiscordBot (url, version)". */
export const USER_AGENT = `DiscordBot (https://github.com/LM1LC3N7/gladys-discord, ${version})`;
export const HTTP_TIMEOUT = 15_000;

/**
 * Gateway intents. Direct messages only: posting in a server channel goes
 * through REST and needs no intent, and DMs carry their content without the
 * privileged Message Content intent. GUILD_MESSAGES (1 << 9) would only
 * deliver server messages whose content is empty without that privileged
 * intent, so it is never requested.
 */
export const INTENTS = { DIRECT_MESSAGES: 1 << 12 };

/** Gateway opcodes (https://discord.com/developers/docs/topics/opcodes-and-status-codes). */
export const OP = {
  DISPATCH: 0,
  HEARTBEAT: 1,
  IDENTIFY: 2,
  RESUME: 6,
  RECONNECT: 7,
  INVALID_SESSION: 9,
  HELLO: 10,
  HEARTBEAT_ACK: 11,
};

/** Close codes after which reconnecting is pointless: the user must act. */
export const FATAL_CLOSE_CODES = {
  4004: 'bad_token',
  4010: 'invalid_shard',
  4011: 'sharding_required',
  4012: 'invalid_version',
  4013: 'invalid_intents',
  4014: 'disallowed_intents',
};
/** Close codes after which the session cannot be resumed: identify again. */
export const NEW_SESSION_CLOSE_CODES = [4007, 4009];
/**
 * The code we close with when we intend to resume: 1000/1001 would make
 * Discord invalidate the session (and show the bot offline).
 */
export const RESUME_CLOSE_CODE = 4900;

/** Reconnection backoff of the gateway (ms), reset once READY/RESUMED arrives. */
export const GATEWAY_RECONNECT = { base: 1_000, max: 60_000 };
/** Discord asks to wait 1 to 5 s before identifying after an invalid session. */
export const INVALID_SESSION_WAIT = { min: 1_000, max: 5_000 };
/** A short gateway outage (op 7, a resume) is not worth a red status. */
export const DISCONNECTED_GRACE = 30_000;

/** Longest wait accepted on a 429 before giving up instead of retrying. */
export const MAX_RATE_LIMIT_WAIT = 30_000;

/** Limits of the two sides. */
export const DISCORD_MAX_CONTENT = 2000;
export const GLADYS_MAX_TEXT = 4096;
export const SCENE_STRING_MAX = 1000;

/** Gladys link codes: 8 characters of an alphabet without 0/O/1/I/L. */
export const LINK_CODE = /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/i;
/** "/link CODE", "!link CODE" or "link CODE" always try to link. */
export const LINK_COMMAND = /^[/!]?(?:link|lier|start)\s+(\S+)$/i;
/** A DM starting with this character is a scene command, not a chat message. */
export const COMMAND_PREFIX = '!';

/** Permissions of the invite link: view channels, send messages, attach files. */
export const INVITE_PERMISSIONS = String((1 << 10) | (1 << 11) | (1 << 15));

/** Manifest keys (forever: stored in user scenes). */
export const ACTIONS = { TEST: 'test_connection' };
export const SCENE_TRIGGERS = { COMMAND: 'command_received' };
export const SCENE_ACTIONS = { POST: 'post_in_channel' };
