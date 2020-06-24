const tag = (tag, name, id) => `${tag}<${name}${id ? `.${id.substr(-4)}` : ''}>`
// const tag = (tag, name, id) => `[${tag}.${name}${id ? `.${id.substr(-4)}` : ''}]`

const jobTag = (jobName, jobId) => tag('Job', jobName, jobId)
const workerTag = (jobName, workerId) => tag('Worker', jobName, workerId)
const taskTag = taskName => tag('Task', taskName)

module.exports = {
    jobTag,
    workerTag,
    taskTag
}
