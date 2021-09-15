const {LimiterService} = require('sepal/service/limiter')

module.exports = LimiterService({
    name: 'ExportLimiter',
    rateWindowMs: 1000,
    maxRate: 2,
    maxConcurrency: 3
})
