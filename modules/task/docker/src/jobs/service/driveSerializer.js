const {LimiterService} = require('sepal/service/limiter')

const {limiterService: driveSerializerService, limiter$: driveSerializer$} = LimiterService({
    name: 'DriveSerializer',
    maxConcurrency: 1
})

module.exports = {driveSerializerService, driveSerializer$}
