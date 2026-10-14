// -----------------------------------------------------------------------------
// The configuration the user fills (manifest `config_schema`), normalized:
// the rest of the code never deals with `undefined` or strings from a form.
// -----------------------------------------------------------------------------

// Defaults: they MUST match the `default` values of the manifest (none of the
// fields has one: an empty value means "not used").
export const DEFAULTS = {
  bot_token: '',
  allowed_user_ids: '',
  notification_channel_id: '',
};

const text = (value) => (typeof value === 'string' ? value.trim() : '');

/** Discord ids are snowflakes: 17 to 20 digits today, a little slack kept. */
export const isSnowflake = (value) => /^\d{15,25}$/.test(String(value ?? ''));

/** "123, 456 789" -> ['123', '456', '789'] (anything not an id is dropped). */
export function parseIds(value) {
  return [
    ...new Set(
      text(value)
        .split(/[\s,;]+/)
        .filter(isSnowflake),
    ),
  ];
}

export function normalizeConfig(raw = {}) {
  // A token pasted with its "Bot " prefix still works.
  const token = text(raw.bot_token).replace(/^Bot\s+/i, '');
  const channel = text(raw.notification_channel_id);
  return {
    token,
    allowedUserIds: parseIds(raw.allowed_user_ids),
    notificationChannelId: isSnowflake(channel) ? channel : '',
  };
}
