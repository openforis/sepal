const {job} = require('#gee/jobs/job')

const worker$ = ({
    requestArgs: {id}
}) => {
    const ee = require('#sepal/ee/ee')
    const _ = require('lodash')
    return ee.deleteAssetRecursive$(id)
}

module.exports = job({
    jobName: 'EE delete asset',
    jobPath: __filename,
    worker$
})
