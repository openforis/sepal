import {createRequire} from 'module'

import {googleProjectId} from '#gee/config'
import {job} from '#gee/jobs/job'
import {eeLimiter$, eeLimiterService} from '#gee/jobs/service/eeLimiter'
import {eeRequestMetricService, recordEERequest} from '#gee/jobs/service/eeRequestMetric'
import {serviceAccountToken$, serviceAccountTokenService} from '#gee/jobs/service/serviceAccountToken'
import ee from '#sepal/ee/ee'
import {EERestClient} from '#sepal/ee/rest/eeRestClient'
import {EERestRuntime} from '#sepal/ee/restRuntime'
import {delete$, get$, patchJson$, postJson$} from '#sepal/httpClient'
import {swallow} from '#sepal/rxjs'

const require = createRequire(import.meta.url)

const runtime = new EERestRuntime({
    ee,
    serviceAccountToken$,
    projectId: googleProjectId,
    createTransport: () => new EERestClient({
        ee,
        http: {get$, postJson$, patchJson$, delete$},
        limiter$: eeLimiter$,
        serviceAccountToken$,
        recordRequest: recordEERequest
    })
})

const worker$ = () =>
    runtime.ready$().pipe(
        swallow()
    )

export default job({
    jobName: 'EE runtime',
    before: [require('#gee/jobs/configure').default],
    services: [eeLimiterService, serviceAccountTokenService, eeRequestMetricService],
    worker$
})
