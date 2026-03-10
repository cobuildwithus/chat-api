import { describe, expect, it } from "vitest";
import { buildProtocolNotificationPresentation } from "./presentation";

describe("protocol notification presentation", () => {
  const goalTreasury = "0x00000000000000000000000000000000000000bb";
  const actorWalletAddress = "0x00000000000000000000000000000000000000cc";

  it("builds requester-specific removal challenge copy", () => {
    expect(
      buildProtocolNotificationPresentation({
        reason: "budget_removal_challenged",
        actorWalletAddress,
        payload: {
          role: "requester",
          labels: { goalName: "Alpha" },
          resource: {
            goalTreasury,
          },
        },
      })
    ).toEqual({
      title: "Your removal request was challenged in Alpha.",
      excerpt: "0x0000...00cc challenged your removal request.",
      appPath: `/${goalTreasury}/events`,
      actorName: "0x0000...00cc",
    });
  });

  it("builds proposer-specific removal-request copy", () => {
    expect(
      buildProtocolNotificationPresentation({
        reason: "budget_removal_requested",
        actorWalletAddress,
        payload: {
          role: "proposer",
          labels: { goalName: "Alpha" },
          resource: {
            goalTreasury,
          },
        },
      })
    ).toEqual({
      title: "Removal requested for your budget in Alpha.",
      excerpt: "0x0000...00cc requested removal of your budget.",
      appPath: `/${goalTreasury}/events`,
      actorName: "0x0000...00cc",
    });
  });

  it("builds challenger-specific dispute copy", () => {
    expect(
      buildProtocolNotificationPresentation({
        reason: "budget_proposal_challenged",
        actorWalletAddress,
        payload: {
          role: "challenger",
          labels: { goalName: "Alpha" },
          resource: {
            goalTreasury,
          },
        },
      })
    ).toEqual({
      title: "You challenged a budget proposal in Alpha.",
      excerpt: "The budget proposal is now in dispute.",
      appPath: `/${goalTreasury}/events`,
      actorName: "0x0000...00cc",
    });
  });

  it("builds challenger-specific mechanism dispute copy", () => {
    expect(
      buildProtocolNotificationPresentation({
        reason: "mechanism_challenged",
        actorWalletAddress,
        payload: {
          role: "challenger",
          labels: { goalName: "Alpha" },
          resource: {
            goalTreasury,
          },
        },
      })
    ).toEqual({
      title: "You challenged an allocation mechanism request in Alpha.",
      excerpt: "The allocation mechanism request is now in dispute.",
      appPath: `/${goalTreasury}/events`,
      actorName: "0x0000...00cc",
    });
  });

  it.each([
    [
      "requester",
      "budget_accepted",
      "Your budget proposal was accepted.",
      "Governance accepted your proposal and queued it for activation.",
    ],
    [
      "requester",
      "mechanism_accepted",
      "Your allocation mechanism request was accepted.",
      "Governance accepted your allocation mechanism request and queued activation.",
    ],
    [
      "proposer",
      "budget_removed",
      "Your budget was removed.",
      "Your budget was detached from active funding.",
    ],
    [
      "challenger",
      "budget_removal_challenged",
      "You challenged a budget removal request.",
      "The removal request is now in dispute.",
    ],
  ])(
    "builds role-aware copy without goal labels for %s on %s",
    (role, reason, title, excerpt) => {
      expect(
        buildProtocolNotificationPresentation({
          reason,
          actorWalletAddress: null,
          payload: {
            role,
            labels: { goalName: "   " },
            resource: { goalTreasury: "not-an-address" },
          },
        })
      ).toEqual({
        title,
        excerpt,
        appPath: "/notifications",
        actorName: null,
      });
    }
  );

  it.each([
    [
      "budget_proposed",
      "You proposed a new budget in Alpha.",
      "Your budget request entered governance.",
      actorWalletAddress,
      "Alpha",
    ],
    [
      "budget_proposal_challenged",
      "Your budget proposal was challenged.",
      "Your budget proposal moved into dispute.",
      null,
      "   ",
    ],
    [
      "budget_activated",
      "Your budget was activated in Alpha.",
      "Your budget is now active for funding.",
      actorWalletAddress,
      "Alpha",
    ],
    [
      "budget_removal_requested",
      "You requested budget removal in Alpha.",
      "Your removal request entered governance.",
      actorWalletAddress,
      "Alpha",
    ],
    [
      "budget_removal_accepted",
      "Your removal request was accepted.",
      "Governance accepted your removal request and queued final removal.",
      actorWalletAddress,
      "   ",
    ],
    [
      "mechanism_proposed",
      "You proposed a new allocation mechanism in Alpha.",
      "Your allocation mechanism request entered governance.",
      actorWalletAddress,
      "Alpha",
    ],
    [
      "mechanism_removed",
      "Your allocation mechanism was removed.",
      "Your allocation mechanism was removed.",
      actorWalletAddress,
      "   ",
    ],
  ])(
    "builds requester-specific copy for %s",
    (reason, title, excerpt, roleActorWalletAddress, goalName) => {
      expect(
        buildProtocolNotificationPresentation({
          reason,
          actorWalletAddress: roleActorWalletAddress,
          payload: {
            role: "requester",
            labels: { goalName },
            resource: { goalTreasury: goalName.trim() ? goalTreasury : "not-an-address" },
          },
        })
      ).toEqual({
        title,
        excerpt,
        appPath: goalName.trim() ? `/${goalTreasury}/events` : "/notifications",
        actorName: roleActorWalletAddress ? "0x0000...00cc" : null,
      });
    }
  );

  it.each([
    [
      "budget_proposal_challenged",
      "Your budget proposal was challenged.",
      "Your budget proposal moved into dispute.",
      null,
      "   ",
    ],
    [
      "budget_accepted",
      "Your budget proposal was accepted in Alpha.",
      "Governance accepted your proposal and queued it for activation.",
      actorWalletAddress,
      "Alpha",
    ],
    [
      "budget_activated",
      "Your budget was activated in Alpha.",
      "Your budget is now active for funding.",
      actorWalletAddress,
      "Alpha",
    ],
    [
      "budget_removal_challenged",
      "Removal request challenged for your budget.",
      "A removal request for your budget moved into dispute.",
      null,
      "   ",
    ],
    [
      "budget_removal_accepted",
      "Removal accepted for your budget.",
      "The removal request for your budget cleared governance and is queued for final removal.",
      actorWalletAddress,
      "   ",
    ],
    [
      "mechanism_challenged",
      "Your allocation mechanism request was challenged.",
      "Your allocation mechanism request moved into dispute.",
      null,
      "   ",
    ],
    [
      "mechanism_activated",
      "Your allocation mechanism was activated.",
      "Your allocation mechanism is now active.",
      null,
      "   ",
    ],
    [
      "mechanism_removal_requested",
      "Removal requested for your allocation mechanism.",
      "A removal request was submitted for your allocation mechanism.",
      null,
      "   ",
    ],
    [
      "mechanism_removal_accepted",
      "Removal accepted for your allocation mechanism.",
      "The removal request for your allocation mechanism cleared governance and is queued for final removal.",
      null,
      "   ",
    ],
    [
      "mechanism_removed",
      "Your allocation mechanism was removed.",
      "Your allocation mechanism was removed.",
      null,
      "   ",
    ],
  ])(
    "builds proposer-specific copy for %s",
    (reason, title, excerpt, roleActorWalletAddress, goalName) => {
      expect(
        buildProtocolNotificationPresentation({
          reason,
          actorWalletAddress: roleActorWalletAddress,
          payload: {
            role: "proposer",
            labels: { goalName },
            resource: { goalTreasury: goalName.trim() ? goalTreasury : "not-an-address" },
          },
        })
      ).toEqual({
        title,
        excerpt,
        appPath: goalName.trim() ? `/${goalTreasury}/events` : "/notifications",
        actorName: roleActorWalletAddress ? "0x0000...00cc" : null,
      });
    }
  );

  it("builds proposer-specific challenge copy with an actor label", () => {
    expect(
      buildProtocolNotificationPresentation({
        reason: "budget_proposal_challenged",
        actorWalletAddress,
        payload: {
          role: "proposer",
          labels: { goalName: "Alpha" },
          resource: { goalTreasury },
        },
      })
    ).toEqual({
      title: "Your budget proposal was challenged in Alpha.",
      excerpt: "0x0000...00cc challenged your budget proposal.",
      appPath: `/${goalTreasury}/events`,
      actorName: "0x0000...00cc",
    });
  });

  it("builds proposer-specific removal-request copy without an actor label", () => {
    expect(
      buildProtocolNotificationPresentation({
        reason: "budget_removal_requested",
        actorWalletAddress: null,
        payload: {
          role: "proposer",
          labels: { goalName: "Alpha" },
          resource: { goalTreasury },
        },
      })
    ).toEqual({
      title: "Removal requested for your budget in Alpha.",
      excerpt: "A removal request was submitted for your budget.",
      appPath: `/${goalTreasury}/events`,
      actorName: null,
    });
  });

  it("builds proposer-specific removal challenge copy with an actor label", () => {
    expect(
      buildProtocolNotificationPresentation({
        reason: "budget_removal_challenged",
        actorWalletAddress,
        payload: {
          role: "proposer",
          labels: { goalName: "Alpha" },
          resource: { goalTreasury },
        },
      })
    ).toEqual({
      title: "Removal request challenged for your budget in Alpha.",
      excerpt: "0x0000...00cc challenged a removal request for your budget.",
      appPath: `/${goalTreasury}/events`,
      actorName: "0x0000...00cc",
    });
  });

  it("falls back to generic copy for challenger roles on non-dispute reasons", () => {
    expect(
      buildProtocolNotificationPresentation({
        reason: "budget_accepted",
        actorWalletAddress: actorWalletAddress,
        payload: {
          role: "challenger",
          labels: { goalName: "Alpha" },
          resource: { goalTreasury },
        },
      })
    ).toEqual({
      title: "Budget accepted in Alpha.",
      excerpt: "The proposal cleared governance and is queued for activation.",
      appPath: `/${goalTreasury}/events`,
      actorName: "0x0000...00cc",
    });
  });

  it.each(["requester", "proposer"])(
    "falls back to generic copy for %s roles on non-request reasons",
    (role) => {
      expect(
        buildProtocolNotificationPresentation({
          reason: "goal_active",
          actorWalletAddress: actorWalletAddress,
          payload: {
            role,
            labels: { goalName: "Alpha" },
            resource: { goalTreasury },
          },
        })
      ).toEqual({
        title: "Alpha is now active.",
        excerpt: "The goal has moved from funding into the active phase.",
        appPath: `/${goalTreasury}/events`,
        actorName: "0x0000...00cc",
      });
    }
  );

  it.each([
    "goal_owner",
    "goal_stakeholder",
    "goal_underwriter",
    "budget_underwriter",
    "juror",
  ])("parses %s as a recognized role and falls back to generic copy", (role) => {
    expect(
      buildProtocolNotificationPresentation({
        reason: "budget_activated",
        actorWalletAddress: null,
        payload: {
          role,
          labels: { goalName: "Alpha" },
          resource: { goalTreasury },
        },
      })
    ).toEqual({
      title: "Budget activated in Alpha.",
      excerpt: "The budget is now active for funding.",
      appPath: `/${goalTreasury}/events`,
      actorName: null,
    });
  });

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
    [
      "mechanism_proposed",
      "New allocation mechanism proposed in Alpha.",
      "0x0000...00cc opened a new allocation mechanism request.",
    ],
    [
      "mechanism_challenged",
      "Allocation mechanism request challenged in Alpha.",
      "0x0000...00cc challenged an allocation mechanism request.",
    ],
    [
      "mechanism_accepted",
      "Allocation mechanism accepted in Alpha.",
      "The allocation mechanism request cleared governance and is queued for activation.",
    ],
    ["mechanism_activated", "Allocation mechanism activated in Alpha.", "The allocation mechanism is now active."],
    [
      "mechanism_removal_requested",
      "Allocation mechanism removal requested in Alpha.",
      "0x0000...00cc requested allocation mechanism removal.",
    ],
    [
      "mechanism_removal_accepted",
      "Allocation mechanism removal accepted in Alpha.",
      "The removal request cleared governance and is queued for final removal.",
    ],
    ["mechanism_removed", "Allocation mechanism removed in Alpha.", "The allocation mechanism was removed."],
    ["budget_active", "Budget in Alpha is now active.", "This budget entered the active funding phase."],
    ["budget_succeeded", "Budget in Alpha succeeded.", "This budget reached a succeeded terminal state."],
    ["budget_failed", "Budget in Alpha failed.", "This budget reached a failed terminal state."],
    ["budget_expired", "Budget in Alpha expired.", "This budget reached an expired terminal state."],
    ["underwriter_slashed", "Underwriter slash applied in Alpha.", "A slash was applied to your underwriting position."],
    ["goal_active", "Alpha is now active.", "The goal has moved from funding into the active phase."],
    ["goal_succeeded", "Alpha succeeded.", "The goal reached a succeeded terminal state."],
    ["goal_expired", "Alpha expired.", "The goal reached an expired terminal state."],
    ["juror_dispute_created", "New juror dispute in Alpha.", "A new dispute is waiting for juror attention."],
    ["juror_voting_open", "Juror voting opened in Alpha.", "Voting is now open on this dispute."],
    ["juror_reveal_open", "Juror reveal opened in Alpha.", "Reveal is now open for your committed vote."],
    ["juror_ruling_final", "Juror ruling finalized in Alpha.", "The dispute finished with a final ruling."],
    ["juror_slashable", "Juror slash risk in Alpha.", "The dispute resolved in a way that may leave your juror stake slashable."],
    ["juror_slashed", "Juror slashed in Alpha.", "A slash was applied to your juror stake."],
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

  it("falls back to generic request copy when payload role is unknown", () => {
    expect(
      buildProtocolNotificationPresentation({
        reason: "budget_proposed",
        actorWalletAddress,
        payload: {
          role: "someone_else",
          labels: { goalName: "Alpha" },
          resource: { goalTreasury },
        },
      })
    ).toEqual({
      title: "New budget proposed in Alpha.",
      excerpt: "0x0000...00cc opened a new budget request.",
      appPath: `/${goalTreasury}/events`,
      actorName: "0x0000...00cc",
    });
  });

  it.each([
    ["budget_proposed", "A new budget request entered governance."],
    ["budget_proposal_challenged", "A budget request moved into dispute."],
    ["budget_removal_requested", "A removal request was submitted for this budget."],
    ["budget_removal_challenged", "The removal request moved into dispute."],
    ["mechanism_proposed", "A new allocation mechanism request entered governance."],
    ["mechanism_challenged", "An allocation mechanism request moved into dispute."],
    ["mechanism_removal_requested", "A removal request was submitted for this allocation mechanism."],
  ])("uses non-actor fallback excerpt copy for %s", (reason, excerpt) => {
    expect(
      buildProtocolNotificationPresentation({
        reason,
        actorWalletAddress: null,
        payload: null,
      }).excerpt
    ).toBe(excerpt);
  });

  it.each([
    ["goal_succeeded", "Goal succeeded."],
    ["goal_expired", "Goal expired."],
    ["juror_dispute_created", "New juror dispute."],
    ["juror_voting_open", "Juror voting is open."],
    ["juror_reveal_open", "Juror reveal is open."],
    ["juror_ruling_final", "Juror ruling finalized."],
  ])("uses no-goal fallback title copy for %s", (reason, title) => {
    expect(
      buildProtocolNotificationPresentation({
        reason,
        actorWalletAddress: null,
        payload: {
          labels: { goalName: "   " },
          resource: { goalTreasury: "not-an-address" },
        },
      }).title
    ).toBe(title);
  });
});
