const {LimiterService} = require('#sepal/service/limiter')

const options = {
    maxConcurrency: 1
}

const {limiterService: gcsSerializerService, limiter$: gcsSerializer$} = LimiterService('GCSSerializer', options)

module.exports = {gcsSerializerService, gcsSerializer$}
