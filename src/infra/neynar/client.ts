import { NeynarAPIClient } from "@neynar/nodejs-sdk";
const NEYNAR_API_KEY_NOTIFICATIONS = process.env.NEYNAR_API_KEY_NOTIFICATIONS;
if (!NEYNAR_API_KEY_NOTIFICATIONS) {
  throw new Error("NEYNAR_API_KEY_NOTIFICATIONS is not set");
}

const neynarClientNotifications = new NeynarAPIClient({
  apiKey: NEYNAR_API_KEY_NOTIFICATIONS,
});

export { neynarClientNotifications };
