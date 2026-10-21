import {forkJoin, map, of, switchMap} from 'rxjs'

import ImageFactory from '#sepal/ee/imageFactory'
import {withOutputBands} from '#sepal/ee/outputBands'
import {formatProperties} from '#sepal/formatProperties'
import {encodingOfBands} from '#sepal/recipe/output/bandEncoding'

import {judgesRequest, resolveImageOutput$, resolveRequestedImageOutput$, selectedBandEncoding} from './imageOutput.js'
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
const source$ = ({recipe, bands, visualizations, scale, properties, ...retrieveOptions}) =>
    built$(recipe, withOutputBands(bands)).pipe(
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

// A CCDC asked for measures its Classification computes trains that Classification for them, so it is built only once
// what its image output requires, and then what those measures add, is known to be met: judged with what it is built
// with (resolveRequestedImageOutput$). Any other recipe is built beside its check (imageOutput.js).
const built$ = (recipe, request) =>
    judgesRequest(recipe)
        ? resolveRequestedImageOutput$(recipe, request).pipe(
            switchMap(imageOutput => build$(recipe, request, of(imageOutput)))
        )
        : build$(recipe, request, resolveImageOutput$(recipe))

const build$ = (recipe, request, imageOutput$) => {
    const factory = ImageFactory(recipe, request)
    return forkJoin({
        image: factory.getImage$(),
        geometry: factory.getGeometry$(),
        imageOutput: imageOutput$
    })
}
