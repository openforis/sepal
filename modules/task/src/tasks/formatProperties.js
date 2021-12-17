const _ = require('lodash')

module.exports = {
    formatProperties: properties => {
        const formatted = {}
        Object.keys(properties).forEach(key => {
            const value = properties[key]
            formatted[key] = _.isString(value) || _.isNumber(value) ? value : JSON.stringify(value)
        })
        return formatted
    }
}
