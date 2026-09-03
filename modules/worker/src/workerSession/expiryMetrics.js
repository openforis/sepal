// expiryMetrics — the notify-mode counter (docs/session-expiration-model.md §5).
//
// In notify mode nothing closes, so the only evidence the policy is producing sane verdicts is how
// often it WOULD have closed something, and to whom. That number is what rollout step 4 watches
// before enforcement is turned on.
//
// createCounter on the main thread lands in prom-client's default global registry, which the
// shared httpServer already serves at GET /metrics.

import {createCounter} from '#sepal/metrics'

const createExpiryMetrics = ({counterFactory = createCounter} = {}) => {
    const wouldHaveClosedCounter = counterFactory({
        name: 'sepal_session_would_have_closed_total',
        help: 'Sessions the expiry sweep would have closed, had SESSION_EXPIRY_MODE been enforce',
        labelNames: ['instance_type'],
    })

    const wouldHaveClosed = session =>
        wouldHaveClosedCounter.inc({instance_type: session?.instanceType ?? 'unknown'})

    return {wouldHaveClosed}
}

export {createExpiryMetrics}
