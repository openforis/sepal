const {of, Subject, zip, map} = require('rxjs')
const {collectDefaultMetrics, Registry, Counter, Gauge, Histogram, Summary} = require('prom-client')
const {v4: uuid} = require('uuid')
const {isMainThread} = require('worker_threads')

const register = new Registry()
const metricsRequest$ = new Subject()
const metricsResponsesById$ = {}

const getSubscription = id => ({
    unsubscribe: () => delete metricsResponsesById$[id]
})

const registerWorkerMetrics = () => {
    const id = uuid()
    const metricsResponse$ = new Subject()
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
    return zip(of('# Worker metrics\n'), ...responses$).pipe(
        map(values => values.join('\n'))
    )
}

const getMetrics = async () =>
    await register.metrics()

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

module.exports = {registerWorkerMetrics, initWorkerMetrics, getWorkerMetrics$, getMetrics, createCounter, createGauge, createHistogram, createSummary}
