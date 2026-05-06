import "./styles.css";
import "./sentry.js";
import { state } from "./state.js";
import { render } from "./render.js";
import { registerEvents } from "./events.js";
import { handleGoogleCallback, handleOwnerInviteFromUrl, loadAuthProviders } from "./controllers/auth.js";
import { loadDashboard } from "./lifecycle.js";

async function bootstrap() {
  registerEvents();

  state.initializing = false;

  const handledOwnerInvite = await handleOwnerInviteFromUrl();
  if (handledOwnerInvite) {
    return;
  }

  render();
  void loadAuthProviders();

  const handledGoogleCallback = await handleGoogleCallback();
  if (handledGoogleCallback) {
    return;
  }

  if (state.session) {
    await loadDashboard();
    return;
  }

  render();
}

void bootstrap();
