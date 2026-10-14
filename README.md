# gladys-discord

[Gladys Assistant](https://gladysassistant.com) external integration for
**Discord**: chat with Gladys and receive its notifications through a Discord
bot, with a "Discord command received" scene trigger and a "Post in a
Discord channel" scene action. **Unofficial, not affiliated with Discord.**

User documentation: [docs/en.md](docs/en.md) · [docs/fr.md](docs/fr.md).

## How it works

```
Gladys ⇄ SDK ⇄ src/app.js (DiscordApp)
                 ├─ src/discord/gateway.js  the gateway WebSocket: hello, heartbeat, identify/resume
                 ├─ src/discord/rest.js     REST v10: DM channels, messages, uploads, rate limits
                 ├─ src/model.js            Discord JSON -> plain, text split, image decode (pure)
                 └─ src/triggers.js         "!command" -> scene event (pure)
```

- **Type `communication`, `messaging.receive: true`**: the Telegram model.
  A Gladys user generates a link code in the Gladys UI and sends it to the
  bot in a direct message → `linkContact(code, discordUserId, name)`.
- **Incoming**: the gateway (`wss://gateway.discord.gg`, v10, intent
  `DIRECT_MESSAGES` only: DMs carry their content without the privileged
  Message Content intent) delivers `MESSAGE_CREATE`; a DM from a linked user
  goes to `publishMessage` (the brain), an unknown one gets the linking
  instructions (the core answers 404). A DM starting with `!` fires the
  `command_received` scene event instead and never reaches the brain.
- **Outgoing**: `onSendMessage({ id }, { text, file })` opens (once) the DM
  channel, splits the text at 2,000 characters and uploads the image as
  `multipart/form-data` (`payload_json` + `files[0]`).
- **Gateway**: heartbeat with the jitter on the first beat, zombie detection
  (no ACK), resume on op 7 / drops, a new session after op 9 or 4007/4009,
  no retry after 4004 (bad token) or 4010-4014.
- **REST**: `Authorization: Bot <token>`, `User-Agent: DiscordBot (...)`, a
  429 retried once after `retry_after`, an empty bucket waits for its
  `X-RateLimit-Reset-After`.

## Development

```bash
npm install
npm test                                        # node --test, no network
npm run lint && npm run format:check
npx github:GladysAssistant/integration-store .  # store admission checks
```

The tests play Discord with a fake `fetch` and a fake gateway socket, and
Gladys with the SDK's `createFakeGladys()`.

## Releasing

**Actions → Release → Run workflow** (patch / minor / major): bumps the
version in `package.json` and the manifest, rolls `CHANGELOG.md`, tags, builds
the multi-arch image to GHCR and publishes the GitHub Release.

## License

Apache-2.0.
