import _ from 'lodash'

import {job} from '#gee/jobs/job'
import ee from '#sepal/ee/ee'
import {fileName} from '#sepal/path'

const worker$ = ({
    requestArgs: {id},
    credentials: {sepalUser: {googleTokens}}
}) => {
    if (!googleTokens) {
        throw Error('Requires a connected Google Account')
    }
    return ee.createFolder$(id)
}

export default job({
    jobName: 'EE create folder',
    jobPath: fileName(import.meta.url),
    worker$
})
