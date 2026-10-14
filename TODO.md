# TODO

## Before announcing

- [ ] Test on a real Gladys 5.1+ with a real bot: the linking by code, a
      chat with the assistant (Gladys Plus), a "Send a message" scene action
      with a camera image, a `!command` scene, the "Post in a Discord
      channel" action, the test button and its invite link.
- [ ] Leave the integration running a day: the op 7 reconnections and the
      resumes must not flap the status (30 s grace).
- [ ] Reserve "Discord" in the forum thread t/10385, then add the
      `gladys-assistant-integration` topic to publish in the store.
- [ ] Turn on "Private vulnerability reporting" (SECURITY.md points there).

## To confirm

- [ ] The `file` of `onSendMessage` keeps the "image/jpg;base64," prefix of
      the core camera action (`decodeFile` also takes a data URI or bare
      base64).
- [ ] The "Link my account" block of the Gladys UI shows for every user of
      a `communication` integration declaring `messaging.receive: true`.
- [ ] Discord delivers DMs to a bot that only has the `DIRECT_MESSAGES`
      intent, content included, on an application created today (validated
      live: the gateway Hello, the 4004 close of a bad token and the REST 401;
      not yet a real DM).
- [ ] `GET /applications/@me` answers with a bot token (the invite link falls
      back to the bot user id otherwise).

## Ideas

- Slash commands (`/gladys`, interactions) instead of the `!` prefix, with
  the user's locale for the replies.
- Talking to Gladys in a server channel by mentioning the bot (mentions carry
  their content without the privileged intent).
- A "send a direct message to a Discord user id" scene action, for people
  who do not have a Gladys account.
