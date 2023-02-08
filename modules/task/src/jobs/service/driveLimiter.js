const {LimiterService} = require('#sepal/service/limiter')

const options = {
    rateWindowMs: 1000,
    maxRate: 5,
    maxConcurrency: 5
}

const {limiterService: driveLimiterService, limiter$: driveLimiter$} = LimiterService('DriveLimiter', options)

module.exports = {driveLimiterService, driveLimiter$}
