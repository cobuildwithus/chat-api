import type { FarcasterProfile } from "../../infra/db/schema";
import { getFarcasterProfileByAddress } from "../../infra/db/queries/profiles/get-profile";
import type { ChatUser } from "../types";

export const getUserDataPrompt = async (user: ChatUser) => {
  const farcasterProfile = await getFarcasterProfileByAddress(user.address);

  return `## User data

  ${user.address ? `The address of the user is ${user.address}. ` : "The user is not logged in. "}

  ${getLocationPrompt(user)}

  ${getUserAgentPrompt(user)}

  ${await getFarcasterProfilePrompt(farcasterProfile)}
  `;
};

function getLocationPrompt(user: ChatUser): string {
  const { country, countryRegion, city } = user;
  if (!city && !country && !countryRegion) return "";

  return `### Language and location\n\nHere is the user's location: ${city}, ${country}, ${countryRegion} from geolocation. If the user is not in the US or English speaking country, feel free to ask questions in their language. At the start, you may want to ask user which language they prefer in conversation with you. In the same message do not ask more questions - let the user first pick the language. Do not mention you know the city - it may be not accurate.`;
}

function getUserAgentPrompt(user: ChatUser): string {
  const userAgent = user.userAgent;
  if (!userAgent) return "";

  return `### User agent\n\nHere is the user agent: ${userAgent}. If the user is on mobile, you should be incredibly concise and to the point. They do not have a lot of time or space to read, so you must be incredibly concise and keep your questions and responses to them short in as few words as possible, unless they ask for clarification or it's otherwise necessary.`;
}

async function getFarcasterProfilePrompt(profile: FarcasterProfile | null) {
  if (!profile) {
    return "The user has no Farcaster account connected to the address. Please prompt them to verify their address by to click their profile picture in the top right corner of the app.";
  }

  return `Here is the user's Farcaster profile: ${JSON.stringify(profile)}. You may learn something about the user from this information.

    In context of Farcaster account please refer to the 'username' field (@username), not 'displayName'.`;
}
