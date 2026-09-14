import {createRequire} from 'module'
import {defer, NEVER, of, switchMap, throwError} from 'rxjs'

import {job} from '#gee/jobs/job'
import {loadRecipe$} from '#sepal/ee/recipe'
import {fileName} from '#sepal/path'

const require = createRequire(import.meta.url)

// A job for the lifecycle cases. It leaves a read in flight that is deliberately not part of the
// returned pipeline, so tearing that read down is the operation's doing rather than the pipeline's,
// and then ends on a second read the case decides when to answer.
const worker$ = ({requestArgs: {pendingRecipeId, gateRecipeId, ending}}) =>
    defer(() => {
        loadRecipe$(pendingRecipeId).subscribe({error: () => {}})
        return loadRecipe$(gateRecipeId)
    }).pipe(
        switchMap(recipe => {
            switch (ending) {
                case 'fail': return throwError(() => new Error('the job failed'))
                case 'cancel': return NEVER
                default: return of(recipe)
            }
        })
    )

export default job({
    jobName: 'test recipe lifecycle',
    jobPath: fileName(import.meta.url),
    before: [require('#gee/jobs/configure').default],
    worker$
})
