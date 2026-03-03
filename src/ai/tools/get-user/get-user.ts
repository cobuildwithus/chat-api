import { z } from "zod";
import { registryBackedTool } from "../registry-backed-tool";

export const getUser = registryBackedTool({
  registryName: "get-user",
  inputSchema: z.object({ fname: z.string() }),
  description:
    "Get user details including FID and verified addresses for a given Farcaster profile given their fname (username)",
});
