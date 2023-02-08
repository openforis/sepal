const {LimiterService} = require('#sepal/service/limiter')

const options = {
    maxRate: 5,
    maxConcurrency: 5
}

const {limiterService: testLimiterService, limiter$: testLimiter$} = LimiterService('Test', options)

module.exports = {testLimiterService, testLimiter$}
