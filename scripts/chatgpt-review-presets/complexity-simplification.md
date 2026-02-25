Objective:
Find behavior-preserving simplifications that reduce complexity, risk, and maintenance cost.

Review priorities:
- Dead code, stale feature toggles, and no-op abstractions.
- Overly nested control flow in request handlers and streaming orchestration.
- Duplicated validation/auth/grant logic that should be centralized.
- State that can be derived instead of persisted or threaded through layers.
- Redundant wrappers around DB/Redis/client calls.
- Naming and type clarity improvements that reduce misuse risk.
