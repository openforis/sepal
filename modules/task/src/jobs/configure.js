import {tap} from 'rxjs'

import {configure} from '#sepal/context'
import {configureRecipeReader} from '#sepal/ee/recipe'
import {swallow} from '#sepal/rxjs'
import {job} from '#task/jobs/job'
import {contextService, getCurrentContext$} from '#task/jobs/service/context'
import {createRecipeReader} from '#task/recipeReader'

// The reader is selected here rather than defaulted in the shared loader, so neither module inherits the
// other's authority.
const worker$ = () => {
    return getCurrentContext$().pipe(
        tap(({config}) => {
            configure(config)
            configureRecipeReader(createRecipeReader(config))
        }),
        swallow()
    )
}

export default job({
    jobName: 'Configure shared library',
    services: [contextService],
    worker$
})
