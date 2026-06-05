import {job} from '#gee/jobs/job'
import {loadRecipe$} from '#sepal/ee/recipe'
import ImageFactory from '#sepal/ee/imageFactory'
import {map, switchMap} from 'rxjs'
import {fileURLToPath} from 'url'

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
