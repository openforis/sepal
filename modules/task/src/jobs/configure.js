import {job} from '#task/jobs/job'
import {configure} from '#sepal/context'
import {getCurrentContext$, contextService} from '#task/jobs/service/context'
import {tap} from 'rxjs'
import {swallow} from '#sepal/rxjs'

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
