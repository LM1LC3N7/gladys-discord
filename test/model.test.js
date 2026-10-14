import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeConfig, parseIds } from '../src/config.js';
import { replyText, T } from '../src/i18n.js';
import { decodeFile, incomingMessage, inviteUrl, linkCodeOf, splitText } from '../src/model.js';
import { commandEvent, fold, parseCommand } from '../src/triggers.js';
import { dm } from './helpers/fakeSocket.js';

test('a long text is split at line breaks, then spaces, then anywhere', () => {
  assert.deepEqual(splitText('short'), ['short']);
  assert.deepEqual(splitText(''), []);
  const lines = `${'a'.repeat(1500)}\n${'b'.repeat(1500)}`;
  assert.deepEqual(splitText(lines), ['a'.repeat(1500), 'b'.repeat(1500)]);
  const words = Array.from({ length: 500 }, () => 'word').join(' '); // 2499 characters
  const chunks = splitText(words);
  assert.equal(chunks.length, 2);
  assert.ok(chunks.every((c) => c.length <= 2000 && !c.startsWith(' ') && !c.endsWith(' ')));
  assert.equal(chunks.join(' '), words);
  // No separator: a hard cut, never inside an emoji (a surrogate pair).
  const emojis = `${'x'.repeat(1999)}😀${'y'.repeat(10)}`;
  const [first, second] = splitText(emojis);
  assert.equal(first, 'x'.repeat(1999));
  assert.equal(second, `😀${'y'.repeat(10)}`);
  assert.ok(splitText('z'.repeat(4096)).every((c) => c.length <= 2000));
});

test('the image of a Gladys message is decoded whatever its prefix', () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString('base64');
  const camera = decodeFile(`image/jpg;base64,${png}`);
  assert.equal(camera.contentType, 'image/jpeg');
  assert.equal(camera.filename, 'gladys.jpg');
  assert.deepEqual([...camera.bytes], [0x89, 0x50, 0x4e, 0x47]);
  assert.equal(decodeFile(`data:image/png;base64,${png}`).filename, 'gladys.png');
  assert.equal(decodeFile(png).contentType, 'image/jpeg', 'bare base64 is taken as JPEG');
  assert.equal(decodeFile(null), undefined);
  assert.equal(decodeFile(''), undefined);
});

test('a MESSAGE_CREATE becomes a plain message', () => {
  const message = incomingMessage(dm('  turn on the lights  ', { userId: '2200000000000000009' }));
  assert.equal(message.userId, '2200000000000000009');
  assert.equal(message.channelId, '9000000000000000009');
  assert.equal(message.text, 'turn on the lights');
  assert.equal(message.displayName, 'Alice');
  assert.equal(message.direct, true);
  assert.equal(message.fromBot, false);
  assert.equal(incomingMessage(dm('hi', { guild_id: '1' })).direct, false);
  assert.equal(incomingMessage(dm('hi', { webhook_id: '1' })).fromBot, true);
  const bot = dm('hi');
  bot.author.bot = true;
  assert.equal(incomingMessage(bot).fromBot, true);
  assert.equal(incomingMessage(dm('x'.repeat(5000))).text.length, 4096);
});

test('link codes: explicit command, or a bare code of the Gladys alphabet', () => {
  assert.equal(linkCodeOf('/link ab23cd45'), 'AB23CD45');
  assert.equal(linkCodeOf('link AB23CD45', { bare: false }), 'AB23CD45');
  assert.equal(linkCodeOf('!lier AB23CD45', { bare: false }), 'AB23CD45');
  assert.equal(linkCodeOf(' AB23CD45 '), 'AB23CD45');
  assert.equal(linkCodeOf('AB23CD45', { bare: false }), undefined);
  assert.equal(linkCodeOf('hello'), undefined);
  assert.equal(linkCodeOf('AB0OCD45'), undefined, '0 and O are not in the alphabet');
  assert.equal(linkCodeOf('turn on the lights'), undefined);
});

test('commands: the folded word after !, and the scene event', () => {
  assert.deepEqual(parseCommand('!Lumière salon  bleu'), {
    command: 'lumiere',
    args: 'salon  bleu',
  });
  assert.deepEqual(parseCommand('!garage'), { command: 'garage', args: '' });
  assert.equal(parseCommand('garage'), undefined);
  assert.equal(parseCommand('!'), undefined);
  assert.equal(fold('ÉTÉ'), 'ete');
  const event = commandEvent(
    { command: 'garage', args: 'open' },
    {
      text: '!garage open',
      userId: '22',
      username: 'alice',
      contact: { user: { first_name: 'John', selector: 'john' } },
    },
  );
  assert.deepEqual(event, {
    key: 'command_received',
    data: {
      command: 'garage',
      text: 'open',
      message: '!garage open',
      user: 'John',
      user_selector: 'john',
      discord_user_id: '22',
      discord_username: 'alice',
    },
  });
});

test('the configuration and the replies', () => {
  const config = normalizeConfig({
    bot_token: ' Bot abc.def ',
    allowed_user_ids: '220000000000000001, 220000000000000002 nope;220000000000000001',
    notification_channel_id: 'not an id',
  });
  assert.equal(config.token, 'abc.def');
  assert.deepEqual(config.allowedUserIds, ['220000000000000001', '220000000000000002']);
  assert.equal(config.notificationChannelId, '');
  assert.deepEqual(parseIds(undefined), []);
  assert.deepEqual(normalizeConfig(), { token: '', allowedUserIds: [], notificationChannelId: '' });
  assert.equal(replyText(T.reply.textOnly, 'fr'), 'Je ne lis que les messages texte.');
  assert.equal(replyText(T.reply.textOnly, 'de'), 'I only read text messages.');
  assert.match(replyText(T.reply.textOnly), /text messages\.\n\nJe ne lis/);
  assert.equal(
    inviteUrl('42', '35840'),
    'https://discord.com/oauth2/authorize?client_id=42&scope=bot&permissions=35840',
  );
});
