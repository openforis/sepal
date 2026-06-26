import {map, switchMap} from 'rxjs'

import {job} from '#gee/jobs/job'
import ImageFactory from '#sepal/ee/imageFactory'
import {loadRecipe$} from '#sepal/ee/recipe'
import {fileName} from '#sepal/path'

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
    jobPath: fileName(import.meta.url),
    worker$
})
