const Job = require('#sepal/worker/job')
const logConfig = require('#config/log.json')

module.exports = {job: Job(logConfig)}
