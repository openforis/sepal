const {Limiter} = require('sepal/service/limiter')

module.exports = Limiter({
    name: 'Export',
    rateWindowMs: 1000,
    maxRate: 2,
    maxConcurrency: 3
})
