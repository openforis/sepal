const job = require('root/jobs/job')

const worker$ = (taskId, description) => {
    const ee = require('ee')
    return ee.$({
        operation: `cancel task (${description})`,
        ee: (resolve, reject) =>
            ee.data.cancelTask(taskId,
                (_canceled, error) => error
                    ? reject(error)
                    : resolve()
            )
    })
}

module.exports = job({
    jobName: 'Cancel task',
    jobPath: __filename,
    before: [require('root/jobs/ee/initialize')],
    args: ({taskId, description}) => [taskId, description],
    worker$
})
