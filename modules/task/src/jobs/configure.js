import {tap} from 'rxjs'

import {configure} from '#sepal/context'
import {swallow} from '#sepal/rxjs'
import {job} from '#task/jobs/job'
import {contextService, getCurrentContext$} from '#task/jobs/service/context'

const worker$ = () => {
    return getCurrentContext$().pipe(
        tap(({config}) => configure(config)),
        swallow()
    )
}

export default job({
    jobName: 'Configure shared library',
    services: [contextService],
    worker$
})
