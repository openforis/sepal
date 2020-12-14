const {Limiter} = require('sepal/service/limiter')

module.exports = Limiter({
    name: 'ExportLimiter',
    rateWindowMs: 1000,
    maxRate: 2,
    maxConcurrency: 3
})
