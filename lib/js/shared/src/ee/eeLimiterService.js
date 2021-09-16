const {LimiterService} = require('sepal/service/limiter')

const {limiterService: eeLimiterService, limiter$: eeLimiter$} = LimiterService({
    name: 'EELimiter',
    rateWindowMs: 1000,
    maxRate: 10,
    maxConcurrency: 20
})

module.exports = {eeLimiterService, eeLimiter$}
