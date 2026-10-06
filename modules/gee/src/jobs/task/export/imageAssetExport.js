import {forkJoin, switchMap} from 'rxjs'

import ImageFactory from '#sepal/ee/imageFactory'
import {withOutputBands} from '#sepal/ee/outputBands'
import {encodingOfBands} from '#sepal/recipe/output/bandEncoding'

import {formatProperties} from './formatProperties.js'
import {resolveImageOutput$, selectedBandEncoding} from './imageOutput.js'
import {startImageToAssetExport$} from './toAsset.js'
import {toVisualizationProperties} from './visualizations.js'

export const startImageAssetExport$ = ({image: {recipe, ...retrieveOptions}}) => {
    const description = recipe.title || recipe.placeholder
    return export$({description, recipe, ...retrieveOptions})
}

// The encoding is what this recipe establishes about the bands it names, never what the submitter claims or the
// exported image inherited. How it is stored, and that it is stored even when empty, belongs to the exporter.
const export$ = ({recipe, bands, visualizations, scale, properties, ...retrieveOptions}) => {
    const factory = ImageFactory(recipe, withOutputBands(bands))
    return forkJoin({
        image: factory.getImage$(),
        geometry: factory.getGeometry$(),
        imageOutput: resolveImageOutput$(recipe)
    }).pipe(
        switchMap(({image, geometry, imageOutput}) => {
            const encoding = encodingOfBands(selectedBandEncoding(imageOutput, bands.selection))
            const formattedProperties = formatProperties({...properties, scale})
            const visualizationProperties = toVisualizationProperties(visualizations, bands)
            return startImageToAssetExport$({
                ...retrieveOptions,
                image,
                region: geometry.bounds(scale),
                scale,
                bandEncoding: encoding,
                properties: {...formattedProperties, ...visualizationProperties}
            })
        })
    )
}
