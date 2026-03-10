import { registryBackedTool } from "../registry-backed-tool";

export const getUser = registryBackedTool({
  registryName: "get-user",
  description:
    "Get user details including FID and verified addresses for a given Farcaster profile given their fname (username)",
});
