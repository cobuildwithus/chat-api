import { describe, expect, it } from "vitest";
import { buildProtocolNotificationPresentation } from "./presentation";

describe("protocol notification presentation", () => {
  const goalTreasury = "0x00000000000000000000000000000000000000bb";
  const actorWalletAddress = "0x00000000000000000000000000000000000000cc";

  it.each([
    ["budget_proposed", "New budget proposed in Alpha.", "0x0000...00cc opened a new budget request."],
    [
      "budget_proposal_challenged",
      "Budget proposal challenged in Alpha.",
      "0x0000...00cc challenged a budget request.",
    ],
    ["budget_accepted", "Budget accepted in Alpha.", "The proposal cleared governance and is queued for activation."],
    ["budget_activated", "Budget activated in Alpha.", "The budget is now active for funding."],
    [
      "budget_removal_requested",
      "Budget removal requested in Alpha.",
      "0x0000...00cc requested budget removal.",
    ],
    [
      "budget_removal_challenged",
      "Budget removal challenged in Alpha.",
      "0x0000...00cc challenged a budget removal request.",
    ],
    [
      "budget_removal_accepted",
      "Budget removal accepted in Alpha.",
      "The removal request cleared governance and is queued for final removal.",
    ],
    ["budget_removed", "Budget removed in Alpha.", "The budget was detached from active funding."],
    ["goal_active", "Alpha is now active.", "The goal has moved from funding into the active phase."],
    ["goal_succeeded", "Alpha succeeded.", "The goal reached a succeeded terminal state."],
    ["goal_expired", "Alpha expired.", "The goal reached an expired terminal state."],
  ])("builds titled protocol copy for %s", (reason, title, excerpt) => {
    expect(
      buildProtocolNotificationPresentation({
        reason,
        actorWalletAddress,
        payload: {
          labels: { goalName: "Alpha" },
          resource: {
            goalTreasury,
          },
        },
      })
    ).toEqual({
      title,
      excerpt,
      appPath: `/${goalTreasury}/events`,
      actorName: "0x0000...00cc",
    });
  });

  it("falls back to generic copy when payload labels and treasury are missing", () => {
    expect(
      buildProtocolNotificationPresentation({
        reason: "budget_accepted",
        actorWalletAddress: null,
        payload: {
          labels: { goalName: "   " },
          resource: { goalTreasury: "not-an-address" },
        },
      })
    ).toEqual({
      title: "Budget accepted by governance.",
      excerpt: "The proposal cleared governance and is queued for activation.",
      appPath: "/notifications",
      actorName: null,
    });
  });

  it("falls back to generic protocol updates for unknown reasons", () => {
    expect(
      buildProtocolNotificationPresentation({
        reason: "something_new",
        actorWalletAddress,
        payload: null,
      })
    ).toEqual({
      title: "Protocol update.",
      excerpt: null,
      appPath: "/notifications",
      actorName: "0x0000...00cc",
    });
  });

  it("keeps goal context in unknown protocol updates", () => {
    expect(
      buildProtocolNotificationPresentation({
        reason: "something_new",
        actorWalletAddress: null,
        payload: {
          labels: { goalName: "Alpha" },
          resource: { goalTreasury },
        },
      })
    ).toEqual({
      title: "Protocol update for Alpha.",
      excerpt: null,
      appPath: `/${goalTreasury}/events`,
      actorName: null,
    });
  });

  it.each([
    ["budget_proposed", "A new budget request entered governance."],
    ["budget_proposal_challenged", "A budget request moved into dispute."],
    ["budget_removal_requested", "A removal request was submitted for this budget."],
    ["budget_removal_challenged", "The removal request moved into dispute."],
  ])("uses non-actor fallback excerpt copy for %s", (reason, excerpt) => {
    expect(
      buildProtocolNotificationPresentation({
        reason,
        actorWalletAddress: null,
        payload: null,
      }).excerpt
    ).toBe(excerpt);
  });
});
