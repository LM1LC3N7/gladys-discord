# Discord

**Connecteur non officiel, sans lien avec Discord.** Il fait d'un bot Discord
que vous créez un canal de messagerie de Gladys, comme celui de Telegram :
vous parlez à Gladys en message privé avec votre bot, et Gladys vous y répond
et vous y notifie. Discord est une marque de Discord Inc.

## Ce que vous obtenez

| Élément                    | Contenu                                                                                                                                              |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Discussion avec Gladys** | chaque message privé envoyé au bot va à Gladys, la réponse revient dans la même conversation                                                         |
| **Notifications**          | les messages que Gladys vous envoie (action de scène « Envoyer un message », images de caméra, messages système) arrivent en messages privés Discord |
| **Déclencheur de scène**   | **Commande Discord reçue** : un message privé qui commence par `!`, comme `!garage ouvre`, lance vos scènes au lieu d'aller à l'assistant            |
| **Action de scène**        | **Publier dans un salon Discord** : un texte dans un salon d'un serveur (un serveur familial, un salon de journal de la maison…)                     |
| **Configuration**          | le bouton **Tester le bot** vérifie le jeton, la connexion et le salon par défaut, et donne le lien d'invitation du bot                              |

## Installation

### Créer le bot

1. Ouvrez le [Discord Developer Portal](https://discord.com/developers/applications)
   et cliquez sur **New Application**. Donnez-lui un nom, par exemple
   « Gladys ».
2. Ouvrez la page **Bot** et cliquez sur **Reset Token**, puis copiez le
   jeton. C'est le mot de passe de votre bot : ne le partagez jamais. Vous
   pouvez aussi désactiver **Public Bot**, pour être seul à pouvoir
   l'inviter.
3. Laissez désactivés les trois **Privileged Gateway Intents** :
   l'intégration ne lit que les messages privés, et Discord en transmet le
   texte à un bot sans aucun intent privilégié (l'intent « Message Content »
   ne sert qu'aux messages des serveurs).

### Le relier à Gladys

4. Dans Gladys, collez le jeton dans **Jeton du bot** et enregistrez. Le
   statut affiche « Connecté en tant que … » après quelques secondes.
5. Cliquez sur **Tester le bot** : le résultat se termine par le **lien
   d'invitation** de votre bot.

### L'inviter sur un serveur dont vous êtes membre

Discord ne laisse un bot et une personne échanger des messages privés que
s'ils partagent un serveur.

6. Ouvrez le lien d'invitation et choisissez un serveur dont vous êtes
   membre. Pas de serveur à vous ? Dans Discord, cliquez sur **+** puis
   **Créer le mien** : un serveur privé avec vous seul (et votre famille)
   convient parfaitement. Ce lien est celui que construirait la page
   **OAuth2 → URL Generator** du portail avec la portée `bot` et les
   permissions Voir les salons, Envoyer des messages et Joindre des fichiers.
7. Vérifiez que les membres de ce serveur peuvent vous écrire en privé : nom
   du serveur → **Paramètres de confidentialité** → **Messages privés**
   activés.

### Lier votre compte Discord

8. Dans Gladys, sur la page de l'intégration, cliquez sur **Générer un code
   de liaison** dans le bloc **Lier mon compte** : un code de 8 caractères
   s'affiche (il ne sert qu'une fois, pendant 15 minutes).
9. Dans Discord, ouvrez une conversation privée avec le bot (cliquez sur son
   nom dans la liste des membres du serveur, puis **Message**) et envoyez le
   code. Le bot répond « Compte lié ! Bonjour … ».

Chaque utilisateur de Gladys qui veut Discord fait de même avec son propre
compte Discord. Un utilisateur peut délier son compte depuis le même bloc à
tout moment.

## Parler à Gladys

- Chaque message privé d'un compte lié va à Gladys, avec l'autorité de
  l'utilisateur Gladys lié, exactement comme le chat de Gladys. Comme le chat
  de Gladys, l'assistant a besoin de Gladys Plus : sans lui, Gladys répond
  que Gladys Plus est requis (les commandes `!` ci-dessous fonctionnent sans).
- Les réponses et les notifications arrivent dans la même conversation. Un
  texte plus long que les 2 000 caractères d'un message Discord est découpé,
  et une image de caméra arrive en image.
- Un compte non lié reçoit les instructions de liaison, rien d'autre.

## Commandes de scène avec `!`

Un message privé qui commence par `!` n'est **pas** envoyé à l'assistant : il
déclenche le déclencheur de scène **Commande Discord reçue**, et le bot
confirme « Commande « garage » transmise à vos scènes ». Seuls les comptes
liés peuvent le faire.

- Le filtre **Commande** est le mot juste après le `!`. Gladys le compare
  exactement : saisissez-le donc **en minuscules et sans accents**.
  L'intégration met en minuscules et retire les accents de ce que vous
  envoyez, si bien que `!Garage`, `!garage` et `!GARAGE` correspondent tous
  au filtre `garage`. Laissez le filtre vide pour réagir à toutes les
  commandes.
- La scène peut utiliser les détails du message : la commande, le texte qui
  la suit (`!garage ouvre` donne `ouvre`), le message complet, l'utilisateur
  Gladys (prénom et sélecteur) et l'utilisateur Discord (identifiant et nom).

Par exemple : déclencheur **Commande Discord reçue** avec la commande
`garage`, puis l'action qui ouvre la porte du garage ; vous l'ouvrez en
envoyant `!garage` au bot.

## Publier dans un salon de serveur

L'action de scène **Publier dans un salon Discord** publie un texte dans un
salon d'un serveur dont le bot est membre. Donnez-lui l'**identifiant du
salon**, ou remplissez **Identifiant du salon par défaut** dans la
configuration et laissez le champ vide. Pour copier un identifiant, activez
le **Mode développeur** (paramètres Discord → **Avancés**), puis clic droit
sur le salon → **Copier l'identifiant du salon**. Le bot a besoin des
permissions Voir le salon et Envoyer des messages dans ce salon. L'action
renvoie l'identifiant du message publié.

## Options

- **Identifiants Discord autorisés** : une liste de sécurité. Si elle est
  remplie, le bot ignore les messages privés de toute autre personne, codes
  de liaison compris, sans répondre. Clic droit sur un utilisateur →
  **Copier l'identifiant de l'utilisateur** (Mode développeur).
- **Identifiant du salon par défaut** : le salon de l'action **Publier dans
  un salon Discord** quand l'action n'en précise aucun.

## En cas de problème

- **« Discord a refusé le jeton du bot »** : le jeton a été régénéré ou mal
  copié. Cliquez sur **Reset Token** dans le portail, collez le nouveau et
  enregistrez.
- **Le bot ne répond pas** : vérifiez le statut de l'intégration, la liste
  des identifiants autorisés, et que le bot est sur un serveur que vous
  partagez. Un message d'un compte non lié reçoit les instructions de
  liaison.
- **« Discord refuses to deliver a direct message »** : la personne ne
  partage plus de serveur avec le bot, ou bloque les messages privés des
  membres de ce serveur.
- **« Ce code est invalide ou expiré »** : un code ne sert qu'une fois,
  pendant 15 minutes ; générez-en un nouveau.
- Une courte perte de connexion à Discord est normale : l'intégration reprend
  la session d'elle-même, et ne la signale qu'au bout de 30 secondes.
- Journaux : le niveau de journalisation de l'intégration se règle avec la
  variable `LOG_LEVEL`.

## Confidentialité

Le jeton du bot est stocké chiffré par Gladys et n'est envoyé qu'à Discord.
Vos messages transitent par Discord comme tout message Discord.
L'intégration n'écrit rien sur le disque : Gladys ne garde que le lien entre
un identifiant Discord et un utilisateur Gladys, que vous pouvez supprimer
depuis le bloc **Lier mon compte**.
