const {LimiterService} = require('sepal/service/limiter')

module.exports = LimiterService({
    name: 'Test',
    maxRate: 5,
    maxConcurrency: 5
})
