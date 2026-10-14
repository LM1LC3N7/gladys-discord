# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

## [0.1.1] - 2026-10-14

### Added

- Discord as a Gladys messaging channel through your own bot: each Gladys
  user links their Discord account by sending the bot the code generated in
  Gladys, then talks to Gladys in direct messages and receives its answers
  and notifications there (long texts split, camera images uploaded).
- Scene trigger "Discord command received": a direct message starting with
  `!` (like `!garage open`) starts scenes instead of going to the assistant,
  with the command, the text, the Gladys user and the Discord user as
  variables.
- Scene action "Post in a Discord channel", with a default channel in the
  configuration.
- An optional list of allowed Discord user ids; everyone else is ignored.
- "Test the bot" button: token, gateway, linked accounts, default channel and
  the invite link of the bot.
- Gateway connection with heartbeat, resume and reconnection; REST rate
  limits honoured.

[Unreleased]: https://github.com/LM1LC3N7/gladys-discord/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/LM1LC3N7/gladys-discord/releases/tag/v0.1.1
