const job = require('@sepal/worker/job')
const {getInfo$} = require('@sepal/ee/utils')

const worker$ = ({tableId, columnName}) => {
    const ee = require('@google/earthengine')

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
    minIdleCount: 10,
    before: [require('@sepal/ee/initialize')],
    args: ctx => [ctx.request.query],
    worker$
})
