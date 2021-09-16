const {LimiterService} = require('sepal/service/limiter')

const {limiterService: exportLimiterService, limiter$: exportLimiter$} = LimiterService({
    name: 'ExportLimiter',
    rateWindowMs: 1000,
    maxRate: 2,
    maxConcurrency: 3
})

module.exports = {exportLimiterService, exportLimiter$}
