const {Limiter} = require('sepal/service/limiter')

module.exports = Limiter({
    name: 'Serializer',
    maxConcurrency: 1
})
