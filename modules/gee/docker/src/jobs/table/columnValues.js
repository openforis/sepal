const log = require('@sepal/log')
const job = require('@sepal/job')
const eeAuth = require('@sepal/ee/auth')
const {getInfo$} = require('@sepal/ee/utils')

const worker$ = ({tableId, columnName}) => {
    const ee = require('@google/earthengine')

    log.info(`Get column values for table: ${tableId}, column: ${columnName}`)

    return getInfo$(
        ee.FeatureCollection(tableId)
            .distinct(columnName)
            .sort(columnName)
            .aggregate_array(columnName)
    ).pipe(

    )
}

module.exports = job({
    jobName: 'Get table columns',
    jobPath: __filename,
    before: [eeAuth],
    worker$
})
