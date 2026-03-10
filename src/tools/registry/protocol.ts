import { z } from "zod";
import { isAddress } from "viem";
import {
  inspectBudget,
  inspectDispute,
  inspectGoal,
  inspectPremiumEscrow,
  inspectStakePosition,
  inspectTcrRequest,
} from "../../domains/protocol/indexed-inspect";
import {
  SHORT_PRIVATE_CACHE_CONTROL,
  failureFromPublicError,
  success,
} from "./runtime";
import type { RawRegisteredTool } from "./types";

const evmAddressInputSchema = z.string().trim().refine((value) => isAddress(value, { strict: false }));

const getGoalInputSchema = z.object({
  identifier: z
    .string()
    .trim()
    .min(1)
    .max(255)
    .describe("Goal treasury address, canonical route slug, or canonical route domain."),
}).strict();

const getBudgetInputSchema = z.object({
  identifier: z.string().trim().min(1).max(255),
}).strict();

const getTcrRequestInputSchema = z.object({
  identifier: z.string().trim().min(1).max(255),
}).strict();

const getDisputeInputSchema = z.object({
  identifier: z.string().trim().min(1).max(255),
  juror: evmAddressInputSchema.optional(),
}).strict();

const getStakePositionInputSchema = z.object({
  identifier: z.string().trim().min(1).max(255),
  account: evmAddressInputSchema,
}).strict();

const getPremiumEscrowInputSchema = z.object({
  identifier: z.string().trim().min(1).max(255),
  account: evmAddressInputSchema.optional(),
}).strict();

async function executeGetGoal(
  input: z.infer<typeof getGoalInputSchema>,
) {
  const name = "get-goal";

  try {
    const goal = await inspectGoal(input.identifier);
    if (!goal) {
      return failureFromPublicError(name, "toolEntityNotFound", { entityName: "Goal" });
    }
    return success(name, goal, SHORT_PRIVATE_CACHE_CONTROL);
  } catch {
    return failureFromPublicError(name, "toolExecutionFailed");
  }
}

async function executeGetBudget(
  input: z.infer<typeof getBudgetInputSchema>,
) {
  const name = "get-budget";

  try {
    const budget = await inspectBudget(input.identifier);
    if (!budget) {
      return failureFromPublicError(name, "toolEntityNotFound", { entityName: "Budget" });
    }
    return success(name, budget, SHORT_PRIVATE_CACHE_CONTROL);
  } catch {
    return failureFromPublicError(name, "toolExecutionFailed");
  }
}

async function executeGetTcrRequest(
  input: z.infer<typeof getTcrRequestInputSchema>,
) {
  const name = "get-tcr-request";

  try {
    const request = await inspectTcrRequest(input.identifier);
    if (!request) {
      return failureFromPublicError(name, "toolEntityNotFound", { entityName: "TCR request" });
    }
    return success(name, request, SHORT_PRIVATE_CACHE_CONTROL);
  } catch {
    return failureFromPublicError(name, "toolExecutionFailed");
  }
}

async function executeGetDispute(
  input: z.infer<typeof getDisputeInputSchema>,
) {
  const name = "get-dispute";

  try {
    const dispute = await inspectDispute(input.identifier, input.juror);
    if (!dispute) {
      return failureFromPublicError(name, "toolEntityNotFound", { entityName: "Dispute" });
    }
    return success(name, dispute, SHORT_PRIVATE_CACHE_CONTROL);
  } catch {
    return failureFromPublicError(name, "toolExecutionFailed");
  }
}

async function executeGetStakePosition(
  input: z.infer<typeof getStakePositionInputSchema>,
) {
  const name = "get-stake-position";

  try {
    const position = await inspectStakePosition(input.identifier, input.account);
    if (!position) {
      return failureFromPublicError(name, "toolEntityNotFound", { entityName: "Stake position" });
    }
    return success(name, position, SHORT_PRIVATE_CACHE_CONTROL);
  } catch {
    return failureFromPublicError(name, "toolExecutionFailed");
  }
}

async function executeGetPremiumEscrow(
  input: z.infer<typeof getPremiumEscrowInputSchema>,
) {
  const name = "get-premium-escrow";

  try {
    const escrow = await inspectPremiumEscrow(input.identifier, input.account);
    if (!escrow) {
      return failureFromPublicError(name, "toolEntityNotFound", { entityName: "Premium escrow" });
    }
    return success(name, escrow, SHORT_PRIVATE_CACHE_CONTROL);
  } catch {
    return failureFromPublicError(name, "toolExecutionFailed");
  }
}

export const protocolToolDefinitions: RawRegisteredTool[] = [
  {
    name: "get-goal",
    aliases: ["getGoal", "goal.inspect"],
    description: "Inspect indexed goal state by goal treasury address or canonical route identifier.",
    input: getGoalInputSchema,
    outputSchema: {
      type: "object",
      required: [
        "identifier",
        "goalAddress",
        "goalRevnetId",
        "state",
        "stateCode",
        "finalized",
        "project",
        "route",
        "flow",
        "stakeVault",
        "budgetTcr",
        "treasury",
        "budgets",
      ],
      properties: {
        identifier: { type: "string" },
        goalAddress: { type: "string" },
        goalRevnetId: { anyOf: [{ type: "string" }, { type: "null" }] },
        state: { anyOf: [{ type: "string" }, { type: "null" }] },
        stateCode: { anyOf: [{ type: "number" }, { type: "null" }] },
        finalized: { type: "boolean" },
        project: { anyOf: [{ type: "object" }, { type: "null" }] },
        route: { anyOf: [{ type: "object" }, { type: "null" }] },
        flow: { anyOf: [{ type: "object" }, { type: "null" }] },
        stakeVault: { anyOf: [{ type: "object" }, { type: "null" }] },
        budgetTcr: { anyOf: [{ type: "string" }, { type: "null" }] },
        treasury: { type: "object" },
        governance: { type: "object" },
        timing: { type: "object" },
        budgets: { type: "object" },
      },
      additionalProperties: false,
    },
    scopes: ["cli-tools", "protocol"],
    exposure: "chat-safe",
    sideEffects: "read",
    writeCapability: "none",
    version: "1.0.0",
    deprecated: false,
    execute: executeGetGoal,
  },
  {
    name: "get-budget",
    aliases: ["getBudget", "budget.inspect"],
    description: "Inspect indexed budget state by budget treasury address or recipient id.",
    input: getBudgetInputSchema,
    outputSchema: {
      type: "object",
      required: [
        "identifier",
        "budgetAddress",
        "recipientId",
        "goalAddress",
        "budgetTcr",
        "state",
        "stateCode",
        "finalized",
        "treasury",
        "flow",
        "governance",
      ],
      properties: {
        identifier: { type: "string" },
        budgetAddress: { type: "string" },
        recipientId: { anyOf: [{ type: "string" }, { type: "null" }] },
        goalAddress: { anyOf: [{ type: "string" }, { type: "null" }] },
        budgetTcr: { anyOf: [{ type: "string" }, { type: "null" }] },
        state: { anyOf: [{ type: "string" }, { type: "null" }] },
        stateCode: { anyOf: [{ type: "number" }, { type: "null" }] },
        finalized: { type: "boolean" },
        treasury: { type: "object" },
        flow: { anyOf: [{ type: "object" }, { type: "null" }] },
        governance: { type: "object" },
        timing: { type: "object" },
      },
      additionalProperties: false,
    },
    scopes: ["cli-tools", "protocol"],
    exposure: "chat-safe",
    sideEffects: "read",
    writeCapability: "none",
    version: "1.0.0",
    deprecated: false,
    execute: executeGetBudget,
  },
  {
    name: "get-tcr-request",
    aliases: ["getTcrRequest", "tcr.request", "cli.get-tcr-request"],
    description: "Inspect indexed TCR request state by composite request identifier.",
    input: getTcrRequestInputSchema,
    outputSchema: {
      type: "object",
      required: [
        "identifier",
        "requestId",
        "requestIndex",
        "requestType",
        "tcr",
        "goal",
        "budget",
        "item",
        "actors",
        "dispute",
        "timing",
        "txHash",
      ],
      properties: {
        identifier: { type: "string" },
        requestId: { type: "string" },
        requestIndex: { anyOf: [{ type: "string" }, { type: "null" }] },
        requestType: { anyOf: [{ type: "string" }, { type: "null" }] },
        tcr: { type: "object" },
        goal: { anyOf: [{ type: "object" }, { type: "null" }] },
        budget: { anyOf: [{ type: "object" }, { type: "null" }] },
        item: { type: "object" },
        actors: { type: "object" },
        dispute: { anyOf: [{ type: "object" }, { type: "null" }] },
        timing: { type: "object" },
        txHash: { anyOf: [{ type: "string" }, { type: "null" }] },
      },
      additionalProperties: false,
    },
    scopes: ["cli-tools", "protocol"],
    exposure: "chat-safe",
    sideEffects: "read",
    writeCapability: "none",
    version: "1.0.0",
    deprecated: false,
    execute: executeGetTcrRequest,
  },
  {
    name: "get-dispute",
    aliases: ["getDispute", "dispute.inspect", "cli.get-dispute"],
    description: "Inspect indexed arbitrator dispute state by composite dispute identifier.",
    input: getDisputeInputSchema,
    outputSchema: {
      type: "object",
      required: [
        "identifier",
        "disputeId",
        "arbitrator",
        "currentRound",
        "jurorCount",
        "ruling",
        "choices",
        "arbitrationCost",
        "extraData",
        "creationBlock",
        "goal",
        "budget",
        "tcr",
        "request",
        "timing",
        "juror",
      ],
      properties: {
        identifier: { type: "string" },
        disputeId: { anyOf: [{ type: "string" }, { type: "null" }] },
        arbitrator: { anyOf: [{ type: "string" }, { type: "null" }] },
        currentRound: { anyOf: [{ type: "string" }, { type: "null" }] },
        jurorCount: { type: "number" },
        ruling: { anyOf: [{ type: "number" }, { type: "null" }] },
        choices: { anyOf: [{ type: "string" }, { type: "null" }] },
        arbitrationCost: { anyOf: [{ type: "string" }, { type: "null" }] },
        extraData: { anyOf: [{ type: "string" }, { type: "null" }] },
        creationBlock: { anyOf: [{ type: "string" }, { type: "null" }] },
        goal: { anyOf: [{ type: "object" }, { type: "null" }] },
        budget: { anyOf: [{ type: "object" }, { type: "null" }] },
        tcr: { anyOf: [{ type: "object" }, { type: "null" }] },
        request: { anyOf: [{ type: "object" }, { type: "null" }] },
        timing: { type: "object" },
        juror: { anyOf: [{ type: "object" }, { type: "null" }] },
      },
      additionalProperties: false,
    },
    scopes: ["cli-tools", "protocol"],
    exposure: "chat-safe",
    sideEffects: "read",
    writeCapability: "none",
    version: "1.0.0",
    deprecated: false,
    execute: executeGetDispute,
  },
  {
    name: "get-stake-position",
    aliases: ["getStakePosition", "stake.inspect", "cli.get-stake-position"],
    description: "Inspect indexed stake vault/account state by entity or stake-vault identifier.",
    input: getStakePositionInputSchema,
    outputSchema: {
      type: "object",
      required: [
        "identifier",
        "account",
        "vaultAddress",
        "goal",
        "budget",
        "vault",
        "accountState",
        "juror",
      ],
      properties: {
        identifier: { type: "string" },
        account: { type: "string" },
        vaultAddress: { anyOf: [{ type: "string" }, { type: "null" }] },
        goal: { anyOf: [{ type: "object" }, { type: "null" }] },
        budget: { anyOf: [{ type: "object" }, { type: "null" }] },
        vault: { type: "object" },
        accountState: { type: "object" },
        juror: { anyOf: [{ type: "object" }, { type: "null" }] },
      },
      additionalProperties: false,
    },
    scopes: ["cli-tools", "protocol"],
    exposure: "chat-safe",
    sideEffects: "read",
    writeCapability: "none",
    version: "1.0.0",
    deprecated: false,
    execute: executeGetStakePosition,
  },
  {
    name: "get-premium-escrow",
    aliases: ["getPremiumEscrow", "premiumEscrow.inspect", "cli.get-premium-escrow"],
    description: "Inspect indexed premium escrow state by escrow, budget treasury, or budget stack identifier.",
    input: getPremiumEscrowInputSchema,
    outputSchema: {
      type: "object",
      required: [
        "identifier",
        "escrowAddress",
        "goal",
        "budget",
        "budgetStack",
        "state",
        "timing",
        "account",
      ],
      properties: {
        identifier: { type: "string" },
        escrowAddress: { type: "string" },
        goal: { anyOf: [{ type: "object" }, { type: "null" }] },
        budget: { anyOf: [{ type: "object" }, { type: "null" }] },
        budgetStack: { anyOf: [{ type: "object" }, { type: "null" }] },
        state: { type: "object" },
        timing: { type: "object" },
        account: { anyOf: [{ type: "object" }, { type: "null" }] },
      },
      additionalProperties: false,
    },
    scopes: ["cli-tools", "protocol"],
    exposure: "chat-safe",
    sideEffects: "read",
    writeCapability: "none",
    version: "1.0.0",
    deprecated: false,
    execute: executeGetPremiumEscrow,
  },
];
