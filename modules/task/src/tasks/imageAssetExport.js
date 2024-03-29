const ImageFactory = require('#sepal/ee/imageFactory')
const {forkJoin, switchMap} = require('rxjs')
const {exportImageToAsset$} = require('../jobs/export/toAsset')
const {toVisualizationProperties} = require('../ee/visualizations')
const {formatProperties} = require('./formatProperties')
const {setWorkloadTag} = require('./workloadTag')

module.exports = {
    submit$: (taskId, {
        image: {recipe, ...retrieveOptions}
    }) => {
        setWorkloadTag(recipe)
        const description = recipe.title || recipe.placeholder
        return export$(taskId, {description, recipe, ...retrieveOptions})
    }
}

const export$ = (taskId, {recipe, bands, visualizations, scale, properties, ...retrieveOptions}) => {
    const factory = ImageFactory(recipe, bands)
    return forkJoin({
        image: factory.getImage$(),
        geometry: factory.getGeometry$()
    }).pipe(
        switchMap(({image, geometry}) => {
            const formattedProperties = formatProperties({...properties, scale})
            const visualizationProperties = toVisualizationProperties(visualizations, bands)
            return exportImageToAsset$(taskId, {
                ...retrieveOptions,
                image,
                region: geometry.bounds(scale),
                scale,
                properties: {...formattedProperties, ...visualizationProperties}
            })
        }
        )
    )
}
