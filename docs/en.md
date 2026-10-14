# Discord

**Unofficial connector, not affiliated with Discord.** It turns a Discord bot
that you create into a Gladys messaging channel, like the Telegram one: you
talk to Gladys in a direct message with your bot, and Gladys answers and
notifies you there. Discord is a trademark of Discord Inc.

## What you get

| Surface              | Content                                                                                                                                     |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **Chat with Gladys** | every direct message you send the bot goes to Gladys, the answer comes back in the same conversation                                        |
| **Notifications**    | the messages Gladys sends you (the "Send a message" scene action, camera images, system messages) arrive as Discord direct messages         |
| **Scene trigger**    | **Discord command received**: a direct message starting with `!`, like `!garage open`, starts your scenes instead of going to the assistant |
| **Scene action**     | **Post in a Discord channel**: a text in a channel of a server (a family server, a home log channel…)                                       |
| **Configuration**    | the **Test the bot** button checks the token, the connection and the default channel, and gives the invite link of the bot                  |

## Setup

### Create the bot

1. Open the [Discord Developer Portal](https://discord.com/developers/applications)
   and click **New Application**. Give it a name, for instance "Gladys".
2. Open the **Bot** page and click **Reset Token**, then copy the token. It
   is the password of your bot: never share it. You can also turn off
   **Public Bot**, so that only you can invite it.
3. Leave the three **Privileged Gateway Intents** off: the integration only
   reads direct messages, and Discord delivers their text to a bot without
   any privileged intent (the "Message Content" intent is only needed for
   messages in servers).

### Connect it to Gladys

4. In Gladys, paste the token in **Bot token** and save. The status shows
   "Connected as …" after a few seconds.
5. Click **Test the bot**: the result ends with the **invite link** of your
   bot.

### Invite it to a server you are in

Discord only lets a bot and a person exchange direct messages when they
share a server.

6. Open the invite link and pick a server you are a member of. No server of
   your own? In Discord, click **+** then **Create My Own**: a private server
   with just you (and your family) is perfect. The link is the one the
   **OAuth2 → URL Generator** page of the portal would build with the scope
   `bot` and the permissions View Channels, Send Messages and Attach Files.
7. Check that the members of that server may send you direct messages:
   server name → **Privacy Settings** → **Direct Messages** on.

### Link your Discord account

8. In Gladys, on the page of the integration, click **Generate a link code**
   in the **Link my account** block: a code of 8 characters appears (it works
   once, for 15 minutes).
9. In Discord, open a direct message with the bot (click its name in the
   member list of the server, then **Message**) and send the code. The bot
   answers "Linked! Hello …".

Every Gladys user who wants Discord does the same with their own Discord
account. A user can unlink from the same block at any time.

## Talking to Gladys

- Every direct message from a linked account goes to Gladys, with the
  authority of the linked Gladys user, exactly like the Gladys chat. Like
  the Gladys chat, the assistant needs Gladys Plus: without it, Gladys
  answers that Gladys Plus is required (the `!` commands below work without
  it).
- Answers and notifications arrive in the same conversation. A text longer
  than the 2,000 characters of a Discord message is split, and a camera
  image arrives as an image.
- An account that is not linked gets the linking instructions, nothing else.

## Scene commands with `!`

A direct message starting with `!` is **not** sent to the assistant: it fires
the scene trigger **Discord command received**, and the bot confirms
"Command "garage" passed to your scenes". Only linked accounts can do it.

- The **Command** filter is the word right after the `!`. Gladys compares it
  exactly, so type it **in lowercase and without accents**: the integration
  lowers the case and drops the accents of what you send, so `!Garage`,
  `!garage` and `!GARAGE` all match the filter `garage`. Leave the filter
  empty to react to every command.
- The scene can use the details of the message: the command, the text after
  it (`!garage open` gives `open`), the whole message, the Gladys user (first
  name and selector) and the Discord user (id and name).

For instance: trigger **Discord command received** with the command
`garage`, then the action that opens the garage door; you open it by sending
`!garage` to the bot.

## Posting in a server channel

The scene action **Post in a Discord channel** posts a text in a channel of a
server the bot belongs to. Give it the **channel id**, or fill **Default
server channel id** in the configuration and leave the field empty. To copy
an id, turn on **Developer Mode** (Discord settings → **Advanced**), then
right-click the channel → **Copy Channel ID**. The bot needs the View
Channel and Send Messages permissions in that channel. The action gives back
the id of the posted message.

## Options

- **Allowed Discord user ids**: a safety list. When filled, the bot ignores
  the direct messages of everyone else, link codes included, without
  answering. Right-click a user → **Copy User ID** (Developer Mode).
- **Default server channel id**: the channel of the **Post in a Discord
  channel** action when the action names none.

## Troubleshooting

- **"Discord refused the bot token"**: the token was reset or mistyped. Click
  **Reset Token** in the portal, paste the new one and save.
- **The bot does not answer**: check the status of the integration, the
  allowed list, and that the bot is in a server you share. A message from an
  account that is not linked gets the linking instructions.
- **"Discord refuses to deliver a direct message"**: the person does not
  share a server with the bot anymore, or blocks direct messages from that
  server's members.
- **"This code is invalid or expired"**: a code works once, for 15 minutes;
  generate a new one.
- A short connection loss to Discord is normal: the integration resumes the
  session by itself, and only reports it after 30 seconds.
- Logs: the log level of the integration is set with the `LOG_LEVEL`
  variable.

## Privacy

The bot token is stored encrypted by Gladys and is only ever sent to Discord.
Your messages travel through Discord like any Discord message. The
integration writes nothing on disk: Gladys only keeps the link between a
Discord user id and a Gladys user, which you can remove from the **Link my
account** block.
