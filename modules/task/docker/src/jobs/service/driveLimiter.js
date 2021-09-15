const {LimiterService} = require('sepal/service/limiter')

module.exports = LimiterService({
    name: 'DriveLimiter',
    rateWindowMs: 1000,
    maxRate: 5,
    maxConcurrency: 5
})
