const {job} = require('#gee/jobs/job')

const worker$ = ({id}) => {
    const ee = require('#sepal/ee')
    const _ = require('lodash')
    return ee.createFolder$(id)
}

module.exports = job({
    jobName: 'EE create folder',
    jobPath: __filename,
    worker$
})
