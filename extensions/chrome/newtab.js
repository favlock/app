import { FAVLOCK_CONFIG } from "./config.js";

function openDashboard() {
  window.location.replace(FAVLOCK_CONFIG.dashboardUrl);
}

openDashboard();
