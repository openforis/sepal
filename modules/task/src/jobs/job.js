import {inRecipeScope} from '#sepal/ee/recipeScope'
import Job from '#sepal/worker/job'

// Every task of an execution runs inside that execution's own recipe operation, which the configure
// task ahead of them put on the shared state.
export const job = ({worker$, ...config}) =>
    Job({
        ...config,
        schedulerName: 'GoogleEarthEngine',
        worker$: (...args) => inRecipeScope(args[0]?.state?.recipeScope, worker$(...args))
    })
