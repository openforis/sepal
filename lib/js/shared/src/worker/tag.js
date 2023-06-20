const {tag} = require('#sepal/tag')

const jobTag = jobName => tag('Job', jobName)

const workerTag = workerId => tag('Worker', workerId)

const taskTag = taskName => tag('Task', taskName)

const userTag = username => tag('User', username)

module.exports = {
    jobTag,
    workerTag,
    taskTag,
    userTag
}
