const {tag} = require('#sepal/tag')

const requestTag = requestId => tag('Request', requestId)

const jobTag = jobName => tag('Job', jobName)

const workerTag = (jobName, workerId) => tag('Worker', jobName, workerId)

const taskTag = taskName => tag('Task', taskName)

module.exports = {
    requestTag,
    jobTag,
    workerTag,
    taskTag
}
