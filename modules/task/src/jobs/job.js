const Job = require('#sepal/worker/job')
const logConfig = require('#task/log.json')

module.exports = {job: Job(logConfig)}
