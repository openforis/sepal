const {job} = require('#gee/jobs/job')

const worker$ = ({sourceId, destinationId}) => {
    const ee = require('#sepal/ee/ee')
    const _ = require('lodash')
    return ee.renameAsset$(sourceId, destinationId)
}

module.exports = job({
    jobName: 'EE rename asset',
    jobPath: __filename,
    worker$
})
