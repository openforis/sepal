const {LimiterService} = require('#sepal/service/limiter')

const options = {
    rateWindowMs: 1000,
    maxRate: 5,
    maxConcurrency: 10,
    global: {
        rateWindowMs: 1000,
        maxRate: 80,
        maxConcurrency: 35
    }
}

const {limiterService: eeLimiterService, limiter$: eeLimiter$} = LimiterService('EELimiter', options)

module.exports = {eeLimiterService, eeLimiter$}
