const {performance} = require('node:perf_hooks')
const {isMainThread} = require('node:worker_threads')
const os = require('node:os')
const {Subject, timer} = require('rxjs')
const log = require('sepal/log').getLogger('metrics')

const METRICS_INTERVAL_MS = 10000

const metrics$ = new Subject()

const state = {}

const publish = (metrics$, key, data) => {
    const metrics = {
        timestamp: Date.now(),
        key,
        data
    }
    log.debug(metrics)
    metrics$.next(metrics)
}

const publishSystemMetrics = (metrics$, key) =>
    publish(metrics$, key, {
        // timeOrigin: performance.timeOrigin,
        // now: performance.now(),
        eventLoopUtilization: state.eventLoopUtilization,
        memoryUsage: process.memoryUsage(),
        os: {
            cpus: os.cpus().length,
            totalmem: os.totalmem(),
            freemem: os.freemem(),
            loadavg: os.loadavg()
        },
        cpuUsage: process.cpuUsage()
    })

const initProcessMetrics = (metrics$, key) => {
    const systemMetrics$ = timer(0, METRICS_INTERVAL_MS)
    state.subscription = systemMetrics$.subscribe({
        next: () => {
            state.eventLoopUtilization = performance.eventLoopUtilization(state.eventLoopUtilization)
            publishSystemMetrics(metrics$, key)
        }
    })
}

const startMetrics = () => {
    if (isMainThread) {
        initProcessMetrics(metrics$, 'MainProcess')
    } else {
        log.warn('startMetrics can be called from main process only.')
    }
}

const startIntervalMetrics = (callback, intervalMilliseconds) => {
    const customMetrics$ = timer(0, intervalMilliseconds)
    state.subscription = customMetrics$.subscribe({
        next: () => callback(publishMetrics)
    })
    return state.subscription
}
    
const startWorkerMetrics = (metrics$, key) => {
    if (isMainThread) {
        log.warn('startWorkerMetrics cannot be called from main process.')
    } else {
        initProcessMetrics(metrics$, key)
    }
}
    
const publishMetrics = (key, data) =>
    publish(metrics$, key, data)

const disposeMetrics = () => {
    state?.subscription.unsubscribe()
}

module.exports = {metrics$, startMetrics, startWorkerMetrics, startIntervalMetrics, publishMetrics, disposeMetrics}
