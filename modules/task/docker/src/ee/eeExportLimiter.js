const {Limiter} = require('sepal/service/limiter')

module.exports = Limiter({
    name: 'EE',
    rateWindowMs: 1000,
    maxRate: 2,
    maxConcurrency: 5
})
