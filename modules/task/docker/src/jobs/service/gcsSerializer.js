const {Limiter} = require('sepal/service/limiter')

module.exports = Limiter({
    name: 'GCSSerializer',
    maxConcurrency: 1
})
