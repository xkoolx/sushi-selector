// Orchestrator entry point. Phase 0 verifies the static shell loads and the
// worker is reachable; the capture flow and state machine (IDLE, PREPROCESS,
// INDEX, DETAILS, RECONCILE, READY, ERROR) are built in Phase 1.

async function checkHealth() {
  try {
    const res = await fetch("/api/health");
    if (!res.ok) return;
    const body = await res.json();
    console.info("Sushi Selector worker healthy:", body);
  } catch (err) {
    console.warn("Health check failed:", err);
  }
}

checkHealth();
