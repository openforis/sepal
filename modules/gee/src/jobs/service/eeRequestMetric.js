import {first, of} from 'rxjs'

import {countEERequest} from '#sepal/ee/rest/eeRequestMetric'
import {getLogger} from '#sepal/log'
import * as service from '#sepal/service'

const log = getLogger('ee/rest')

// Earth Engine requests are sent from worker threads, whose metrics are not published: they are counted on the
// main thread, whose registry /metrics serves.
export const eeRequestMetricService = {
    serviceName: 'EERequestMetric',
    serviceHandler$: ({auth, status}) => {
        countEERequest({auth, status})
        return of(true)
    }
}

export const recordEERequest = ({auth, status}) => {
    service.submit$(eeRequestMetricService, {auth, status}).pipe(first()).subscribe({
        error: error => log.warn('Failed to record an Earth Engine request:', error)
    })
}
