import {EMPTY, tap} from 'rxjs'

import {job} from '#gee/jobs/job'
import {contextService, getContext$} from '#gee/jobs/service/context'
import {configure} from '#sepal/context'
import {RecipeScope} from '#sepal/ee/recipeScope'
import {createRecipeReader} from '#sepal/recipe/recipeReader'
import {swallow} from '#sepal/rxjs'

// Runs before every job in this worker, on the request's own state, so the reader and the records
// read with it belong to this request and no other.
const worker$ = ({credentials: {sepalUser} = {}, state}) => {
    return getContext$().pipe(
        tap(context => {
            configure(context)
            state.recipeScope = new RecipeScope(createRecipeReader({
                recipeEndpoint: context.recipeEndpoint,
                principal: sepalUser
            }))
        }),
        swallow()
    )
}

// Runs once the whole task list has finalized, however it ended - so configuring is a step of the
// operation rather than an operation whose completion would release the records the job still needs.
const finalize$ = ({state}) => {
    state?.recipeScope?.close()
    return EMPTY
}

export default job({
    jobName: 'Configure shared library',
    before: [],
    services: [contextService],
    worker$,
    finalize$
})
