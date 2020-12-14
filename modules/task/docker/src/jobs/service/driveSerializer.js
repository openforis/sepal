const {Limiter} = require('sepal/service/limiter')

module.exports = Limiter({
    name: 'DriveSerializer',
    maxConcurrency: 1
})
