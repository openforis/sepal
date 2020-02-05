const OPEN = '['
const CLOSE = ']'
const TAG_DELIMITER = '/'
const ID_DELIMITER = '.'

const tag = (tag, name, id) => `${OPEN}${tag}${TAG_DELIMITER}${name}${id ? `${ID_DELIMITER}${id.substr(-4)}` : ''}${CLOSE}`

const jobTag = (jobName, jobId) => `job ${tag('J', jobName, jobId)}`

const workerTag = (jobName, workerId) => `worker ${tag('W', jobName, workerId)}`

const taskTag = taskName => `task ${tag('T', taskName)}`

module.exports = {jobTag, workerTag, taskTag}
