const {Limiter} = require('sepal/service/limiter')

module.exports = Limiter({
    name: 'Drive',
    rateWindowMs: 1000,
    maxRate: 5,
    maxConcurrency: 5
})
