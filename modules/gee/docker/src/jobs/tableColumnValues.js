const log = require('../log')
const job = require('../job')
const eeAuth = require('./eeAuth')
const {getInfo$} = require('./eeUtils')

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
