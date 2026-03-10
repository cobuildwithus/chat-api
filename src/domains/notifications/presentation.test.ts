import { describe, expect, it } from "vitest";
import { buildProtocolNotificationPresentation } from "./presentation";

describe("protocol notification presentation wrapper", () => {
  it("reuses the shared presenter output directly", () => {
    expect(
      buildProtocolNotificationPresentation({
        reason: "budget_removal_challenged",
        actorWalletAddress: "0x00000000000000000000000000000000000000aa",
        payload: {
          role: "requester",
          labels: { goalName: "Alpha" },
          resource: {
            goalTreasury: "0x00000000000000000000000000000000000000bb",
          },
        },
      })
    ).toEqual({
      title: "Your removal request was challenged in Alpha.",
      excerpt: "0x0000...00aa challenged your removal request.",
      appPath: "/0x00000000000000000000000000000000000000bb/events?focus=request",
      actorName: "0x0000...00aa",
    });
  });

  it("preserves proposer-specific copy from the shared presenter", () => {
    expect(
      buildProtocolNotificationPresentation({
        reason: "budget_removal_requested",
        actorWalletAddress: "0x00000000000000000000000000000000000000ab",
        payload: {
          role: "proposer",
          labels: { goalName: "Alpha" },
          resource: {
            goalTreasury: "0x00000000000000000000000000000000000000bb",
          },
        },
      })
    ).toEqual({
      title: "Removal requested for your budget in Alpha.",
      excerpt: "0x0000...00ab requested removal of your budget.",
      appPath: "/0x00000000000000000000000000000000000000bb/events?focus=request",
      actorName: "0x0000...00ab",
    });
  });

  it("supports non-budget protocol reasons through the shared presenter", () => {
    expect(
      buildProtocolNotificationPresentation({
        reason: "juror_voting_open",
        actorWalletAddress: null,
        payload: {
          labels: { goalName: "Alpha" },
          resource: {
            goalTreasury: "0x00000000000000000000000000000000000000bb",
          },
        },
      })
    ).toEqual({
      title: "Juror voting opened in Alpha.",
      excerpt: "Voting is now open on this dispute.",
      appPath: "/0x00000000000000000000000000000000000000bb/events?focus=request",
      actorName: null,
    });
  });

  it("falls back to the notifications path when payload data is absent", () => {
    expect(
      buildProtocolNotificationPresentation({
        reason: "goal_expired",
        actorWalletAddress: null,
        payload: null,
      })
    ).toEqual({
      title: "Goal expired.",
      excerpt: "The goal reached an expired terminal state.",
      appPath: "/notifications",
      actorName: null,
    });
  });

  it("supports success assertion reasons through the shared presenter", () => {
    expect(
      buildProtocolNotificationPresentation({
        reason: "budget_success_assertion_registered",
        actorWalletAddress: null,
        payload: {
          role: "budget_controller",
          labels: { goalName: "Alpha" },
          resource: {
            goalTreasury: "0x00000000000000000000000000000000000000bb",
            budgetTreasury: "0x00000000000000000000000000000000000000cc",
          },
        },
      })
    ).toEqual({
      title: "Budget success assertion registered in Alpha.",
      excerpt: "A budget success assertion was registered and is awaiting resolution.",
      appPath:
        "/0x00000000000000000000000000000000000000bb/allocate?budgetTreasury=0x00000000000000000000000000000000000000cc&focus=success_assertion",
      actorName: null,
    });
  });
});
