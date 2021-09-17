const {LimiterService} = require('sepal/service/limiter')

const {limiterService: testLimiterService, limiter$: testLimiter$} = LimiterService({
    name: 'Test',
    maxRate: 5,
    maxConcurrency: 5
})

module.exports = {testLimiterService, testLimiter$}
