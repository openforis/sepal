const {Limiter} = require('sepal/service/limiter')

module.exports = Limiter('TestLimiter', {
    name: 'Test',
    maxRate: 5,
    maxConcurrency: 5
})
