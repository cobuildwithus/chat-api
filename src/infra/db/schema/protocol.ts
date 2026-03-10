import {
  boolean,
  integer,
  numeric,
  text,
} from "drizzle-orm/pg-core";
import { onchainSchema } from "./shared";

const amount = (name: string) => numeric(name, { precision: 78, scale: 0 });

export const goalTreasury = onchainSchema.table("goal_treasury", {
  id: text("id").primaryKey(),
  owner: text("owner"),
  flowAddress: text("flow_address"),
  budgetStakeLedger: text("budget_stake_ledger"),
  goalToken: text("goal_token"),
  cobuildToken: text("cobuild_token"),
  stakeVault: text("stake_vault"),
  hook: text("hook"),
  successResolver: text("success_resolver"),
  goalRevnetId: amount("goal_revnet_id"),
  canonicalProjectChainId: integer("canonical_project_chain_id"),
  canonicalProjectId: integer("canonical_project_id"),
  canonicalRouteSlug: text("canonical_route_slug"),
  canonicalRouteDomain: text("canonical_route_domain"),
  minRaiseDeadline: amount("min_raise_deadline"),
  deadline: amount("deadline"),
  minRaise: amount("min_raise"),
  strategy: text("strategy"),
  parentFlow: text("parent_flow"),
  state: integer("state"),
  finalized: boolean("finalized"),
  successAssertionId: text("success_assertion_id"),
  successAssertionRegisteredAt: amount("success_assertion_registered_at"),
  reassertGraceDeadline: amount("reassert_grace_deadline"),
  jurorSlasher: text("juror_slasher"),
  underwriterSlasher: text("underwriter_slasher"),
  successAt: amount("success_at"),
  lastSyncedTargetRate: amount("last_synced_target_rate"),
  lastSyncedAppliedRate: amount("last_synced_applied_rate"),
  lastSyncedTreasuryBalance: amount("last_synced_treasury_balance"),
  lastSyncedTimeRemaining: amount("last_synced_time_remaining"),
  lastResidualFinalState: integer("last_residual_final_state"),
  lastResidualSettledAmount: amount("last_residual_settled_amount"),
  lastResidualControllerBurnAmount: amount("last_residual_controller_burn_amount"),
  createdAtTimestamp: amount("created_at_timestamp"),
  updatedAtTimestamp: amount("updated_at_timestamp"),
});

export const goalFactoryDeployment = onchainSchema.table("goal_factory_deployment", {
  id: text("id").primaryKey(),
  chainId: integer("chain_id"),
  goalRevnetId: amount("goal_revnet_id"),
  goalTreasury: text("goal_treasury"),
  goalFlow: text("goal_flow"),
  stakeVault: text("stake_vault"),
  budgetStakeLedger: text("budget_stake_ledger"),
  successResolver: text("success_resolver"),
  budgetTcr: text("budget_tcr"),
  arbitrator: text("arbitrator"),
  txHash: text("tx_hash"),
  timestamp: amount("timestamp"),
});

export const goalContextByBudgetTreasury = onchainSchema.table(
  "goal_context_by_budget_treasury",
  {
    id: text("id").primaryKey(),
    goalTreasury: text("goal_treasury"),
    stakeVault: text("stake_vault"),
  },
);

export const flowRecipient = onchainSchema.table("flow_recipient", {
  id: text("id").primaryKey(),
  flowId: text("flow_id"),
  recipientId: text("recipient_id"),
  recipient: text("recipient"),
  recipientIndex: integer("recipient_index"),
  isRemoved: boolean("is_removed"),
  title: text("title"),
  tagline: text("tagline"),
  budgetTreasury: text("budget_treasury"),
});

export const budgetTreasury = onchainSchema.table("budget_treasury", {
  id: text("id").primaryKey(),
  controller: text("controller"),
  recipientId: text("recipient_id"),
  childFlow: text("child_flow"),
  premiumEscrow: text("premium_escrow"),
  strategy: text("strategy"),
  fundingDeadline: amount("funding_deadline"),
  executionDuration: amount("execution_duration"),
  activationThreshold: amount("activation_threshold"),
  runwayCap: amount("runway_cap"),
  state: integer("state"),
  finalized: boolean("finalized"),
  successAssertionId: text("success_assertion_id"),
  successAssertionRegisteredAt: amount("success_assertion_registered_at"),
  successResolutionDisabled: boolean("success_resolution_disabled"),
  reassertGraceDeadline: amount("reassert_grace_deadline"),
  lastSyncedTargetRate: amount("last_synced_target_rate"),
  lastSyncedAppliedRate: amount("last_synced_applied_rate"),
  lastSyncedTreasuryBalance: amount("last_synced_treasury_balance"),
  lastSyncedTimeRemaining: amount("last_synced_time_remaining"),
  lastResidualDestination: text("last_residual_destination"),
  lastResidualSettledAmount: amount("last_residual_settled_amount"),
  createdAtTimestamp: amount("created_at_timestamp"),
  updatedAtTimestamp: amount("updated_at_timestamp"),
});

export const stakeVault = onchainSchema.table("stake_vault", {
  id: text("id").primaryKey(),
  goalTotalStaked: amount("goal_total_staked"),
  cobuildTotalStaked: amount("cobuild_total_staked"),
  goalTotalWithdrawn: amount("goal_total_withdrawn"),
  cobuildTotalWithdrawn: amount("cobuild_total_withdrawn"),
  resolved: boolean("resolved"),
});

export const premiumEscrow = onchainSchema.table("premium_escrow", {
  id: text("id").primaryKey(),
  budgetStackId: text("budget_stack_id"),
  budgetTreasury: text("budget_treasury"),
  baselineReceived: amount("baseline_received"),
  latestDistributedPremium: amount("latest_distributed_premium"),
  latestTotalCoverage: amount("latest_total_coverage"),
  latestPremiumIndex: amount("latest_premium_index"),
  closed: boolean("closed"),
  finalState: integer("final_state"),
  activatedAt: amount("activated_at"),
  closedAt: amount("closed_at"),
});
