import {tap} from 'rxjs'

import {job} from '#gee/jobs/job'
import {contextService, getContext$} from '#gee/jobs/service/context'
import {configure} from '#sepal/context'
import {configureRecipeReader} from '#sepal/ee/recipe'
import {createRecipeReader} from '#sepal/recipe/recipeReader'
import {swallow} from '#sepal/rxjs'

// Runs before every job in this worker, and always replaces the reader - with one that refuses when the
// request carried no user - so no job reads recipes as the user of the job before it.
const worker$ = ({credentials: {sepalUser} = {}}) => {
    return getContext$().pipe(
        tap(context => {
            configure(context)
            configureRecipeReader(createRecipeReader({
                recipeEndpoint: context.recipeEndpoint,
                principal: sepalUser
            }))
        }),
        swallow()
    )
}

export default job({
    jobName: 'Configure shared library',
    before: [],
    services: [contextService],
    worker$
})
