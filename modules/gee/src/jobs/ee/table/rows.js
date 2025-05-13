const {job} = require('#gee/jobs/job')

const worker$ = ({tableId}) => {
    const ee = require('#sepal/ee/ee')
    const {getRows$} = require('#sepal/ee/table')
    return getRows$(ee.FeatureCollection(tableId), 'load table rows')
}

module.exports = job({
    jobName: 'Get EE Table rows',
    jobPath: __filename,
    args: ctx => [ctx.request.query],
    worker$
})
