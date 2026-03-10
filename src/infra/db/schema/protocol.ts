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

export const budgetStack = onchainSchema.table("budget_stack", {
  id: text("id").primaryKey(),
  childFlow: text("child_flow"),
  budgetTreasury: text("budget_treasury"),
  premiumEscrow: text("premium_escrow"),
  strategy: text("strategy"),
  status: text("status"),
  deployedAtBlock: amount("deployed_at_block"),
  deployedAtTimestamp: amount("deployed_at_timestamp"),
  updatedAtBlock: amount("updated_at_block"),
  updatedAtTimestamp: amount("updated_at_timestamp"),
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

export const budgetTreasuryByRecipient = onchainSchema.table("budget_treasury_by_recipient", {
  id: text("id").primaryKey(),
  budgetTreasury: text("budget_treasury"),
  childFlow: text("child_flow"),
  updatedAtBlock: amount("updated_at_block"),
  updatedAtTimestamp: amount("updated_at_timestamp"),
});

export const goalContextByBudgetTcr = onchainSchema.table("goal_context_by_budget_tcr", {
  id: text("id").primaryKey(),
  goalTreasury: text("goal_treasury"),
  updatedAtBlock: amount("updated_at_block"),
  updatedAtTimestamp: amount("updated_at_timestamp"),
});

export const goalContextByArbitrator = onchainSchema.table("goal_context_by_arbitrator", {
  id: text("id").primaryKey(),
  goalTreasury: text("goal_treasury"),
  stakeVault: text("stake_vault"),
  budgetTcr: text("budget_tcr"),
  updatedAtBlock: amount("updated_at_block"),
  updatedAtTimestamp: amount("updated_at_timestamp"),
});

export const budgetContextByMechanismTcr = onchainSchema.table("budget_context_by_mechanism_tcr", {
  id: text("id").primaryKey(),
  goalTreasury: text("goal_treasury"),
  budgetTreasury: text("budget_treasury"),
  stakeVault: text("stake_vault"),
  budgetTcr: text("budget_tcr"),
  recipientId: text("recipient_id"),
  updatedAtBlock: amount("updated_at_block"),
  updatedAtTimestamp: amount("updated_at_timestamp"),
});

export const budgetContextByMechanismArbitrator = onchainSchema.table(
  "budget_context_by_mechanism_arbitrator",
  {
    id: text("id").primaryKey(),
    allocationMechanismTcr: text("allocation_mechanism_tcr"),
    goalTreasury: text("goal_treasury"),
    budgetTreasury: text("budget_treasury"),
    stakeVault: text("stake_vault"),
    budgetTcr: text("budget_tcr"),
    recipientId: text("recipient_id"),
    updatedAtBlock: amount("updated_at_block"),
    updatedAtTimestamp: amount("updated_at_timestamp"),
  },
);

export const tcrItem = onchainSchema.table("tcr_item", {
  id: text("id").primaryKey(),
  tcrAddress: text("tcr_address"),
  tcrKind: text("tcr_kind"),
  itemId: text("item_id"),
  goalTreasury: text("goal_treasury"),
  budgetTreasury: text("budget_treasury"),
  submitter: text("submitter"),
  evidenceGroupId: amount("evidence_group_id"),
  latestRequestIndex: amount("latest_request_index"),
  currentStatus: integer("current_status"),
  itemData: text("item_data"),
  updatedAtBlock: amount("updated_at_block"),
  updatedAtTimestamp: amount("updated_at_timestamp"),
});

export const tcrRequest = onchainSchema.table("tcr_request", {
  id: text("id").primaryKey(),
  tcrAddress: text("tcr_address"),
  tcrKind: text("tcr_kind"),
  itemId: text("item_id"),
  requestIndex: amount("request_index"),
  goalTreasury: text("goal_treasury"),
  budgetTreasury: text("budget_treasury"),
  requestType: text("request_type"),
  requester: text("requester"),
  challenger: text("challenger"),
  disputeId: amount("dispute_id"),
  submittedAt: amount("submitted_at"),
  challengedAt: amount("challenged_at"),
  txHash: text("tx_hash"),
  updatedAtBlock: amount("updated_at_block"),
  updatedAtTimestamp: amount("updated_at_timestamp"),
});

export const stakeVault = onchainSchema.table("stake_vault", {
  id: text("id").primaryKey(),
  kind: text("kind"),
  treasury: text("treasury"),
  goalTotalStaked: amount("goal_total_staked"),
  cobuildTotalStaked: amount("cobuild_total_staked"),
  goalTotalWithdrawn: amount("goal_total_withdrawn"),
  cobuildTotalWithdrawn: amount("cobuild_total_withdrawn"),
  resolved: boolean("resolved"),
  updatedAtBlock: amount("updated_at_block"),
  updatedAtTimestamp: amount("updated_at_timestamp"),
});

export const stakePosition = onchainSchema.table("stake_position", {
  id: text("id").primaryKey(),
  vault: text("vault"),
  account: text("account"),
  tokenKind: text("token_kind"),
  staked: amount("staked"),
  withdrawn: amount("withdrawn"),
  updatedAtBlock: amount("updated_at_block"),
  updatedAtTimestamp: amount("updated_at_timestamp"),
});

export const budgetUnderwriterCurrent = onchainSchema.table("budget_underwriter_current", {
  id: text("id").primaryKey(),
  goalTreasury: text("goal_treasury"),
  stakeVault: text("stake_vault"),
  budgetTreasury: text("budget_treasury"),
  recipientId: text("recipient_id"),
  account: text("account"),
  allocatedStake: amount("allocated_stake"),
  updatedAtBlock: amount("updated_at_block"),
  updatedAtTimestamp: amount("updated_at_timestamp"),
});

export const goalUnderwriterCurrent = onchainSchema.table("goal_underwriter_current", {
  id: text("id").primaryKey(),
  goalTreasury: text("goal_treasury"),
  stakeVault: text("stake_vault"),
  account: text("account"),
  allocatedStake: amount("allocated_stake"),
  updatedAtBlock: amount("updated_at_block"),
  updatedAtTimestamp: amount("updated_at_timestamp"),
});

export const juror = onchainSchema.table("juror", {
  id: text("id").primaryKey(),
  vault: text("vault"),
  jurorAddress: text("juror_address"),
  optedIn: boolean("opted_in"),
  exitTime: amount("exit_time"),
  delegate: text("delegate"),
  slasher: text("slasher"),
  lockedGoalAmount: amount("locked_goal_amount"),
  currentJurorWeight: amount("current_juror_weight"),
  slashedTotal: amount("slashed_total"),
  updatedAtBlock: amount("updated_at_block"),
  updatedAtTimestamp: amount("updated_at_timestamp"),
});

export const arbitratorDispute = onchainSchema.table("arbitrator_dispute", {
  id: text("id").primaryKey(),
  arbitrator: text("arbitrator"),
  arbitrable: text("arbitrable"),
  goalTreasury: text("goal_treasury"),
  stakeVault: text("stake_vault"),
  budgetTreasury: text("budget_treasury"),
  tcrAddress: text("tcr_address"),
  tcrKind: text("tcr_kind"),
  itemId: text("item_id"),
  requestIndex: amount("request_index"),
  disputeId: amount("dispute_id"),
  currentRound: amount("current_round"),
  jurorAddresses: text("juror_addresses").array(),
  votingStartTime: amount("voting_start_time"),
  votingEndTime: amount("voting_end_time"),
  revealPeriodEndTime: amount("reveal_period_end_time"),
  creationBlock: amount("creation_block"),
  arbitrationCost: amount("arbitration_cost"),
  extraData: text("extra_data"),
  choices: amount("choices"),
  ruling: integer("ruling"),
  executedAt: amount("executed_at"),
  updatedAtBlock: amount("updated_at_block"),
  updatedAtTimestamp: amount("updated_at_timestamp"),
});

export const jurorDisputeMember = onchainSchema.table("juror_dispute_member", {
  id: text("id").primaryKey(),
  arbitrator: text("arbitrator"),
  disputeId: amount("dispute_id"),
  goalTreasury: text("goal_treasury"),
  stakeVault: text("stake_vault"),
  jurorAddress: text("juror_address"),
  snapshotWeight: amount("snapshot_weight"),
  createdAtBlock: amount("created_at_block"),
  createdAtTimestamp: amount("created_at_timestamp"),
  updatedAtBlock: amount("updated_at_block"),
  updatedAtTimestamp: amount("updated_at_timestamp"),
});

export const jurorVoteReceipt = onchainSchema.table("juror_vote_receipt", {
  id: text("id").primaryKey(),
  arbitrator: text("arbitrator"),
  disputeId: amount("dispute_id"),
  round: amount("round"),
  jurorAddress: text("juror_address"),
  hasCommitted: boolean("has_committed"),
  hasRevealed: boolean("has_revealed"),
  commitHash: text("commit_hash"),
  choice: amount("choice"),
  reasonText: text("reason_text"),
  votes: amount("votes"),
  committedAt: amount("committed_at"),
  revealedAt: amount("revealed_at"),
  rewardAmount: amount("reward_amount"),
  rewardWithdrawnAt: amount("reward_withdrawn_at"),
  slashRewardGoalAmount: amount("slash_reward_goal_amount"),
  slashRewardCobuildAmount: amount("slash_reward_cobuild_amount"),
  slashRewardsWithdrawnAt: amount("slash_rewards_withdrawn_at"),
  snapshotVotes: amount("snapshot_votes"),
  slashWeight: amount("slash_weight"),
  missedReveal: boolean("missed_reveal"),
  slashRecipient: text("slash_recipient"),
  slashedAt: amount("slashed_at"),
  updatedAtBlock: amount("updated_at_block"),
  updatedAtTimestamp: amount("updated_at_timestamp"),
});

export const premiumEscrow = onchainSchema.table("premium_escrow", {
  id: text("id").primaryKey(),
  budgetStackId: text("budget_stack_id"),
  childFlow: text("child_flow"),
  budgetTreasury: text("budget_treasury"),
  managerRewardPool: text("manager_reward_pool"),
  baselineReceived: amount("baseline_received"),
  latestDistributedPremium: amount("latest_distributed_premium"),
  latestTotalCoverage: amount("latest_total_coverage"),
  latestPremiumIndex: amount("latest_premium_index"),
  lastIndexedAtBlock: amount("last_indexed_at_block"),
  lastIndexedAtTimestamp: amount("last_indexed_at_timestamp"),
  closed: boolean("closed"),
  finalState: integer("final_state"),
  activatedAt: amount("activated_at"),
  closedAt: amount("closed_at"),
  updatedAtBlock: amount("updated_at_block"),
  updatedAtTimestamp: amount("updated_at_timestamp"),
});

export const premiumAccount = onchainSchema.table("premium_account", {
  id: text("id").primaryKey(),
  escrow: text("escrow"),
  account: text("account"),
  currentCoverage: amount("current_coverage"),
  claimableAmount: amount("claimable_amount"),
  exposureIntegral: amount("exposure_integral"),
  slashed: boolean("slashed"),
  lastSlashWeight: amount("last_slash_weight"),
  lastSlashDuration: amount("last_slash_duration"),
  lastCheckpointBlock: amount("last_checkpoint_block"),
  lastCheckpointTimestamp: amount("last_checkpoint_timestamp"),
  updatedAtBlock: amount("updated_at_block"),
  updatedAtTimestamp: amount("updated_at_timestamp"),
});
