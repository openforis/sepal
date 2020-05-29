const Job = require('sepal/worker/job')
const logConfig = require('root/log.json')

module.exports = Job(logConfig)
