const {LimiterService} = require('sepal/service/limiter')

module.exports = LimiterService({
    name: 'EE',
    rateWindowMs: 1000,
    maxRate: 10,
    maxConcurrency: 20
})
