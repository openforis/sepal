import {EMPTY, tap} from 'rxjs'

import {job} from '#gee/jobs/job'
import {contextService, getContext$} from '#gee/jobs/service/context'
import {configure} from '#sepal/context'
import {RecipeScope} from '#sepal/ee/recipeScope'
import {HttpGeoIdAdapter} from '#sepal/geoId/httpGeoIdAdapter'
import {createRecipeReader} from '#sepal/recipe/recipeReader'
import {swallow} from '#sepal/rxjs'

// Runs before every job in this worker, on the request's own state, so the reader and the records
// read with it belong to this request and no other.
const worker$ = ({credentials: {sepalUser} = {}, state}) => {
    return getContext$().pipe(
        tap(context => {
            configure(context)
            const geoIds = new HttpGeoIdAdapter({endpoint: context.geoIdEndpoint})
            state.recipeScope = new RecipeScope(
                createRecipeReader({
                    recipeEndpoint: context.recipeEndpoint,
                    principal: sepalUser
                }),
                {geoIdFeature$: geoId => geoIds.feature$(geoId)}
            )
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
