import {LimiterService} from '#sepal/service/limiter'

const options = {
    maxConcurrency: 1
}

const {limiterService: driveSerializerService, limiter$: driveSerializer$} = LimiterService('DriveSerializer', options)

export {driveSerializerService, driveSerializer$}
