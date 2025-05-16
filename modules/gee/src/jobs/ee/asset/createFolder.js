const {job} = require('#gee/jobs/job')

const worker$ = ({
    requestArgs: {id}
}) => {
    const ee = require('#sepal/ee/ee')
    const _ = require('lodash')
    return ee.createFolder$(id)
}

module.exports = job({
    jobName: 'EE create folder',
    jobPath: __filename,
    worker$
})
