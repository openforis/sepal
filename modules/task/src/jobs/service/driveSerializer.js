const {LimiterService} = require('#sepal/service/limiter')

const options = {
    maxConcurrency: 1
}

const {limiterService: driveSerializerService, limiter$: driveSerializer$} = LimiterService('DriveSerializer', options)

module.exports = {driveSerializerService, driveSerializer$}
