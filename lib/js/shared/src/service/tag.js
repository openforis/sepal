const {tag} = require('sepal/tag')

const limiterTag = username => tag('Limiter', username)
const serviceTag = serviceName => tag('Service', serviceName)

module.exports = {
    limiterTag,
    serviceTag
}
