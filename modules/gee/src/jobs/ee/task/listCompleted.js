import _ from 'lodash'
import {map} from 'rxjs'
import {fileURLToPath} from 'url'

import {job} from '#gee/jobs/job'
import ee from '#sepal/ee/ee'

const __filename = fileURLToPath(import.meta.url)

const worker$ = ({
    credentials: {sepalUser: {googleTokens}}
}) => {

    if (!googleTokens) {
        throw Error('Requires a connected Google Account')
    }

    const mapResults = operations =>
        operations
            .filter(({done, error}) => done && !error)
            .map(({name}) => name)

    return ee.listOperations$().pipe(
        map(mapResults)
    )
}

export default job({
    jobName: 'EE completed tasks',
    jobPath: __filename,
    worker$
})
