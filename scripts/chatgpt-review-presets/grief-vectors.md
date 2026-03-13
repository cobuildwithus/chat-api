Objective:
Identify griefing, liveness, and denial-of-service vectors where an attacker can cause disproportionate harm.

Review priorities:
- Endpoints or tools that can be spammed into expensive code paths.
- Queue/loop/fanout behavior with attacker-controlled growth.
- Grant/auth refresh paths that can be abused for churn.
- Streaming/session paths that can leak resources under disconnect/retry storms.
- Cache/lock behaviors that degrade under hot-key contention.
- Fallback logic that enables persistent degraded-state attacks.


Parallel-agent output:
- Please return your final response as a set of copy/paste-ready prompts for parallel agents rather than as a normal prose review.
- Create one prompt per distinct issue or tightly related issue cluster.
- In each prompt, describe the issue in detail, explain why it matters, point to the relevant files, symbols, or tests, and include your best guess at a concrete fix.
- Make each prompt self-contained and specific enough that we can hand it directly to an agent with minimal extra context.
- If you find no actionable issues, say so explicitly instead of inventing prompts.
