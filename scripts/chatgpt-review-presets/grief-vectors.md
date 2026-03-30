Objective:
Identify griefing, liveness, and denial-of-service vectors where an attacker can cause disproportionate harm.

Review priorities:
- Endpoints or tools that can be spammed into expensive code paths.
- Queue/loop/fanout behavior with attacker-controlled growth.
- Grant/auth refresh paths that can be abused for churn.
- Streaming/session paths that can leak resources under disconnect/retry storms.
- Cache/lock behaviors that degrade under hot-key contention.
- Fallback logic that enables persistent degraded-state attacks.


Patch-file output:
- Please return your final response as a single `.patch` file attachment with a `.patch` filename rather than as a normal prose review.
- Put all actionable fixes into one unified diff that we can download and apply directly.
- Limit the patch to concrete changes that fit this review scope, and keep the diff self-contained.
- If there are important residual concerns that you did not change, list them briefly outside the patch.
- If you find no actionable issues, say so explicitly instead of inventing a patch.
