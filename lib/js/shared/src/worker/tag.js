const {tag} = require('#sepal/tag')

const jobTag = jobName => tag('Job', jobName)

const workerTag = (jobName, workerId) => tag('Worker', jobName, workerId)

const taskTag = taskName => tag('Task', taskName)

module.exports = {
    jobTag,
    workerTag,
    taskTag
}
