# CLAUDE.md

Project rules for coding assistants (Claude Code reads this file) and for
human contributors.

## What this is

A Gladys Assistant **external integration** of type `communication`
(`messaging.receive: true`): a Node.js service (Node 22+, ESM, no build step)
in its own sandboxed Docker container, talking to Gladys through
`@gladysassistant/integration-sdk` (v0.15). It turns a **Discord bot** (the
user's own application, token in the config) into a Gladys chat channel,
Telegram style: link by code, DMs to the brain, answers and notifications
back as DMs, plus a "!command" scene trigger and a "post in a channel" scene
action. Unofficial: not affiliated with Discord.

## Commands

```bash
npm install
npm test                                  # node --test, the built-in runner
node --test test/gateway.test.js          # one file
npm run lint                              # ESLint
npm run format:check                      # Prettier, as the CI runs it
npm run format                            # Prettier, fix in place
npm run audit                             # npm audit --omit=dev
npx github:GladysAssistant/integration-store .   # store admission checks
```

Run `format:check`, `lint`, `test` and `audit` before every commit.

## Architecture

```
index.js               SDK wiring only (handlers registered before connect())
src/app.js             DiscordApp: lifecycle, status, linking, incoming DMs,
                       outgoing messages, scene action, test button
src/discord/gateway.js the gateway client (hello, heartbeat, identify/resume,
                       close codes), injectable socket factory
src/discord/rest.js    REST v10 client: DM channels, messages, multipart
                       uploads, 429 / bucket handling, DiscordError
src/model.js           Discord JSON -> plain, link codes, text split, image
                       decode, invite URL (pure)
src/triggers.js        "!command" -> the command_received event (pure)
src/config.js          config_schema normalized (DEFAULTS, snowflake ids)
src/constants.js       endpoints, intents, opcodes, close codes, limits,
                       manifest keys
src/i18n.js            runtime texts (en/fr) and the bot replies
src/http.js            the only HTTP access (fetch, timeout, User-Agent)
test/helpers/          fake fetch (Discord REST), fake gateway socket, fake
                       timers; Gladys is the SDK's fake
```

## Rules

- **Unofficial.** Every user-facing surface says "unofficial connector, not
  affiliated with Discord". Never use the Discord logo or its mascot.
- **Keys are forever**: the manifest keys (`src/constants.js`: the
  `test_connection` action, the `command_received` trigger and its fields
  and variables, the `post_in_channel` action and its outputs) and the
  contact id shape (the Discord user id, a snowflake string, stored by Gladys
  in every link) are stored in user scenes and links. Never rename them.
- **The token is a secret**: a `secret` config field, sent only to Discord in
  the `Authorization` header and in Identify/Resume; never logged, never in an
  error message, never in a button result.
- **Linking is the consent**: a DM reaches the brain only through
  `publishMessage` (the core answers 404 for an unknown contact), a link only
  through `linkContact` with the user's code, and a `!command` only fires for
  a contact listed by `getContacts()`. The allowed ids list, when set, drops
  everyone else silently.
- **Intents**: `DIRECT_MESSAGES` only, no privileged intent. Posting in a
  server channel goes through REST and needs no intent; never add
  `GUILD_MESSAGES` or `MESSAGE_CONTENT` without a feature that reads servers.
- **Be polite with Discord**: no polling at all (the gateway pushes); one
  Identify per start, resume whenever possible (a reconnection to Gladys with
  the same configuration keeps the session); reconnection backoff 1 s → 60 s;
  REST 429 retried once after `retry_after`, an empty bucket waits for its
  reset; no retry after close code 4004 or 4010-4014.
- **Scene matching is equality**: the `command` filter is folded (lowercase,
  no accents) by `parseCommand`; never promise "contains" in a field.
- **Read-only rootfs**: write nothing on disk; the DM channel cache lives in
  memory only.
- **Versions belong to the Release workflow** (Actions → Release). Never edit
  `version` in `package.json` or in the manifest, nor the `docker_image` tag
  (the User-Agent reads `package.json`).
- **Changelog**: every user-visible change adds a line under
  `## [Unreleased]` in `CHANGELOG.md`.
- **Manifest texts** are `{ en, fr }` objects; the catalog description holds
  10 to 100 characters per language; `test/manifest.test.js` ties the
  manifest to the code.
- **User-facing text** is bilingual, `docs/en.md` and `docs/fr.md` kept in
  sync; the bot replies in the language of the linked Gladys user (both
  languages to an unknown sender). Comments explain why, in English.
- **Tests never touch the network** (`installFetch` replaces `fetch`, the
  gateway takes a socket factory).

## CI and pushes

- Group the commits and push **at most once a day**, unless the maintainer
  explicitly asks otherwise: the GitHub Actions quota is limited.
- If every CI job fails in under 2 seconds, the quota is exhausted: it is
  not a bug in the code.
- The Docker image cannot be built in the Claude Code cloud container (no
  network for `apk` inside `docker build`): the CI builds it.
