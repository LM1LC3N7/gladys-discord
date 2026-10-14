// -----------------------------------------------------------------------------
// A "!command" direct message -> the `command_received` scene event. Pure.
//
// The core matches scene filters by equality only (no "contains"), so the
// filter is the command word, folded (lowercase, no accents): "!Garage open"
// and "!garage open" both match a scene filtering on "garage".
// -----------------------------------------------------------------------------

import { COMMAND_PREFIX, SCENE_STRING_MAX, SCENE_TRIGGERS } from './constants.js';

/** "Lumière" -> "lumiere". */
export const fold = (value) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

/** "!garage open please" -> { command: 'garage', args: 'open please' }. */
export function parseCommand(text) {
  const value = String(text ?? '').trim();
  if (!value.startsWith(COMMAND_PREFIX)) {
    return undefined;
  }
  const match = /^(\S+)\s*([\s\S]*)$/.exec(value.slice(COMMAND_PREFIX.length));
  if (!match) {
    return undefined;
  }
  return { command: fold(match[1]).slice(0, 100), args: match[2].trim() };
}

/** The scene event of a command sent by a linked contact. */
export function commandEvent({ command, args }, { text, userId, username, contact }) {
  return {
    key: SCENE_TRIGGERS.COMMAND,
    data: {
      command,
      text: args.slice(0, SCENE_STRING_MAX),
      message: String(text ?? '').slice(0, SCENE_STRING_MAX),
      user: contact?.user?.first_name ?? null,
      user_selector: contact?.user?.selector ?? null,
      discord_user_id: userId,
      discord_username: username,
    },
  };
}
