const {job} = require('#gee/jobs/job')

const worker$ = ({id}) => {
    const ee = require('#sepal/ee')
    const _ = require('lodash')
    return ee.deleteAssetRecursive$(id)
}

module.exports = job({
    jobName: 'EE delete asset',
    jobPath: __filename,
    worker$
})
