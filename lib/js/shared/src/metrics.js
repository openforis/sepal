const {of, BehaviorSubject, Subject, timer, exhaustMap, merge} = require('rxjs')
const {collectDefaultMetrics, Registry, Counter, Gauge, Histogram, Summary} = require('prom-client')
const {v4: uuid} = require('uuid')
const {isMainThread} = require('worker_threads')

const WORKER_METRICS_INTERVAL_MS = 5000

const register = new Registry()
const metricsRequest$ = new Subject()
const metricsResponsesById$ = {}

const getSubscription = id => ({
    unsubscribe: () => delete metricsResponsesById$[id]
})

const registerWorkerMetrics = () => {
    const id = uuid()
    const metricsResponse$ = new BehaviorSubject()
    metricsResponsesById$[id] = metricsResponse$
    const metricsSubscription = getSubscription(id)
    return {metricsRequest$, metricsResponse$, metricsSubscription}
}

const initWorkerMetrics = labels =>
    collectDefaultMetrics({
        register,
        labels
    })

const getWorkerMetrics$ = () => {
    metricsRequest$.next()
    const responses$ = Object.values(metricsResponsesById$)
    return of(responses$.map(response$ => response$.getValue()).join('\n'))
}

const publishWorkerMetrics = ({metricsRequest$, metricsResponse$}) => {
    merge(metricsRequest$, timer(0, WORKER_METRICS_INTERVAL_MS)).pipe(
        exhaustMap(async () => await register.metrics())
    ).subscribe({
        next: metrics => metricsResponse$.next(metrics)
    })
}

const getRegister = () =>
    isMainThread
        ? undefined
        : register

const createCounter = options =>
    new Counter({register: getRegister(), ...options})

const createGauge = options =>
    new Gauge({register: getRegister(), ...options})

const createHistogram = options =>
    new Histogram({register: getRegister(), ...options})

const createSummary = options =>
    new Summary({register: getRegister(), ...options})

module.exports = {registerWorkerMetrics, initWorkerMetrics, publishWorkerMetrics, getWorkerMetrics$, createCounter, createGauge, createHistogram, createSummary}
