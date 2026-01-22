import type { Tool } from "../tool";
import { getUser } from "./get-user";
import { getUserPrompt } from "./get-user-prompt";

export const getUserTool = {
  name: "getUser",
  prompt: getUserPrompt,
  tool: getUser,
} satisfies Tool;
