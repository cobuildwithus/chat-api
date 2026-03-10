import { describe, expect, it } from "vitest";
import { z } from "zod";
import { cobuildAiContextTool } from "../../../src/ai/tools/cobuild-ai-context/tool";
import { getBudgetTool } from "../../../src/ai/tools/get-budget/tool";
import { getCastTool } from "../../../src/ai/tools/get-cast/get-cast";
import { getDiscussionThreadTool } from "../../../src/ai/tools/get-discussion-thread/get-discussion-thread";
import { getDisputeTool } from "../../../src/ai/tools/get-dispute/tool";
import { getGoalTool } from "../../../src/ai/tools/get-goal/tool";
import { getPremiumEscrowTool } from "../../../src/ai/tools/get-premium-escrow/tool";
import { getStakePositionTool } from "../../../src/ai/tools/get-stake-position/tool";
import { getTcrRequestTool } from "../../../src/ai/tools/get-tcr-request/tool";
import { getUser } from "../../../src/ai/tools/get-user/get-user";
import { listDiscussionsTool } from "../../../src/ai/tools/list-discussions/list-discussions";
import { registryBackedTool } from "../../../src/ai/tools/registry-backed-tool";
import { semanticSearchCastsTool } from "../../../src/ai/tools/semantic-search-casts/semantic-search-casts";
import { resolveToolInputSchema } from "../../../src/tools/registry";

describe("registry-backed AI tools", () => {
  it("reuse the canonical registry input schemas", () => {
    expect(getUser.inputSchema).toBe(resolveToolInputSchema("get-user"));
    expect(getGoalTool.tool.inputSchema).toBe(resolveToolInputSchema("get-goal"));
    expect(getBudgetTool.tool.inputSchema).toBe(resolveToolInputSchema("get-budget"));
    expect(getTcrRequestTool.tool.inputSchema).toBe(resolveToolInputSchema("get-tcr-request"));
    expect(getDisputeTool.tool.inputSchema).toBe(resolveToolInputSchema("get-dispute"));
    expect(getStakePositionTool.tool.inputSchema).toBe(resolveToolInputSchema("get-stake-position"));
    expect(getPremiumEscrowTool.tool.inputSchema).toBe(resolveToolInputSchema("get-premium-escrow"));
    expect(getCastTool.tool.inputSchema).toBe(resolveToolInputSchema("get-cast"));
    expect(listDiscussionsTool.tool.inputSchema).toBe(resolveToolInputSchema("list-discussions"));
    expect(getDiscussionThreadTool.tool.inputSchema).toBe(resolveToolInputSchema("get-discussion-thread"));
    expect(semanticSearchCastsTool.tool.inputSchema).toBe(resolveToolInputSchema("semantic-search-casts"));
    expect(cobuildAiContextTool.tool.inputSchema).toBe(resolveToolInputSchema("get-treasury-stats"));
  });

  it("preserve get-cast defaults when the model omits type", () => {
    const getCastSchema = resolveToolInputSchema("get-cast");
    expect(getCastSchema).toBeTruthy();
    const parsed = getCastSchema?.safeParse({
      identifier: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    });
    expect(parsed?.success).toBe(true);
    if (parsed?.success) {
      expect(parsed.data).toEqual({
        identifier: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        type: "hash",
      });
    }
  });

  it("preserve list-discussions defaults for empty AI input", () => {
    const listDiscussionsSchema = resolveToolInputSchema("list-discussions");
    expect(listDiscussionsSchema).toBeTruthy();
    const parsed = listDiscussionsSchema?.safeParse({});
    expect(parsed?.success).toBe(true);
    if (parsed?.success) {
      expect(parsed.data).toEqual({
        limit: 20,
        offset: 0,
        sort: "last",
        direction: "desc",
      });
    }
  });

  it("retain AI-facing field descriptions on the canonical shared schemas", () => {
    const goalSchema = resolveToolInputSchema("get-goal") as z.ZodObject<any> | null;
    const listSchema = resolveToolInputSchema("list-discussions") as z.ZodObject<any> | null;
    const threadSchema = resolveToolInputSchema("get-discussion-thread") as z.ZodObject<any> | null;
    const semanticSchema = resolveToolInputSchema("semantic-search-casts") as z.ZodObject<any> | null;

    expect(goalSchema?.shape.identifier.description).toBe(
      "Goal treasury address, canonical route slug, or canonical route domain.",
    );
    expect(listSchema?.shape.limit.description).toBe(
      "Maximum number of discussion roots to return.",
    );
    expect(threadSchema?.shape.focusHash.description).toBe(
      "Optional reply hash to center pagination around.",
    );
    expect(semanticSchema?.shape.query.description).toBe(
      "Natural-language query for semantic matching.",
    );
  });

  it("refuses bearer-only registry tools unless they are explicitly marked chat-safe", () => {
    expect(() =>
      registryBackedTool({
        registryName: "get-wallet-balances",
        description: "should stay bearer-only",
      }),
    ).toThrow('Registry-backed AI tool "get-wallet-balances" must be explicitly marked chat-safe.');
  });
});
