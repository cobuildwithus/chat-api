import { beforeEach, describe, expect, it } from "vitest";
import { getUser } from "../../../src/ai/tools/get-user/get-user";
import { farcasterProfiles } from "../../../src/infra/db/schema";
import { queueCobuildDbResponse, resetAllMocks, setCobuildDbResponse } from "../../utils/mocks/db";

describe("getUser tool", () => {
  beforeEach(() => {
    resetAllMocks();
  });

  it("returns exact match user details", async () => {
    setCobuildDbResponse(farcasterProfiles, [
      { fid: 1, fname: "alice", verifiedAddresses: ["0xabc"] },
    ]);

    const result = await getUser.execute!({ fname: "alice" } as any, {} as any);
    expect(result).toEqual({ fid: 1, fname: "alice", addresses: ["0xabc"] });
  });

  it("returns fuzzy matches when exact match is missing", async () => {
    queueCobuildDbResponse(farcasterProfiles, []);
    queueCobuildDbResponse(farcasterProfiles, [
      { fid: 2, fname: "alice2", verifiedAddresses: [] },
    ]);

    const result = await getUser.execute!({ fname: "ali" } as any, {} as any);
    expect(result).toEqual({
      usedLikeQuery: true,
      users: [{ fid: 2, fname: "alice2", verifiedAddresses: [] }],
    });
  });
});
