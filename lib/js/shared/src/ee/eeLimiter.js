const {Limiter} = require('sepal/service/limiter')

module.exports = Limiter('EELimiter', {
    name: 'EE',
    rateWindowMs: 1000,
    maxRate: 10,
    maxConcurrency: 20
})
