import {
  arbitratorDispute,
  budgetContextByMechanismArbitrator,
  budgetContextByMechanismTcr,
  budgetStack,
  budgetTreasury,
  budgetTreasuryByRecipient,
  flowRecipient,
  goalContextByArbitrator,
  goalContextByBudgetTcr,
  goalContextByBudgetTreasury,
  goalFactoryDeployment,
  goalTreasury,
  juror,
  jurorDisputeMember,
  jurorVoteReceipt,
  premiumAccount,
  premiumEscrow,
  stakePosition,
  stakeVault,
  tcrItem,
  tcrRequest,
} from "../../../infra/db/schema/protocol";

export type GoalTreasuryRow = typeof goalTreasury.$inferSelect;
export type GoalFactoryDeploymentRow = typeof goalFactoryDeployment.$inferSelect;
export type GoalContextByBudgetTreasuryRow = typeof goalContextByBudgetTreasury.$inferSelect;
export type GoalContextByBudgetTcrRow = typeof goalContextByBudgetTcr.$inferSelect;
export type GoalContextByArbitratorRow = typeof goalContextByArbitrator.$inferSelect;

export type FlowRecipientRow = typeof flowRecipient.$inferSelect;

export type BudgetTreasuryRow = typeof budgetTreasury.$inferSelect;
export type BudgetTreasuryByRecipientRow = typeof budgetTreasuryByRecipient.$inferSelect;
export type BudgetStackRow = typeof budgetStack.$inferSelect;
export type BudgetContextByMechanismTcrRow = typeof budgetContextByMechanismTcr.$inferSelect;
export type BudgetContextByMechanismArbitratorRow = typeof budgetContextByMechanismArbitrator.$inferSelect;

export type TcrItemRow = typeof tcrItem.$inferSelect;
export type TcrRequestRow = typeof tcrRequest.$inferSelect;
export type ArbitratorDisputeRow = typeof arbitratorDispute.$inferSelect;

export type StakeVaultRow = typeof stakeVault.$inferSelect;
export type StakePositionRow = typeof stakePosition.$inferSelect;

export type JurorRow = typeof juror.$inferSelect;
export type JurorDisputeMemberRow = typeof jurorDisputeMember.$inferSelect;
export type JurorVoteReceiptRow = typeof jurorVoteReceipt.$inferSelect;

export type PremiumEscrowRow = typeof premiumEscrow.$inferSelect;
export type PremiumAccountRow = typeof premiumAccount.$inferSelect;

export type GoalRouteLookupResult =
  | {
      kind: "missing";
      goalRow: null;
    }
  | {
      kind: "ambiguous";
      goalRow: null;
      matches: GoalTreasuryRow[];
    }
  | {
      kind: "resolved";
      goalRow: GoalTreasuryRow;
    };

export type BudgetGoalContextBundle = {
  goalContext: GoalContextByBudgetTreasuryRow | null;
  goalRow: GoalTreasuryRow | null;
  goalAddress: string | null;
  deployment: GoalFactoryDeploymentRow | null;
};

export type PremiumEscrowLookupBundle = {
  premiumRow: PremiumEscrowRow;
  stackRow: BudgetStackRow | null;
  budgetRow: BudgetTreasuryRow | null;
  budgetAddress: string | null;
};

export type StakeContext = {
  stakeVaultRow: StakeVaultRow | null;
  goalRow: GoalTreasuryRow | null;
  budgetRow: BudgetTreasuryRow | null;
  goalAddress: string | null;
  budgetAddress: string | null;
  stakeVaultAddress: string | null;
};

export type PremiumEscrowContext = {
  premiumRow: PremiumEscrowRow;
  stackRow: BudgetStackRow | null;
  budgetRow: BudgetTreasuryRow | null;
  goalRow: GoalTreasuryRow | null;
  goalAddress: string | null;
};

export type TcrRequestContext = {
  itemRow: TcrItemRow | null;
  mechanismContext: BudgetContextByMechanismTcrRow | null;
  goalRow: GoalTreasuryRow | null;
  budgetRow: BudgetTreasuryRow | null;
  disputeRow: ArbitratorDisputeRow | null;
  goalAddress: string | null;
  budgetAddress: string | null;
};

export type DisputeContext = {
  goalRow: GoalTreasuryRow | null;
  budgetRow: BudgetTreasuryRow | null;
  requestRow: TcrRequestRow | null;
  goalAddress: string | null;
  budgetAddress: string | null;
  stakeVaultAddress: string | null;
};

export type GoalInspectReadBundle = {
  deployment: GoalFactoryDeploymentRow | null;
  recipientRows: FlowRecipientRow[];
  stakeVaultRow: StakeVaultRow | null;
  budgetRows: BudgetTreasuryRow[];
};

export type BudgetInspectReadBundle = {
  goalContext: GoalContextByBudgetTreasuryRow | null;
  recipientRows: FlowRecipientRow[];
  premiumRow: PremiumEscrowRow | null;
  goalRow: GoalTreasuryRow | null;
  deployment: GoalFactoryDeploymentRow | null;
};

export type DisputeJurorReadBundle = {
  normalizedJuror: string | null;
  memberRows: JurorDisputeMemberRow[];
  selectedMember: JurorDisputeMemberRow | null;
  currentJurorRow: JurorRow | null;
  receiptRows: JurorVoteReceiptRow[];
};

export type StakeAccountReadBundle = {
  normalizedAccount: string;
  positionRows: StakePositionRow[];
  jurorRow: JurorRow | null;
};

export type PremiumAccountReadBundle = {
  normalizedAccount: string | null;
  accountRow: PremiumAccountRow | null;
};
