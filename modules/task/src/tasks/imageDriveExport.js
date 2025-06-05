const {forkJoin, switchMap} = require('rxjs')
const moment = require('moment')
const {exportImageToDrive$} = require('../jobs/export/toDrive')
const ImageFactory = require('#sepal/ee/imageFactory')
const {getCurrentContext$} = require('#task/jobs/service/context')
const {setWorkloadTag} = require('./workloadTag')

module.exports = {
    submit$: (taskId, {image: {recipe, bands, ...retrieveOptions}}) => {
        setWorkloadTag(recipe)
        return getCurrentContext$().pipe(
            switchMap(() => {
                const description = recipe.title || recipe.placeholder
                return export$(taskId, {description, recipe, bands, ...retrieveOptions})
            })
        )
    }
}

const export$ = (taskId, {description, recipe, bands, scale, ...retrieveOptions}) => {
    const factory = ImageFactory(recipe, bands)
    return forkJoin({
        image: factory.getImage$(),
        geometry: factory.getGeometry$()
    }).pipe(
        switchMap(({image, geometry}) =>
            exportImageToDrive$(taskId, {
                image,
                folder: `${description}_${moment().format('YYYY-MM-DD_HH:mm:ss.SSS')}`,
                ...retrieveOptions,
                description,
                region: geometry.bounds(scale),
                scale
            })
        )
    )
}
