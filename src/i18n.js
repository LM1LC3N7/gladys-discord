// -----------------------------------------------------------------------------
// Runtime texts: the connection status and the button results shown in
// Gladys ({ en, fr }), and the bot's replies in Discord (picked in the
// language of the linked Gladys user, both languages when it is unknown).
// -----------------------------------------------------------------------------

export const T = {
  noToken: {
    en: 'Paste the token of your Discord bot (Developer Portal → your application → Bot → Reset Token), then save.',
    fr: 'Collez le jeton de votre bot Discord (Developer Portal → votre application → Bot → Reset Token), puis enregistrez.',
  },
  badToken: {
    en: 'Discord refused the bot token: copy it again from the Developer Portal (Bot → Reset Token), then save.',
    fr: 'Discord a refusé le jeton du bot : copiez-le à nouveau depuis le Developer Portal (Bot → Reset Token), puis enregistrez.',
  },
  intents: (code) => ({
    en: `Discord refused the gateway intents (code ${code}). The integration only asks for direct messages, which need no privileged intent: check the bot in the Developer Portal, then save the configuration to retry.`,
    fr: `Discord a refusé les intents de la passerelle (code ${code}). L'intégration ne demande que les messages privés, qui n'exigent aucun intent privilégié : vérifiez le bot dans le Developer Portal, puis enregistrez la configuration pour réessayer.`,
  }),
  fatal: (code) => ({
    en: `Discord closed the connection for good (code ${code}). Save the configuration to retry.`,
    fr: `Discord a fermé la connexion définitivement (code ${code}). Enregistrez la configuration pour réessayer.`,
  }),
  connected: (bot, linked) => ({
    en: `Connected as ${bot}. ${linked} linked account${linked === 1 ? '' : 's'}: to link yours, click "Generate a link code" and send the code to the bot in a direct message.`,
    fr: `Connecté en tant que ${bot}. ${linked} compte${linked > 1 ? 's' : ''} lié${linked > 1 ? 's' : ''} : pour lier le vôtre, cliquez sur « Générer un code de liaison » et envoyez le code au bot en message privé.`,
  }),
  reconnecting: {
    en: 'The connection to Discord dropped: reconnecting…',
    fr: 'La connexion à Discord est perdue : reconnexion en cours…',
  },
  unreachable: (message) => ({
    en: `Discord is unreachable: ${message}. Retrying.`,
    fr: `Discord est injoignable : ${message}. Nouvel essai en cours.`,
  }),
  test: ({ bot, gateway, linked, channel, invite }) => ({
    en: [
      `Bot: ${bot}.`,
      `Gateway (direct messages): ${gateway ? 'connected' : 'not connected'}.`,
      `Linked accounts: ${linked}.`,
      channel ? `Default channel: ${channel}.` : 'No default channel.',
      `Invite link: ${invite}`,
    ].join('\n'),
    fr: [
      `Bot : ${bot}.`,
      `Passerelle (messages privés) : ${gateway ? 'connectée' : 'non connectée'}.`,
      `Comptes liés : ${linked}.`,
      channel ? `Salon par défaut : ${channel}.` : 'Aucun salon par défaut.',
      `Lien d'invitation : ${invite}`,
    ].join('\n'),
  }),
  channelProblem: (id, message) => ({
    en: `the channel ${id} is not reachable (${message}): check the id and that the bot was invited to that server`,
    fr: `le salon ${id} est inaccessible (${message}) : vérifiez l'identifiant et que le bot a été invité sur ce serveur`,
  }),

  // --- Replies in Discord ----------------------------------------------------
  reply: {
    notLinked: {
      en: 'This Discord account is not linked to Gladys yet. In Gladys, open the Discord integration, click "Generate a link code" and send me the 8-character code it shows.',
      fr: "Ce compte Discord n'est pas encore lié à Gladys. Dans Gladys, ouvrez l'intégration Discord, cliquez sur « Générer un code de liaison » et envoyez-moi le code de 8 caractères affiché.",
    },
    badCode: {
      en: 'This code is invalid or expired (a code works once, for 15 minutes). Generate a new one in Gladys and send it again.',
      fr: 'Ce code est invalide ou expiré (un code ne sert qu’une fois, pendant 15 minutes). Générez-en un nouveau dans Gladys et renvoyez-le.',
    },
    linked: (name) => ({
      en: `Linked! Hello ${name}, you can now talk to Gladys here. A message starting with ! (like !garage) runs your "Discord command" scenes instead.`,
      fr: `Compte lié ! Bonjour ${name}, vous pouvez maintenant parler à Gladys ici. Un message qui commence par ! (comme !garage) lance plutôt vos scènes « Commande Discord ».`,
    }),
    textOnly: {
      en: 'I only read text messages.',
      fr: 'Je ne lis que les messages texte.',
    },
    commandSent: (command) => ({
      en: `Command "${command}" passed to your scenes.`,
      fr: `Commande « ${command} » transmise à vos scènes.`,
    }),
    unavailable: {
      en: 'Gladys could not take this message right now: try again in a moment.',
      fr: 'Gladys n’a pas pu prendre ce message pour le moment : réessayez dans un instant.',
    },
  },
};

/**
 * A reply in the language of the linked user; both languages when the
 * sender is unknown (Discord does not tell a bot the language of a DM).
 */
export function replyText(text, language) {
  if (language === 'fr' || language === 'en') {
    return text[language];
  }
  if (language) {
    return text.en;
  }
  return `${text.en}\n\n${text.fr}`;
}
