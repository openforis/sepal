import {LimiterService} from '#sepal/service/limiter'

const options = {
    maxConcurrency: 1
}

const {limiterService: gcsSerializerService, limiter$: gcsSerializer$} = LimiterService('GCSSerializer', options)

export {gcsSerializerService, gcsSerializer$}
