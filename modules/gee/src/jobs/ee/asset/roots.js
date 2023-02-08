const {job} = require('#gee/jobs/job')

const worker$ = () => {
    const ee = require('#sepal/ee')
    return ee.getAssetRoots$()
}

module.exports = job({
    jobName: 'EE asset roots',
    jobPath: __filename,
    worker$
})
