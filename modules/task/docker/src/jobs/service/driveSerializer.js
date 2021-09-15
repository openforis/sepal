const {LimiterService} = require('sepal/service/limiter')

module.exports = LimiterService({
    name: 'DriveSerializer',
    maxConcurrency: 1
})
