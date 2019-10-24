const path = require('path')
const _ = require('lodash')
const job = require('../job')
const config = require('../config')
const log = require('../log')

module.exports = (req, relativePath, args, callback) => {
    const sepalUser = JSON.parse(req.headers['sepal-user'])
    const serviceAccountCredentials = config.serviceAccountCredentials
    log.debug(`Submitting EE job: ${relativePath}`)
    return job.submit({
        auth: {
            modulePath: path.join(__dirname, 'authenticate.js'),
            args: {
                sepalUser,
                serviceAccountCredentials
            }
        },
        relativePath,
        args,
    }, callback)
}
