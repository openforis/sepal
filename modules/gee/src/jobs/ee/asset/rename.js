import _ from 'lodash'
import {defer} from 'rxjs'

import {job} from '#gee/jobs/job'
import ee from '#sepal/ee/ee'
import {isServiceAccount} from '#sepal/ee/eeContext'
import {fileName} from '#sepal/path'

const worker$ = ({
    requestArgs: {sourceId, destinationId}
}) => defer(() => {
    if (isServiceAccount()) {
        throw new Error('Cannot rename an asset using service account.')
    }
    return ee.renameAsset$(sourceId, destinationId)
})

export default job({
    jobName: 'EE rename asset',
    jobPath: fileName(import.meta.url),
    worker$
})
