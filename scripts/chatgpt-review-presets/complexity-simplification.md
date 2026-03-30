Objective:
Find behavior-preserving simplifications that reduce complexity, risk, and maintenance cost.

Review priorities:
- Dead code, stale feature toggles, and no-op abstractions.
- Overly nested control flow in request handlers and streaming orchestration.
- Duplicated validation/auth/grant logic that should be centralized.
- State that can be derived instead of persisted or threaded through layers.
- Redundant wrappers around DB/Redis/client calls.
- Naming and type clarity improvements that reduce misuse risk.


Patch-file output:
- Please return your final response as a single `.patch` file attachment with a `.patch` filename rather than as a normal prose review.
- Put all actionable fixes into one unified diff that we can download and apply directly.
- Limit the patch to concrete changes that fit this review scope, and keep the diff self-contained.
- If there are important residual concerns that you did not change, list them briefly outside the patch.
- If you find no actionable issues, say so explicitly instead of inventing a patch.
