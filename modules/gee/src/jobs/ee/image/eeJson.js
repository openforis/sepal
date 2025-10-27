const {job} = require('#gee/jobs/job')

const worker$ = ({
    requestArgs: {recipeId}
}) => {
    const {loadRecipe$} = require('#sepal/ee/recipe')
    const ImageFactory = require('#sepal/ee/imageFactory')
    const {map, switchMap} = require('rxjs')
    
    return loadRecipe$(recipeId).pipe(
        switchMap(recipe => ImageFactory(recipe).getImage$()),
        map(image => image.serialize())
    )
}

module.exports = job({
    jobName: 'EE image JSON',
    jobPath: __filename,
    worker$
})
