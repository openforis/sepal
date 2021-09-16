const {LimiterService} = require('sepal/service/limiter')

const {limiterService: driveLimiterService, limiter$: driveLimiter$} = LimiterService({
    name: 'DriveLimiter',
    rateWindowMs: 1000,
    maxRate: 5,
    maxConcurrency: 5
})

module.exports = {driveLimiterService, driveLimiter$}
