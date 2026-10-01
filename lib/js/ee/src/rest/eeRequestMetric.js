import {createCounter} from '#sepal/metrics'

const requestCounter = createCounter({
    name: 'sepal_ee_requests_total',
    help: 'SEPAL Earth Engine REST requests',
    labelNames: ['auth', 'status']
})

// Counts in the calling thread's registry. Only the main thread's registry is published, so a worker thread
// has to hand the count to the main thread.
export const countEERequest = ({auth, status}) =>
    requestCounter.inc({auth, status})
