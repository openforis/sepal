const {Subject, zip, map} = require('rxjs')
const {collectDefaultMetrics, Registry, Counter, Gauge, Histogram, Summary} = require('prom-client')
const {v4: uuid} = require('uuid')

const register = new Registry()
const metricsRequest$ = new Subject()
const metricsResponsesById$ = {}

const getSubscription = id => ({
    unsubscribe: () => delete metricsResponsesById$[id]
})

const registerMetrics = () => {
    const id = uuid()
    const metricsResponse$ = new Subject()
    metricsResponsesById$[id] = metricsResponse$
    const metricsSubscription = getSubscription(id)
    return {metricsRequest$, metricsResponse$, metricsSubscription}
}

const getMetrics$ = () => {
    metricsRequest$.next()
    return zip(register.metrics(), ...Object.values(metricsResponsesById$)).pipe(
        map(values => values.join('\n'))
    )
}

const initMetrics = labels =>
    collectDefaultMetrics({
        register,
        labels
    })

const getMetrics = async () =>
    await register.metrics()

const createCounter = options =>
    new Counter({
        ...options,
        registers: [register]
    })

const createGauge = options =>
    new Gauge({
        ...options,
        registers: [register]
    })

const createHistogram = options =>
    new Histogram({
        ...options,
        registers: [register]
    })

const createSummary = options =>
    new Summary({
        ...options,
        registers: [register]
    })

module.exports = {registerMetrics, getMetrics$, initMetrics, getMetrics, createCounter, createGauge, createHistogram, createSummary}
