const {tag} = require('sepal/tag')

const serviceTag = serviceName => tag('Service', serviceName)

module.exports = {
    serviceTag
}
