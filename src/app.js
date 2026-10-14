// -----------------------------------------------------------------------------
// The integration itself: the bot (REST client + gateway), the linking of
// Discord accounts to Gladys users, the incoming direct messages (to the
// brain, or to the scenes when they start with "!"), the outgoing messages
// of Gladys, the scene action and the test button. index.js only wires the
// SDK handlers to it.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { isSnowflake, normalizeConfig } from './config.js';
import { DISCONNECTED_GRACE, INTENTS, INVITE_PERMISSIONS } from './constants.js';
import { Gateway } from './discord/gateway.js';
import { DiscordClient, ERROR_CODES } from './discord/rest.js';
import { T, replyText } from './i18n.js';
import { incomingMessage, inviteUrl, linkCodeOf } from './model.js';
import { commandEvent, parseCommand } from './triggers.js';

const defaultTimers = { setTimeout, clearTimeout, setInterval, clearInterval };

/** "gladys-bot" or, for the old style names, "gladys-bot#1234". */
const botName = (user = {}) =>
  `${user.username ?? '?'}${user.discriminator && user.discriminator !== '0' ? `#${user.discriminator}` : ''}`;

export class DiscordApp {
  constructor({
    gladys,
    logger = createLogger({ name: 'discord' }),
    timers = defaultTimers,
    now = Date.now,
    sleep,
    random = Math.random,
    socketFactory,
  }) {
    this.gladys = gladys;
    this.logger = logger;
    this.timers = timers;
    this.now = now;
    this.sleep = sleep;
    this.random = random;
    this.socketFactory = socketFactory;
    this.config = normalizeConfig();
    this.fingerprint = undefined;
    this.client = undefined;
    this.gateway = undefined;
    this.bot = undefined;
    /** Discord user id -> DM channel id (known from their messages or opened). */
    this.dmChannels = new Map();
    this.graceTimer = undefined;
    this.lastStatus = undefined;
    this.generation = 0;
    /** The incoming messages being handled (the tests wait for them). */
    this.inflight = new Set();
  }

  // --- Lifecycle -------------------------------------------------------------

  async start(raw = {}) {
    const config = normalizeConfig(raw);
    const fingerprint = JSON.stringify(config);
    if (this.gateway && !this.gateway.stopped && fingerprint === this.fingerprint) {
      // Same configuration (a reconnection to Gladys, a save without change):
      // keep the gateway session, Discord limits the number of identifies.
      this.lastStatus = undefined;
      await this.refreshStatus();
      return;
    }
    this.stop();
    const generation = this.generation;
    this.config = config;
    this.fingerprint = fingerprint;
    this.dmChannels.clear();
    if (!config.token) {
      this.client = undefined;
      await this.setStatus(false, T.noToken);
      return;
    }
    this.client = new DiscordClient({ token: config.token, now: this.now, sleep: this.sleep });
    try {
      this.bot = await this.client.me();
    } catch (err) {
      if (err.status === 401) {
        await this.setStatus(false, T.badToken);
        return;
      }
      // A network problem: the gateway keeps retrying by itself.
      this.logger.warn(`Discord unreachable: ${err.message}`);
      await this.setStatus(false, T.unreachable(err.message));
    }
    if (generation !== this.generation) {
      return;
    }
    this.gateway = new Gateway({
      token: config.token,
      intents: INTENTS.DIRECT_MESSAGES,
      onDispatch: (type, data) => this.onDispatch(generation, type, data),
      onStatus: (status) => this.onGatewayStatus(generation, status),
      logger: this.logger,
      timers: this.timers,
      random: this.random,
      ...(this.socketFactory ? { socketFactory: this.socketFactory } : {}),
    });
    this.gateway.start();
  }

  stop() {
    this.generation += 1;
    this.timers.clearTimeout(this.graceTimer);
    this.graceTimer = undefined;
    this.gateway?.stop();
    this.gateway = undefined;
  }

  /** Resolves once every incoming message received so far is handled. */
  async idle() {
    while (this.inflight.size > 0) {
      await Promise.allSettled([...this.inflight]);
    }
  }

  async setStatus(connected, message) {
    const key = JSON.stringify([connected, message ?? null]);
    if (key === this.lastStatus) {
      return;
    }
    this.lastStatus = key;
    await this.gladys
      .setConnectionStatus(connected, message)
      .catch((err) => this.logger.warn(`setConnectionStatus failed: ${err.message}`));
  }

  async linkedCount() {
    try {
      return (await this.gladys.getContacts()).length;
    } catch (err) {
      this.logger.warn(`Linked contacts unavailable: ${err.message}`);
      return 0;
    }
  }

  async refreshStatus() {
    if (this.gateway?.connected) {
      await this.setStatus(true, T.connected(botName(this.bot), await this.linkedCount()));
    }
  }

  async onGatewayStatus(generation, status) {
    if (generation !== this.generation) {
      return;
    }
    if (status.state === 'connected') {
      this.timers.clearTimeout(this.graceTimer);
      this.graceTimer = undefined;
      if (status.user) {
        this.bot = status.user;
      }
      this.logger.info(`Gateway connected as ${botName(this.bot)}`);
      await this.refreshStatus();
    } else if (status.state === 'disconnected') {
      // A resume takes a second or two: only a lasting outage turns red.
      this.graceTimer ??= this.timers.setTimeout(() => {
        this.graceTimer = undefined;
        if (generation === this.generation) {
          this.setStatus(false, T.reconnecting);
        }
      }, DISCONNECTED_GRACE);
    } else if (status.state === 'fatal') {
      this.timers.clearTimeout(this.graceTimer);
      this.graceTimer = undefined;
      let message = T.fatal(status.code);
      if (status.reason === 'bad_token') {
        message = T.badToken;
      } else if (status.reason === 'invalid_intents' || status.reason === 'disallowed_intents') {
        message = T.intents(status.code);
      }
      await this.setStatus(false, message);
    }
  }

  onDispatch(generation, type, data) {
    if (generation !== this.generation || type !== 'MESSAGE_CREATE') {
      return;
    }
    const task = this.handleMessage(data)
      .catch((err) => this.logger.warn(`Handling a Discord message failed: ${err.message}`))
      .finally(() => this.inflight.delete(task));
    this.inflight.add(task);
  }

  // --- Incoming direct messages ------------------------------------------------

  async contactOf(userId) {
    const contacts = await this.gladys.getContacts();
    return contacts.find((contact) => contact.contact_id === userId);
  }

  async reply(message, text, language) {
    try {
      await this.client.send(message.channelId, { text: replyText(text, language) });
    } catch (err) {
      this.logger.warn(`Reply to ${message.userId} failed: ${err.message}`);
    }
  }

  async handleMessage(data) {
    const message = incomingMessage(data);
    // Server messages, bots (this one included) and webhooks are not for Gladys.
    if (!message.direct || message.fromBot || !message.userId || message.userId === this.bot?.id) {
      return;
    }
    this.dmChannels.set(message.userId, message.channelId);
    const allowed = this.config.allowedUserIds;
    if (allowed.length > 0 && !allowed.includes(message.userId)) {
      this.logger.info(`Ignored a direct message from ${message.userId} (not in the allowed list)`);
      return;
    }
    if (!message.text) {
      const contact = await this.contactOf(message.userId).catch(() => undefined);
      await this.reply(message, T.reply.textOnly, contact?.user?.language);
      return;
    }
    const code = linkCodeOf(message.text, { bare: false });
    if (code) {
      await this.link(message, code);
      return;
    }
    const command = parseCommand(message.text);
    if (command) {
      await this.command(message, command);
      return;
    }
    try {
      await this.gladys.publishMessage(message.userId, message.text);
    } catch (err) {
      if (err.status !== 404) {
        this.logger.warn(`publishMessage failed: ${err.message}`);
        await this.reply(message, T.reply.unavailable);
        return;
      }
      // Not linked yet: a bare code is the linking attempt.
      const bare = linkCodeOf(message.text);
      if (bare) {
        await this.link(message, bare);
      } else {
        await this.reply(message, T.reply.notLinked);
      }
    }
  }

  async link(message, code) {
    let user;
    try {
      user = await this.gladys.linkContact(
        code,
        message.userId,
        message.displayName || message.username,
      );
    } catch (err) {
      if (err.status === 404) {
        await this.reply(message, T.reply.badCode);
        return;
      }
      throw err;
    }
    this.logger.info(`Discord user ${message.userId} linked to the Gladys user ${user?.selector}`);
    await this.reply(message, T.reply.linked(user?.first_name ?? ''), user?.language ?? 'en');
    await this.refreshStatus();
  }

  /** "!garage open": a scene command, never sent to the brain. */
  async command(message, command) {
    let contact;
    try {
      contact = await this.contactOf(message.userId);
      if (contact) {
        const event = commandEvent(command, {
          text: message.text,
          userId: message.userId,
          username: message.username,
          contact,
        });
        await this.gladys.publishSceneEvent(event.key, event.data);
      }
    } catch (err) {
      this.logger.warn(`Command "${command.command}" not delivered: ${err.message}`);
      await this.reply(message, T.reply.unavailable, contact?.user?.language);
      return;
    }
    if (!contact) {
      await this.reply(message, T.reply.notLinked);
      return;
    }
    await this.reply(message, T.reply.commandSent(command.command), contact.user?.language ?? 'en');
  }

  // --- Outgoing messages (Gladys -> Discord) ---------------------------------

  requireClient() {
    if (!this.client) {
      throw new Error('The Discord bot token is not configured');
    }
    return this.client;
  }

  async dmChannel(userId) {
    let channelId = this.dmChannels.get(userId);
    if (!channelId) {
      channelId = (await this.requireClient().openDm(userId)).id;
      this.dmChannels.set(userId, channelId);
    }
    return channelId;
  }

  /** onSendMessage: an answer or a notification of Gladys to a linked user. */
  async sendMessage(contact = {}, message = {}) {
    const userId = String(contact?.id ?? '');
    if (!isSnowflake(userId)) {
      throw new Error(`Not a Discord user id: "${userId}"`);
    }
    try {
      const channelId = await this.dmChannel(userId);
      await this.requireClient().send(channelId, { text: message.text, file: message.file });
    } catch (err) {
      if (err.code === ERROR_CODES.CANNOT_DM_USER) {
        throw new Error(
          `Discord refuses to deliver a direct message to ${userId}: the user must share a server with the bot and allow direct messages from its members`,
          { cause: err },
        );
      }
      throw err;
    }
  }

  // --- Scene action ----------------------------------------------------------

  async postInChannel(fields = {}) {
    const channelId = String(fields.channel_id ?? '').trim() || this.config.notificationChannelId;
    if (!isSnowflake(channelId)) {
      throw new Error(
        'No Discord channel: fill the channel id of the action, or the default channel of the configuration',
      );
    }
    const text = String(fields.text ?? '').trim();
    if (!text) {
      throw new Error('The text to post is empty');
    }
    try {
      const posted = await this.requireClient().send(channelId, { text });
      return { message_id: posted?.id ?? null, channel_id: channelId };
    } catch (err) {
      if (
        [
          ERROR_CODES.UNKNOWN_CHANNEL,
          ERROR_CODES.MISSING_ACCESS,
          ERROR_CODES.MISSING_PERMISSIONS,
        ].includes(err.code)
      ) {
        throw new Error(T.channelProblem(channelId, err.message).en, { cause: err });
      }
      throw err;
    }
  }

  // --- Configuration screen button -------------------------------------------

  async testConnection() {
    if (!this.client) {
      return T.noToken;
    }
    let me;
    try {
      me = await this.client.me();
    } catch (err) {
      return err.status === 401 ? T.badToken : T.unreachable(err.message);
    }
    let applicationId = me.id;
    try {
      applicationId = (await this.client.application())?.id ?? me.id;
    } catch (err) {
      this.logger.warn(`Application unavailable, using the bot id: ${err.message}`);
    }
    let channel = { en: undefined, fr: undefined };
    const channelId = this.config.notificationChannelId;
    if (channelId) {
      try {
        const found = await this.client.channel(channelId);
        channel = { en: `#${found?.name ?? channelId}`, fr: `#${found?.name ?? channelId}` };
      } catch (err) {
        channel = T.channelProblem(channelId, err.message);
      }
    }
    const values = {
      bot: botName(me),
      gateway: Boolean(this.gateway?.connected),
      linked: await this.linkedCount(),
      invite: inviteUrl(applicationId, INVITE_PERMISSIONS),
    };
    return {
      en: T.test({ ...values, channel: channel.en }).en,
      fr: T.test({ ...values, channel: channel.fr }).fr,
    };
  }
}
