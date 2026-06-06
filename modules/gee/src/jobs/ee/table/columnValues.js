import {fileURLToPath} from 'url'

import {job} from '#gee/jobs/job'
import ee from '#sepal/ee/ee'

const __filename = fileURLToPath(import.meta.url)

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
    jobPath: __filename,
    worker$
})
