import {job} from '#gee/jobs/job'
import {configure} from '#sepal/context'
import {contextService, getContext$} from '#gee/jobs/service/context'
import {tap} from 'rxjs'
import {swallow} from '#sepal/rxjs'

const worker$ = () => {
    return getContext$().pipe(
        tap(context => configure(context)),
        swallow()
    )
}

export default job({
    jobName: 'Configure shared library',
    before: [],
    services: [contextService],
    worker$
})
