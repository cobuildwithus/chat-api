import { describe, expect, it, vi } from "vitest";
import { getUserDataPrompt } from "../../../src/ai/prompts/user-data";
import { getFarcasterProfileByAddress } from "../../../src/infra/db/queries/profiles/get-profile";

vi.mock("../../../src/infra/db/queries/profiles/get-profile", () => ({
  getFarcasterProfileByAddress: vi.fn(),
}));

describe("getUserDataPrompt", () => {
  it("includes location and user agent details", async () => {
    vi.mocked(getFarcasterProfileByAddress).mockResolvedValue(null);

    const prompt = await getUserDataPrompt({
      address: "0xabc",
      city: "LA",
      country: "US",
      countryRegion: "CA",
      userAgent: "Mozilla/5.0 (iPhone)",
    });

    expect(prompt).toContain("0xabc");
    expect(prompt).toContain("Language and location");
    expect(prompt).toContain("User agent");
    expect(prompt).toContain("no Farcaster account");
  });

  it("includes farcaster profile when available", async () => {
    vi.mocked(getFarcasterProfileByAddress).mockResolvedValue({
      fid: 123,
      fname: "alice",
      displayName: "Alice",
      avatarUrl: "url",
      bio: "bio",
      verifiedAddresses: ["0xabc"],
      manualVerifiedAddresses: [],
      updatedAt: new Date().toISOString(),
    } as any);

    const prompt = await getUserDataPrompt({
      address: "0xabc",
      city: null,
      country: null,
      countryRegion: null,
      userAgent: null,
    });

    expect(prompt).toContain("Farcaster profile");
    expect(prompt).toContain("alice");
  });
});
