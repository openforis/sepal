const log = require('@sepal/log')
const job = require('@sepal/job')
const eeAuth = require('@sepal/ee/auth')
const {getInfo$} = require('@sepal/ee/utils')

const worker$ = ({tableId, columnName}) => {
    const ee = require('@google/earthengine')

    log.debug('Get EE Table column values:', {tableId, columnName})

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
    before: [eeAuth],
    worker$
})
