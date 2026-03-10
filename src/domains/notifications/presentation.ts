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

function buildTitle(reason: string, goalName: string | null): string {
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
    case "goal_active":
      return goalName ? `${goalName} is now active.` : "Goal is now active.";
    case "goal_succeeded":
      return goalName ? `${goalName} succeeded.` : "Goal succeeded.";
    case "goal_expired":
      return goalName ? `${goalName} expired.` : "Goal expired.";
    default:
      return goalName ? `Protocol update for ${goalName}.` : "Protocol update.";
  }
}

function buildExcerpt(reason: string, actorWalletAddress: string | null): string | null {
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
    case "goal_active":
      return "The goal has moved from funding into the active phase.";
    case "goal_succeeded":
      return "The goal reached a succeeded terminal state.";
    case "goal_expired":
      return "The goal reached an expired terminal state.";
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

  return {
    title: buildTitle(args.reason, goalName),
    excerpt: buildExcerpt(args.reason, args.actorWalletAddress),
    appPath: goalTreasury ? `/${goalTreasury}/events` : "/notifications",
    actorName: shortenAddress(args.actorWalletAddress)
  };
}
