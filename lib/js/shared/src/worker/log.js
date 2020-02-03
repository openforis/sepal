const logger = require('sepal/log')

module.exports = port =>
    logger({
        trace: (...args) => port.postMessage({log: {level: 'trace', args}}),
        debug: (...args) => port.postMessage({log: {level: 'debug', args}}),
        info: (...args) => port.postMessage({log: {level: 'info', args}}),
        warn: (...args) => port.postMessage({log: {level: 'warn', args}}),
        error: (...args) => port.postMessage({log: {level: 'error', args}}),
        fatal: (...args) => port.postMessage({log: {level: 'fatal', args}}),
    })
