import { NeynarAPIClient } from "@neynar/nodejs-sdk";

let cachedClient: NeynarAPIClient | null | undefined;

export function getNeynarClient(): NeynarAPIClient | null {
  if (cachedClient !== undefined) return cachedClient;
  const apiKey = process.env.NEYNAR_API_KEY;
  if (!apiKey) {
    cachedClient = null;
    return null;
  }
  cachedClient = new NeynarAPIClient({ apiKey });
  return cachedClient;
}
