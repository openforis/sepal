import _ from 'lodash'

import {job} from '#gee/jobs/job'
import ee from '#sepal/ee/ee'
import {fileName} from '#sepal/path'

const worker$ = ({
    requestArgs: {sourceId, destinationId},
    credentials: {sepalUser: {googleTokens}}
}) => {
    if (!googleTokens) {
        throw Error('Requires a connected Google Account')
    }
    return ee.renameAsset$(sourceId, destinationId)
}

export default job({
    jobName: 'EE rename asset',
    jobPath: fileName(import.meta.url),
    worker$
})
