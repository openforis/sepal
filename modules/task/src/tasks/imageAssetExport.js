import ImageFactory from '#sepal/ee/imageFactory'
import {forkJoin, switchMap} from 'rxjs'
import {exportImageToAsset$} from '../jobs/export/toAsset.js'
import {toVisualizationProperties} from '../ee/visualizations.js'
import {formatProperties} from './formatProperties.js'
import {setWorkloadTag} from './workloadTag.js'

export const submit$ = (taskId, {
        image: {recipe, ...retrieveOptions}
    }) => {
        setWorkloadTag(recipe)
        const description = recipe.title || recipe.placeholder
        return export$(taskId, {description, recipe, ...retrieveOptions})
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
