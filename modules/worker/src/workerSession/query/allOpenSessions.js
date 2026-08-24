// Returns ALL currently-open (PENDING+ACTIVE) sessions across every user and workerType — the
// worker's authoritative open-session list, used by the budget module for its boot seed and
// hourly reconciler (modules/budget/src/seed.js + reconciler.js, via workerClient.openSessions()).

const allOpenSessions = async (_query, {repo}) => repo.allOpenSessions()

export {allOpenSessions}
