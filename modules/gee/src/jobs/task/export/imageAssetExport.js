import {forkJoin, map, switchMap} from 'rxjs'

import ImageFactory from '#sepal/ee/imageFactory'
import {withOutputBands} from '#sepal/ee/outputBands'
import {formatProperties} from '#sepal/formatProperties'
import {encodingOfBands} from '#sepal/recipe/output/bandEncoding'

import {resolveImageOutput$, selectedBandEncoding} from './imageOutput.js'
import {startImageToAssetExport$} from './toAsset.js'
import {toVisualizationProperties} from './visualizations.js'

export const startImageAssetExport$ = params =>
    imageAssetSource$(params).pipe(
        switchMap(startImageToAssetExport$)
    )

export const imageAssetSource$ = ({image: {recipe, ...retrieveOptions}}) => {
    const description = recipe.title || recipe.placeholder
    return source$({description, recipe, ...retrieveOptions})
}

// The encoding is what this recipe establishes about the bands it names, never what the submitter claims or the
// exported image inherited. How it is stored, and that it is stored even when empty, belongs to the exporter.
const source$ = ({recipe, bands, visualizations, scale, properties, ...retrieveOptions}) => {
    const factory = ImageFactory(recipe, withOutputBands(bands))
    return forkJoin({
        image: factory.getImage$(),
        geometry: factory.getGeometry$(),
        imageOutput: resolveImageOutput$(recipe)
    }).pipe(
        map(({image, geometry, imageOutput}) => {
            const encoding = encodingOfBands(selectedBandEncoding(imageOutput, bands.selection))
            const formattedProperties = formatProperties({...properties, scale})
            const visualizationProperties = toVisualizationProperties(visualizations, bands)
            return {
                ...retrieveOptions,
                image,
                region: geometry.bounds(scale),
                scale,
                bandEncoding: encoding,
                properties: {...formattedProperties, ...visualizationProperties}
            }
        })
    )
}
