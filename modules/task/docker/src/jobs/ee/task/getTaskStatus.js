const job = require('root/jobs/job')

const worker$ = (taskId, description) => {
    const ee = require('ee')
    const {map} = require('rxjs/operators')
    return ee.$({
        operation: `get task status (${description})`,
        ee: (resolve, reject) =>
            ee.data.getTaskStatus(taskId,
                (status, error) => error
                    ? reject(error)
                    : resolve(status)
            )
    }).pipe(
        map(([status]) => status)
    )
}

module.exports = job({
    jobName: 'Get task status',
    jobPath: __filename,
    before: [require('root/jobs/ee/initialize')],
    args: ({taskId, description}) => [taskId, description],
    worker$
})
