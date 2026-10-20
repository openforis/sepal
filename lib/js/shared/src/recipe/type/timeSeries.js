import {defineRecipeType} from '../defineRecipeType.js'
import {imageOutputProvider} from '../output/provider.js'
import {IMAGE_OUTPUT, PIXEL_OBSERVATIONS, REFERENCE} from '../output/readiness.js'
import {AOI, fromAoi} from '../source/aoi.js'
import {CLASSIFICATION_SOURCE, collectionClassifierRequirement, fromCollectionSources, SOURCE_IMAGERY} from '../source/collectionSources.js'

// A time series counts observations over its AOI from the collection the shared `sources` submodel describes
// (lib/js/ee/src/timeSeries/timeSeries.js, which builds it through timeSeries/collection.js).
//
// Its image is the count: per pixel, how many images of the filtered, masked collection hold a valid value in their
// first band. Whatever the sources, the schema is this one scalar band, averaged at coarser pyramid levels, with no
// encoding. The collection's own measures - what its chart plots and its SEPAL export downloads - are not bands of
// this image.
//
// Its GUI registration states it is no image source, which keeps a time series out of other recipes' source pickers;
// declaring its image does not make it an input.

export {CLASSIFICATION_SOURCE, SOURCE_IMAGERY}

export const TIME_SERIES_BANDS = [
    {name: 'count', dataType: {arrayDimensions: 0}, pyramidingPolicy: 'mean'}
]

export default defineRecipeType({
    type: 'TIME_SERIES',
    directSources: model => [
        ...fromAoi({model, keys: ['aoi']}),
        ...fromCollectionSources(model)
    ],
    // Its pixel chart observes the collection at the clicked point, which stands in for the AOI.
    executionNeeds: {
        [IMAGE_OUTPUT]: {[AOI]: REFERENCE, [CLASSIFICATION_SOURCE]: REFERENCE, [SOURCE_IMAGERY]: REFERENCE},
        [PIXEL_OBSERVATIONS]: {[CLASSIFICATION_SOURCE]: REFERENCE, [SOURCE_IMAGERY]: REFERENCE}
    },
    configurationRequirements: [collectionClassifierRequirement],
    imageOutput: imageOutputProvider({
        describe: () => ({bands: TIME_SERIES_BANDS, evidence: []})
    })
})
