// -----------------------------------------------------------------------------
// Entry point: SDK wiring only. Every handler is registered BEFORE connect(),
// and delegates to the DiscordApp (src/app.js).
//
// Environment variables provided by the Gladys supervisor, read by the SDK:
// GLADYS_HOST_API_URL, GLADYS_INTEGRATION_TOKEN, GLADYS_INTEGRATION_SELECTOR.
// -----------------------------------------------------------------------------

import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';
import { DiscordApp } from './src/app.js';
import { ACTIONS, SCENE_ACTIONS } from './src/constants.js';

const gladys = new GladysIntegration();
const app = new DiscordApp({ gladys });

// --- Messaging channel: Gladys answers and notifies a linked user ------------
gladys.onSendMessage((contact, message) => app.sendMessage(contact, message));

// --- Scene action ---------------------------------------------------------------
gladys.onSceneAction(SCENE_ACTIONS.POST, (fields) => app.postInChannel(fields));

// --- Configuration screen button ----------------------------------------------
gladys.onAction(ACTIONS.TEST, () => app.testConnection());

// --- Configuration changed by the user ----------------------------------------
gladys.onConfigUpdated((config) => {
  logger.info('Configuration updated');
  return app.start(config);
});

// --- Connection lifecycle ------------------------------------------------------
// The gateway stays up while Gladys is unreachable: a reconnection with the
// same configuration keeps the Discord session (see DiscordApp.start).
gladys.on('connected', async () => {
  try {
    await app.start(await gladys.getConfig());
  } catch (err) {
    logger.error('Start failed', err);
  }
});
gladys.handleShutdown(() => app.stop());

logger.info('Starting the Discord integration...');
gladys.connect().catch((err) => {
  logger.error('Initial connection failed', err);
  process.exit(1);
});
