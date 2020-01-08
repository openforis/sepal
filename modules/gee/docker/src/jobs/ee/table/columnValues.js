const job = require('root/jobs/job')

const worker$ = ({tableId, columnName}) => {
    const ee = require('@google/earthengine')
    const {getInfo$} = require('root/ee/utils')

    return getInfo$(
        ee.FeatureCollection(tableId)
            .distinct(columnName)
            .sort(columnName)
            .aggregate_array(columnName)
    )
}

module.exports = job({
    jobName: 'Get EE Table column values',
    jobPath: __filename,
    before: [require('root/jobs/ee/initialize')],
    args: ctx => [ctx.request.query],
    worker$
})
