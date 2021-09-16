const {LimiterService} = require('sepal/service/limiter')

const {limiterService: gcsSerializerService, limiter$: gcsSerializer$} = LimiterService({
    name: 'GCSSerializer',
    maxConcurrency: 1
})

module.exports = {gcsSerializerService, gcsSerializer$}
