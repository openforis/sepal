const {job} = require('#gee/jobs/job')

const worker$ = ({
    requestArgs: {tableId, columnName}
}) => {
    const ee = require('#sepal/ee/ee')

    return ee.getInfo$(
        ee.FeatureCollection(tableId)
            .distinct(columnName)
            .sort(columnName)
            .aggregate_array(columnName),
        'column values'
    )
}

module.exports = job({
    jobName: 'Get EE Table column values',
    jobPath: __filename,
    worker$
})
