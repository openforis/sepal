const {LimiterService} = require('#sepal/service/limiter')

const options = {
    rateWindowMs: 1000,
    maxRate: 25,
    maxConcurrency: 10,
    global: {
        rateWindowMs: 1000,
        maxRate: 100,
        maxConcurrency: 40
    }
}

const {limiterService: eeLimiterService, limiter$: eeLimiter$} = LimiterService('EELimiter', options)

module.exports = {eeLimiterService, eeLimiter$}
