import {EMPTY, tap} from 'rxjs'

import {configure} from '#sepal/context'
import {RecipeScope} from '#sepal/ee/recipeScope'
import {HttpGeoIdAdapter} from '#sepal/geoId/httpGeoIdAdapter'
import {swallow} from '#sepal/rxjs'
import {job} from '#task/jobs/job'
import {contextService, getCurrentContext$} from '#task/jobs/service/context'
import {createRecipeReader} from '#task/recipeReader'

// The reader is selected here rather than defaulted in the shared loader, so neither module inherits
// the other's authority. It and the records read with it belong to this task execution.
const worker$ = ({state}) => {
    return getCurrentContext$().pipe(
        tap(({config}) => {
            configure(config)
            const geoIds = new HttpGeoIdAdapter({endpoint: config.geoIdEndpoint})
            state.recipeScope = new RecipeScope(
                createRecipeReader(config),
                {geoIdFeature$: geoId => geoIds.feature$(geoId)}
            )
        }),
        swallow()
    )
}

// Runs once the whole task list has finalized, however it ended.
const finalize$ = ({state}) => {
    state?.recipeScope?.close()
    return EMPTY
}

export default job({
    jobName: 'Configure shared library',
    services: [contextService],
    worker$,
    finalize$
})
