function normalizeHex(value: unknown): string | null {
  return typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value) ? value.toLowerCase() : null;
}

function shortenAddress(value: string | null): string | null {
  if (!value) return null;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function goalNameFromPayload(payload: Record<string, unknown> | null): string | null {
  const labels = asRecord(payload?.labels);
  const goalName = labels?.goalName;
  return typeof goalName === "string" && goalName.trim() !== "" ? goalName.trim() : null;
}

function goalTreasuryFromPayload(payload: Record<string, unknown> | null): string | null {
  const resource = asRecord(payload?.resource);
  return normalizeHex(resource?.goalTreasury);
}

type ProtocolNotificationRole =
  | "requester"
  | "challenger"
  | "proposer"
  | "goal_owner"
  | "goal_stakeholder"
  | "goal_underwriter"
  | "budget_underwriter"
  | "juror";

function payloadRoleFromPayload(
  payload: Record<string, unknown> | null,
): ProtocolNotificationRole | null {
  const role = payload?.role;
  switch (role) {
    case "requester":
    case "challenger":
    case "proposer":
    case "goal_owner":
    case "goal_stakeholder":
    case "goal_underwriter":
    case "budget_underwriter":
    case "juror":
      return role;
    default:
      return null;
  }
}

function buildRoleAwareTitle(
  reason: string,
  goalName: string | null,
  role: ProtocolNotificationRole | null,
): string | null {
  if (role === "requester") {
    switch (reason) {
      case "budget_proposed":
        return goalName ? `You proposed a new budget in ${goalName}.` : "You proposed a new budget.";
      case "budget_proposal_challenged":
        return goalName
          ? `Your budget proposal was challenged in ${goalName}.`
          : "Your budget proposal was challenged.";
      case "budget_accepted":
        return goalName
          ? `Your budget proposal was accepted in ${goalName}.`
          : "Your budget proposal was accepted.";
      case "budget_activated":
        return goalName ? `Your budget was activated in ${goalName}.` : "Your budget was activated.";
      case "budget_removal_requested":
        return goalName
          ? `You requested budget removal in ${goalName}.`
          : "You requested budget removal.";
      case "budget_removal_challenged":
        return goalName
          ? `Your removal request was challenged in ${goalName}.`
          : "Your removal request was challenged.";
      case "budget_removal_accepted":
        return goalName
          ? `Your removal request was accepted in ${goalName}.`
          : "Your removal request was accepted.";
      case "mechanism_proposed":
        return goalName
          ? `You proposed a new allocation mechanism in ${goalName}.`
          : "You proposed a new allocation mechanism.";
      case "mechanism_challenged":
        return goalName
          ? `Your allocation mechanism request was challenged in ${goalName}.`
          : "Your allocation mechanism request was challenged.";
      case "mechanism_accepted":
        return goalName
          ? `Your allocation mechanism request was accepted in ${goalName}.`
          : "Your allocation mechanism request was accepted.";
      case "mechanism_activated":
        return goalName
          ? `Your allocation mechanism was activated in ${goalName}.`
          : "Your allocation mechanism was activated.";
      case "mechanism_removal_requested":
        return goalName
          ? `You requested allocation mechanism removal in ${goalName}.`
          : "You requested allocation mechanism removal.";
      case "mechanism_removal_accepted":
        return goalName
          ? `Your allocation mechanism removal was accepted in ${goalName}.`
          : "Your allocation mechanism removal was accepted.";
      case "mechanism_removed":
        return goalName
          ? `Your allocation mechanism was removed in ${goalName}.`
          : "Your allocation mechanism was removed.";
      default:
        return null;
    }
  }

  if (role === "proposer") {
    switch (reason) {
      case "budget_proposed":
        return goalName ? `You proposed a new budget in ${goalName}.` : "You proposed a new budget.";
      case "budget_proposal_challenged":
        return goalName
          ? `Your budget proposal was challenged in ${goalName}.`
          : "Your budget proposal was challenged.";
      case "budget_accepted":
        return goalName
          ? `Your budget proposal was accepted in ${goalName}.`
          : "Your budget proposal was accepted.";
      case "budget_activated":
        return goalName ? `Your budget was activated in ${goalName}.` : "Your budget was activated.";
      case "budget_removal_requested":
        return goalName
          ? `Removal requested for your budget in ${goalName}.`
          : "Removal requested for your budget.";
      case "budget_removal_challenged":
        return goalName
          ? `Removal request challenged for your budget in ${goalName}.`
          : "Removal request challenged for your budget.";
      case "budget_removal_accepted":
        return goalName
          ? `Removal accepted for your budget in ${goalName}.`
          : "Removal accepted for your budget.";
      case "budget_removed":
        return goalName ? `Your budget was removed in ${goalName}.` : "Your budget was removed.";
      case "mechanism_proposed":
        return goalName
          ? `You proposed a new allocation mechanism in ${goalName}.`
          : "You proposed a new allocation mechanism.";
      case "mechanism_challenged":
        return goalName
          ? `Your allocation mechanism request was challenged in ${goalName}.`
          : "Your allocation mechanism request was challenged.";
      case "mechanism_accepted":
        return goalName
          ? `Your allocation mechanism request was accepted in ${goalName}.`
          : "Your allocation mechanism request was accepted.";
      case "mechanism_activated":
        return goalName
          ? `Your allocation mechanism was activated in ${goalName}.`
          : "Your allocation mechanism was activated.";
      case "mechanism_removal_requested":
        return goalName
          ? `Removal requested for your allocation mechanism in ${goalName}.`
          : "Removal requested for your allocation mechanism.";
      case "mechanism_removal_accepted":
        return goalName
          ? `Removal accepted for your allocation mechanism in ${goalName}.`
          : "Removal accepted for your allocation mechanism.";
      case "mechanism_removed":
        return goalName
          ? `Your allocation mechanism was removed in ${goalName}.`
          : "Your allocation mechanism was removed.";
      default:
        return null;
    }
  }

  if (role === "challenger") {
    switch (reason) {
      case "budget_proposal_challenged":
        return goalName
          ? `You challenged a budget proposal in ${goalName}.`
          : "You challenged a budget proposal.";
      case "budget_removal_challenged":
        return goalName
          ? `You challenged a budget removal request in ${goalName}.`
          : "You challenged a budget removal request.";
      case "mechanism_challenged":
        return goalName
          ? `You challenged an allocation mechanism request in ${goalName}.`
          : "You challenged an allocation mechanism request.";
      default:
        return null;
    }
  }

  return null;
}

function buildTitle(
  reason: string,
  goalName: string | null,
  role: ProtocolNotificationRole | null,
): string {
  const personalizedTitle = buildRoleAwareTitle(reason, goalName, role);
  if (personalizedTitle) return personalizedTitle;

  switch (reason) {
    case "budget_proposed":
      return goalName ? `New budget proposed in ${goalName}.` : "New budget proposed.";
    case "budget_proposal_challenged":
      return goalName
        ? `Budget proposal challenged in ${goalName}.`
        : "Budget proposal challenged.";
    case "budget_accepted":
      return goalName ? `Budget accepted in ${goalName}.` : "Budget accepted by governance.";
    case "budget_activated":
      return goalName ? `Budget activated in ${goalName}.` : "Budget activated.";
    case "budget_removal_requested":
      return goalName ? `Budget removal requested in ${goalName}.` : "Budget removal requested.";
    case "budget_removal_challenged":
      return goalName
        ? `Budget removal challenged in ${goalName}.`
        : "Budget removal challenged.";
    case "budget_removal_accepted":
      return goalName ? `Budget removal accepted in ${goalName}.` : "Budget removal accepted.";
    case "budget_removed":
      return goalName ? `Budget removed in ${goalName}.` : "Budget removed.";
    case "mechanism_proposed":
      return goalName
        ? `New allocation mechanism proposed in ${goalName}.`
        : "New allocation mechanism proposed.";
    case "mechanism_challenged":
      return goalName
        ? `Allocation mechanism request challenged in ${goalName}.`
        : "Allocation mechanism request challenged.";
    case "mechanism_accepted":
      return goalName
        ? `Allocation mechanism accepted in ${goalName}.`
        : "Allocation mechanism accepted by governance.";
    case "mechanism_activated":
      return goalName
        ? `Allocation mechanism activated in ${goalName}.`
        : "Allocation mechanism activated.";
    case "mechanism_removal_requested":
      return goalName
        ? `Allocation mechanism removal requested in ${goalName}.`
        : "Allocation mechanism removal requested.";
    case "mechanism_removal_accepted":
      return goalName
        ? `Allocation mechanism removal accepted in ${goalName}.`
        : "Allocation mechanism removal accepted.";
    case "mechanism_removed":
      return goalName
        ? `Allocation mechanism removed in ${goalName}.`
        : "Allocation mechanism removed.";
    case "budget_active":
      return goalName ? `Budget in ${goalName} is now active.` : "Budget is now active.";
    case "budget_succeeded":
      return goalName ? `Budget in ${goalName} succeeded.` : "Budget succeeded.";
    case "budget_failed":
      return goalName ? `Budget in ${goalName} failed.` : "Budget failed.";
    case "budget_expired":
      return goalName ? `Budget in ${goalName} expired.` : "Budget expired.";
    case "underwriter_slashed":
      return goalName ? `Underwriter slash applied in ${goalName}.` : "Underwriter slash applied.";
    case "goal_active":
      return goalName ? `${goalName} is now active.` : "Goal is now active.";
    case "goal_succeeded":
      return goalName ? `${goalName} succeeded.` : "Goal succeeded.";
    case "goal_expired":
      return goalName ? `${goalName} expired.` : "Goal expired.";
    case "juror_dispute_created":
      return goalName ? `New juror dispute in ${goalName}.` : "New juror dispute.";
    case "juror_voting_open":
      return goalName ? `Juror voting opened in ${goalName}.` : "Juror voting is open.";
    case "juror_reveal_open":
      return goalName ? `Juror reveal opened in ${goalName}.` : "Juror reveal is open.";
    case "juror_ruling_final":
      return goalName ? `Juror ruling finalized in ${goalName}.` : "Juror ruling finalized.";
    case "juror_slashable":
      return goalName ? `Juror slash risk in ${goalName}.` : "Juror slash risk.";
    case "juror_slashed":
      return goalName ? `Juror slashed in ${goalName}.` : "Juror slashed.";
    default:
      return goalName ? `Protocol update for ${goalName}.` : "Protocol update.";
  }
}

function buildRoleAwareExcerpt(
  reason: string,
  actorWalletAddress: string | null,
  role: ProtocolNotificationRole | null,
): string | null {
  const actorLabel = shortenAddress(actorWalletAddress);

  if (role === "requester") {
    switch (reason) {
      case "budget_proposed":
        return "Your budget request entered governance.";
      case "budget_proposal_challenged":
        return actorLabel
          ? `${actorLabel} challenged your budget proposal.`
          : "Your budget proposal moved into dispute.";
      case "budget_accepted":
        return "Governance accepted your proposal and queued it for activation.";
      case "budget_activated":
        return "Your budget is now active for funding.";
      case "budget_removal_requested":
        return "Your removal request entered governance.";
      case "budget_removal_challenged":
        return actorLabel
          ? `${actorLabel} challenged your removal request.`
          : "Your removal request moved into dispute.";
      case "budget_removal_accepted":
        return "Governance accepted your removal request and queued final removal.";
      case "mechanism_proposed":
        return "Your allocation mechanism request entered governance.";
      case "mechanism_challenged":
        return actorLabel
          ? `${actorLabel} challenged your allocation mechanism request.`
          : "Your allocation mechanism request moved into dispute.";
      case "mechanism_accepted":
        return "Governance accepted your allocation mechanism request and queued activation.";
      case "mechanism_activated":
        return "Your allocation mechanism is now active.";
      case "mechanism_removal_requested":
        return "Your removal request entered governance.";
      case "mechanism_removal_accepted":
        return "Governance accepted your removal request and queued final removal.";
      case "mechanism_removed":
        return "Your allocation mechanism was removed.";
      default:
        return null;
    }
  }

  if (role === "proposer") {
    switch (reason) {
      case "budget_proposed":
        return "Your budget request entered governance.";
      case "budget_proposal_challenged":
        return actorLabel
          ? `${actorLabel} challenged your budget proposal.`
          : "Your budget proposal moved into dispute.";
      case "budget_accepted":
        return "Governance accepted your proposal and queued it for activation.";
      case "budget_activated":
        return "Your budget is now active for funding.";
      case "budget_removal_requested":
        return actorLabel
          ? `${actorLabel} requested removal of your budget.`
          : "A removal request was submitted for your budget.";
      case "budget_removal_challenged":
        return actorLabel
          ? `${actorLabel} challenged a removal request for your budget.`
          : "A removal request for your budget moved into dispute.";
      case "budget_removal_accepted":
        return "The removal request for your budget cleared governance and is queued for final removal.";
      case "budget_removed":
        return "Your budget was detached from active funding.";
      case "mechanism_proposed":
        return "Your allocation mechanism request entered governance.";
      case "mechanism_challenged":
        return actorLabel
          ? `${actorLabel} challenged your allocation mechanism request.`
          : "Your allocation mechanism request moved into dispute.";
      case "mechanism_accepted":
        return "Governance accepted your allocation mechanism request and queued activation.";
      case "mechanism_activated":
        return "Your allocation mechanism is now active.";
      case "mechanism_removal_requested":
        return actorLabel
          ? `${actorLabel} requested removal of your allocation mechanism.`
          : "A removal request was submitted for your allocation mechanism.";
      case "mechanism_removal_accepted":
        return "The removal request for your allocation mechanism cleared governance and is queued for final removal.";
      case "mechanism_removed":
        return "Your allocation mechanism was removed.";
      default:
        return null;
    }
  }

  if (role === "challenger") {
    switch (reason) {
      case "budget_proposal_challenged":
        return "The budget proposal is now in dispute.";
      case "budget_removal_challenged":
        return "The removal request is now in dispute.";
      case "mechanism_challenged":
        return "The allocation mechanism request is now in dispute.";
      default:
        return null;
    }
  }

  return null;
}

function buildExcerpt(
  reason: string,
  actorWalletAddress: string | null,
  role: ProtocolNotificationRole | null,
): string | null {
  const personalizedExcerpt = buildRoleAwareExcerpt(reason, actorWalletAddress, role);
  if (personalizedExcerpt) return personalizedExcerpt;

  const actorLabel = shortenAddress(actorWalletAddress);

  switch (reason) {
    case "budget_proposed":
      return actorLabel
        ? `${actorLabel} opened a new budget request.`
        : "A new budget request entered governance.";
    case "budget_proposal_challenged":
      return actorLabel
        ? `${actorLabel} challenged a budget request.`
        : "A budget request moved into dispute.";
    case "budget_accepted":
      return "The proposal cleared governance and is queued for activation.";
    case "budget_activated":
      return "The budget is now active for funding.";
    case "budget_removal_requested":
      return actorLabel
        ? `${actorLabel} requested budget removal.`
        : "A removal request was submitted for this budget.";
    case "budget_removal_challenged":
      return actorLabel
        ? `${actorLabel} challenged a budget removal request.`
        : "The removal request moved into dispute.";
    case "budget_removal_accepted":
      return "The removal request cleared governance and is queued for final removal.";
    case "budget_removed":
      return "The budget was detached from active funding.";
    case "mechanism_proposed":
      return actorLabel
        ? `${actorLabel} opened a new allocation mechanism request.`
        : "A new allocation mechanism request entered governance.";
    case "mechanism_challenged":
      return actorLabel
        ? `${actorLabel} challenged an allocation mechanism request.`
        : "An allocation mechanism request moved into dispute.";
    case "mechanism_accepted":
      return "The allocation mechanism request cleared governance and is queued for activation.";
    case "mechanism_activated":
      return "The allocation mechanism is now active.";
    case "mechanism_removal_requested":
      return actorLabel
        ? `${actorLabel} requested allocation mechanism removal.`
        : "A removal request was submitted for this allocation mechanism.";
    case "mechanism_removal_accepted":
      return "The removal request cleared governance and is queued for final removal.";
    case "mechanism_removed":
      return "The allocation mechanism was removed.";
    case "budget_active":
      return "This budget entered the active funding phase.";
    case "budget_succeeded":
      return "This budget reached a succeeded terminal state.";
    case "budget_failed":
      return "This budget reached a failed terminal state.";
    case "budget_expired":
      return "This budget reached an expired terminal state.";
    case "underwriter_slashed":
      return "A slash was applied to your underwriting position.";
    case "goal_active":
      return "The goal has moved from funding into the active phase.";
    case "goal_succeeded":
      return "The goal reached a succeeded terminal state.";
    case "goal_expired":
      return "The goal reached an expired terminal state.";
    case "juror_dispute_created":
      return "A new dispute is waiting for juror attention.";
    case "juror_voting_open":
      return "Voting is now open on this dispute.";
    case "juror_reveal_open":
      return "Reveal is now open for your committed vote.";
    case "juror_ruling_final":
      return "The dispute finished with a final ruling.";
    case "juror_slashable":
      return "The dispute resolved in a way that may leave your juror stake slashable.";
    case "juror_slashed":
      return "A slash was applied to your juror stake.";
    default:
      return null;
  }
}

export function buildProtocolNotificationPresentation(args: {
  reason: string;
  payload: Record<string, unknown> | null;
  actorWalletAddress: string | null;
}): {
  title: string;
  excerpt: string | null;
  appPath: string | null;
  actorName: string | null;
} {
  const goalName = goalNameFromPayload(args.payload);
  const goalTreasury = goalTreasuryFromPayload(args.payload);
  const role = payloadRoleFromPayload(args.payload);

  return {
    title: buildTitle(args.reason, goalName, role),
    excerpt: buildExcerpt(args.reason, args.actorWalletAddress, role),
    appPath: goalTreasury ? `/${goalTreasury}/events` : "/notifications",
    actorName: shortenAddress(args.actorWalletAddress)
  };
}
