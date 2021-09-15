const {LimiterService} = require('sepal/service/limiter')

module.exports = LimiterService({
    name: 'GCSSerializer',
    maxConcurrency: 1
})
