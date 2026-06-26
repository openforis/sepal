import {tag} from '#sepal/tag'

const jobTag = jobName => tag('Job', jobName)

const poolTag = poolName => tag('Pool', poolName)

const workerTag = workerId => tag('Worker', workerId)

const taskTag = taskName => tag('Task', taskName)

const userTag = username => tag('User', username)

export {
    jobTag,
    poolTag,
    taskTag,
    userTag,
    workerTag}
