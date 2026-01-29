const GOAL_PROMPTS: Record<string, { title: string; shortDescription: string; charter: string }> = {
  "raise-1-mil": {
    title: "Raise $1M",
    shortDescription:
      "Cobuild is a launchpad for AI-managed orgs that accomplish ambitious goals. Our current goal is to build a large-scale team to help Cobuild sell $1m in tokens to prove the model works.",
    charter: `# Charter: Raise $1m for Cobuild

Raise $1,000,000 into the Cobuild treasury via the token sale.

## 1. What winning means

### Why this goal exists

This goal funds Cobuild's near-term execution and proves the "network fundraising -> allocation flywheel" works in production.

### Primary success condition

**Cumulative net inflows to the sale treasury >= $1,000,000 USDC** (or other declared base asset).

Treasury balance is a steering metric and runway indicator, not the success metric--spending during the raise (marketing, audits, contractors) doesn't reset progress.

### What counts toward the $1m

**Counts:**
- Net inflows to the **designated sale treasury** from primary issuance (and any explicitly approved sale rails).

**Does NOT count** unless explicitly declared:
- AMM secondary buys
- Wash/looped volume
- Team wallets recycling funds
- "Soft commitments," OTC IOUs, or verbal pledges

### Secondary health indicators

*Used to steer, not to claim success*

- Pace to target (weekly net inflow vs required runway)
- Conversion health (drop-offs in the mint flow)
- Distribution health (unique wallets; repeat participation)
- Contributor throughput (verified contributions/week)

---

## 2. Non-negotiables for this goal

### Fundraising integrity that protects the raise

Everything public-facing (posts, landing copy, FAQs, partner blurbs, spaces) must be framed so we don't create legal/reputation blowback or lose trust mid-raise.

- **No ROI framing:** no "returns," "profit," "guaranteed upside," price predictions, or "early = cheap = win" language.
- **No "floor = protection" framing:** we can describe mechanics, but never imply safety, guarantees, or "you can always get your money back."
- **No fake urgency:** if we say "price changes on X date," it must be true per stage schedule.
- **Claims must be provable:** anything we assert about mechanics, custody, audits, allocations, or traction must be linkable/verifiable (or we don't say it).

**If violated:** we pause outbound promotion, publish a correction, and tighten the comms template before resuming.

---

## 3. Failure modes we defend against

- **"Hype without conversion"** -> Funnel clarity + UX + trust
- **"Spam farming rewards"** -> Stake + challenges + conservative budgets
- **"Opaque allocation drama"** -> Public record + non-retroactive rules
- **"Treasury mis-spend"** -> Multisig + caps + accountability
- **"Runaway complexity"** -> Few briefs, strict linkage

---

## 4. Budget policy

### Disallowed by default

- "Pay for hype" spend with no measurable attribution
- Bots, engagement farms, or artificial amplification
- Anything that implies financial promotion or guarantee language
- Paid endorsements without clear disclosure
- Airdrops or giveaways designed to inflate metrics
- Large upfront payments (prefer milestone-based)
- Speculative trading or yield farming with treasury funds
- Spending that can't be explained publicly

---

## 5. Completion and shutdown

### On success (exceeds $1M)

- Publish final recap: what worked, what didn't, where money went
- Document reusable briefs and playbooks
- Pause new briefs unless explicitly extended

### If timebox ends without success

- Publish post-mortem focused on bottlenecks (not vibes)
- Recommend next goal as a concrete bottleneck-killer
`,
  },
};

export async function getGoalPrompt(goalAddress: string | undefined) {
  if (!goalAddress) return "";
  const key = goalAddress.toLowerCase();
  const goal = GOAL_PROMPTS[key];
  if (!goal) return "";

  return `\n\n# Goal context\n\n## Title\n${goal.title}\n\n## Summary\n${goal.shortDescription}\n\n## Charter\n${goal.charter}`;
}
