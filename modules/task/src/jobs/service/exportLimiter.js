const {LimiterService} = require('#sepal/service/limiter')

const options = {
    rateWindowMs: 1000,
    maxRate: 2,
    maxConcurrency: 3
}

const {limiterService: exportLimiterService, limiter$: exportLimiter$} = LimiterService('ExportLimiter', options)

module.exports = {exportLimiterService, exportLimiter$}
