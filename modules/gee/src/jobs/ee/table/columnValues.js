import {tap} from 'rxjs'

import {job} from '#gee/jobs/job'
import ee from '#sepal/ee/ee'
import {EEException} from '#sepal/ee/exception'
import {fileName} from '#sepal/path'

const MAX_DISTINCT_VALUES = 256

const worker$ = ({
    requestArgs: {tableId, columnName}
}) => {

    return ee.getInfo$(
        ee.FeatureCollection(tableId)
            .distinct(columnName)
            .sort(columnName)
            .aggregate_array(columnName)
            // One past the limit so the guard below is reachable for continuous/high-cardinality columns.
            .slice(0, MAX_DISTINCT_VALUES + 1),
        'column values'
    ).pipe(
        tap(values => {
            if (values.length > MAX_DISTINCT_VALUES) {
                throw new EEException(`Too many distinct values in column ${columnName} (> ${MAX_DISTINCT_VALUES}).`, {
                    userMessage: {
                        message: 'Too many distinct values',
                        key: 'gee.table.error.tooManyValues',
                        args: {columnName, max: MAX_DISTINCT_VALUES}
                    }
                })
            }
        })
    )
}

export default job({
    jobName: 'Get EE Table column values',
    jobPath: fileName(import.meta.url),
    worker$
})
