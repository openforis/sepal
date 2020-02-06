const OPEN = ''
const CLOSE = ''
const TAG_DELIMITER = '.'
const ID_DELIMITER = '.'

const tag = (tag, name, id) => `${OPEN}${tag}${TAG_DELIMITER}${name}${id ? `${ID_DELIMITER}${id.substr(-4)}` : ''}${CLOSE}`

const jobTag = (jobName, jobId) => tag('J', jobName, jobId)
const workerTag = (jobName, workerId) => tag('W', jobName, workerId)
const taskTag = taskName => tag('T', taskName)

module.exports = {
    jobTag,
    workerTag,
    taskTag
}
