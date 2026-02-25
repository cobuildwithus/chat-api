Objective:
Identify griefing, liveness, and denial-of-service vectors where an attacker can cause disproportionate harm.

Review priorities:
- Endpoints or tools that can be spammed into expensive code paths.
- Queue/loop/fanout behavior with attacker-controlled growth.
- Grant/auth refresh paths that can be abused for churn.
- Streaming/session paths that can leak resources under disconnect/retry storms.
- Cache/lock behaviors that degrade under hot-key contention.
- Fallback logic that enables persistent degraded-state attacks.
