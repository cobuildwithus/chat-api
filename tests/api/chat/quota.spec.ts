import { beforeEach, describe, expect, it, vi } from "vitest";
import { admitAiGeneration } from "../../../src/ai/ai-rate.limit";
import { acquireRedisSemaphoreLease } from "../../../src/infra/redis";
import {
  checkAndRecordUsage,
  getUsage,
  recordUsage,
  removeRecordedUsage,
} from "../../../src/infra/rate-limit";

vi.mock("../../../src/infra/rate-limit", () => ({
  checkAndRecordUsage: vi.fn(),
  getUsage: vi.fn(),
  recordUsage: vi.fn(),
  removeRecordedUsage: vi.fn(),
}));

vi.mock("../../../src/infra/redis", () => ({
  acquireRedisSemaphoreLease: vi.fn(),
}));

type MockLease = {
  member: string;
  release: ReturnType<typeof vi.fn>;
};

function createLease(member: string): MockLease {
  return {
    member,
    release: vi.fn().mockResolvedValue(undefined),
  };
}

describe("chat quota admission", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NODE_ENV = "development";
  });

  it("keeps concurrent quota admission atomic so admitted work never exceeds the remaining allowance", async () => {
    const userLeases = new Map<string, MockLease>();
    const chatLeases = new Map<string, MockLease>();
    vi.mocked(acquireRedisSemaphoreLease).mockImplementation(async (key, options) => {
      const lease = createLease(String(options.member));
      if (key.startsWith("ai:inflight:user:")) {
        userLeases.set(String(options.member), lease);
      } else {
        chatLeases.set(String(options.member), lease);
      }
      return lease;
    });

    let reservedUsage = 0;
    const remainingAllowance = 2_000;
    vi.mocked(checkAndRecordUsage).mockImplementation(async (_key, options) => {
      await Promise.resolve();

      if (reservedUsage + options.usageToAdd > remainingAllowance) {
        return {
          allowed: false,
          usage: reservedUsage,
          retryAfterSeconds: 17,
        };
      }

      reservedUsage += options.usageToAdd;
      return {
        allowed: true,
        usage: reservedUsage,
        retryAfterSeconds: 0,
        memberValue: options.memberValue,
      };
    });

    const results = await Promise.all(
      Array.from({ length: 5 }, (_, index) =>
        admitAiGeneration("0xabc", `chat-${index + 1}`, `request-${index + 1}`),
      ),
    );

    const allowed = results.filter((result) => result.allowed);
    const denied = results.filter((result) => !result.allowed);

    expect(checkAndRecordUsage).toHaveBeenCalledTimes(5);
    expect(allowed).toHaveLength(2);
    expect(
      allowed.reduce(
        (total, result) => total + (result.allowed ? result.admission.reservedUsage : 0),
        0,
      ),
    ).toBe(remainingAllowance);
    expect(denied).toEqual(
      Array.from({ length: 3 }, () => ({
        allowed: false,
        code: "rate-limited",
        retryAfterSeconds: 17,
      })),
    );

    expect(vi.mocked(checkAndRecordUsage).mock.calls).toEqual(
      expect.arrayContaining([
        [
          "ai:0xabc",
          expect.objectContaining({
            usageToAdd: 1_000,
            memberValue: "1000|request-1",
          }),
        ],
        [
          "ai:0xabc",
          expect.objectContaining({
            usageToAdd: 1_000,
            memberValue: "1000|request-2",
          }),
        ],
      ]),
    );

    for (const requestId of ["request-3", "request-4", "request-5"]) {
      expect(userLeases.get(requestId)?.release).toHaveBeenCalledTimes(1);
      expect(chatLeases.get(requestId)?.release).toHaveBeenCalledTimes(1);
    }

    for (const result of allowed) {
      if (!result.allowed) {
        continue;
      }
      await result.admission.release();
    }

    expect(removeRecordedUsage).toHaveBeenCalledTimes(2);
    expect(removeRecordedUsage).toHaveBeenCalledWith("ai:0xabc", "1000|request-1");
    expect(removeRecordedUsage).toHaveBeenCalledWith("ai:0xabc", "1000|request-2");
    expect(recordUsage).not.toHaveBeenCalled();
    expect(getUsage).not.toHaveBeenCalled();
  });
});
