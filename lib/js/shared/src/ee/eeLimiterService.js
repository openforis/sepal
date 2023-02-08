const {LimiterService} = require('#sepal/service/limiter')

const options = {
    rateWindowMs: 1000,
    maxRate: 10,
    maxConcurrency: 20
}

const {limiterService: eeLimiterService, limiter$: eeLimiter$} = LimiterService('EELimiter', options)

module.exports = {eeLimiterService, eeLimiter$}
