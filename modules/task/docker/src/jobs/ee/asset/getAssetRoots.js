const job = require('root/jobs/job')

const worker$ = () => {
    const ee = require('ee')
    return ee.getAssetRoots$()
}

module.exports = job({
    jobName: 'Get asset roots',
    jobPath: __filename,
    before: [require('root/jobs/ee/initialize')],
    args: () => [],
    worker$
})
