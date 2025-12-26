const {forkJoin, switchMap} = require('rxjs')
const {exportImageToDrive$} = require('../jobs/export/toDrive')
const ImageFactory = require('#sepal/ee/imageFactory')
const {getCurrentContext$} = require('#task/jobs/service/context')
const {setWorkloadTag} = require('./workloadTag')

module.exports = {
    submit$: (taskId, {image: {recipe, bands, driveFolder: folder, ...retrieveOptions}}) => {
        setWorkloadTag(recipe)
        return getCurrentContext$().pipe(
            switchMap(() => {
                const description = recipe.title || recipe.placeholder
                return export$(taskId, {description, recipe, bands, folder, ...retrieveOptions})
            })
        )
    }
}

const export$ = (taskId, {description, recipe, bands, scale, folder, ...retrieveOptions}) => {
    const factory = ImageFactory(recipe, bands)
    return forkJoin({
        image: factory.getImage$(),
        geometry: factory.getGeometry$()
    }).pipe(
        switchMap(({image, geometry}) =>
            exportImageToDrive$(taskId, {
                image,
                folder,
                ...retrieveOptions,
                description,
                region: geometry.bounds(scale),
                scale
            })
        )
    )
}
