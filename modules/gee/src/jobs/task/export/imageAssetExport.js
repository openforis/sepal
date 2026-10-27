import {forkJoin, map, of, switchMap} from 'rxjs'

import ImageFactory from '#sepal/ee/imageFactory'
import {withOutputBands} from '#sepal/ee/outputBands'
import {formatProperties} from '#sepal/formatProperties'
import {encodingOfBands} from '#sepal/recipe/output/bandEncoding'

import {resolveRequestedImageOutput$, selectedBandEncoding} from './imageOutput.js'
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
            const {processing: _processing, ...submittedProperties} = properties || {}
            const formattedProperties = formatProperties({...submittedProperties, scale})
            const visualizationProperties = toVisualizationProperties(visualizations, bands)
            return {
                ...retrieveOptions,
                image,
                region: geometry.bounds(scale),
                scale,
                bandEncoding: encoding,
                properties: {...formattedProperties, ...visualizationProperties,
                    ...(imageOutput.processing && {processing: JSON.stringify(imageOutput.processing),
                        ...(imageOutput.segmentDateFormat !== undefined && {dateFormat: imageOutput.segmentDateFormat})})}
            }
        })
    )

// Authorize every exported product before constructing it. CCDC's requested measures can add requirements beyond
// its canonical output; the existing resolver checks those after shared readiness too.
const built$ = (recipe, request) =>
    resolveRequestedImageOutput$(recipe, request).pipe(
        switchMap(imageOutput => build$(recipe, request, of(imageOutput)))
    )

const build$ = (recipe, request, imageOutput$) => {
    const factory = ImageFactory(recipe, request)
    return forkJoin({
        image: factory.getImage$(),
        geometry: factory.getGeometry$(),
        imageOutput: imageOutput$
    })
}
