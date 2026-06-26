import {job} from '#gee/jobs/job'
import ee from '#sepal/ee/ee'
import {fileName} from '#sepal/path'

const worker$ = ({
    requestArgs: {tableId, columnName}
}) => {

    return ee.getInfo$(
        ee.FeatureCollection(tableId)
            .distinct(columnName)
            .sort(columnName)
            .aggregate_array(columnName),
        'column values'
    )
}

export default job({
    jobName: 'Get EE Table column values',
    jobPath: fileName(import.meta.url),
    worker$
})
