import _ from 'lodash'
import {defer} from 'rxjs'

import {job} from '#gee/jobs/job'
import ee from '#sepal/ee/ee'
import {isServiceAccount} from '#sepal/ee/eeContext'
import {fileName} from '#sepal/path'

const worker$ = ({
    requestArgs: {id}
}) => defer(() => {
    if (isServiceAccount()) {
        throw new Error('Cannot create a folder using service account.')
    }
    return ee.createFolder$(id)
})

export default job({
    jobName: 'EE create folder',
    jobPath: fileName(import.meta.url),
    worker$
})
