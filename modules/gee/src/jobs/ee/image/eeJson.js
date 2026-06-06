import {map, switchMap} from 'rxjs'
import {fileURLToPath} from 'url'

import {job} from '#gee/jobs/job'
import ImageFactory from '#sepal/ee/imageFactory'
import {loadRecipe$} from '#sepal/ee/recipe'

const __filename = fileURLToPath(import.meta.url)

const worker$ = ({
    requestArgs: {recipeId}
}) => {
    
    return loadRecipe$(recipeId).pipe(
        switchMap(recipe => ImageFactory(recipe).getImage$()),
        map(image => image.serialize())
    )
}

export default job({
    jobName: 'EE image JSON',
    jobPath: __filename,
    worker$
})
