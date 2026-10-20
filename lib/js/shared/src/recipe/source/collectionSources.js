import {
    classifiedImageFeatures,
    classifierFeatures,
    opticalAlternatives,
    RADAR_ALTERNATIVE,
    UNSUPPLIED_CLASSIFIER_INPUTS,
    unsuppliedClassifierFeatures
} from '../classifierInputs.js'
import {collectionType, PLANET} from '../collectionType.js'
import {IMAGE_OUTPUT, PIXEL_OBSERVATIONS} from '../output/readiness.js'
import {fromId, fromList, idResults} from './extract.js'
import {assetReference, recipeReference} from './reference.js'

// The `sources` submodel shared by every recipe that builds its collection through
// lib/js/ee/src/timeSeries/collection.js - CCDC, Time Series, Phenology and Change Alerts, the last of which
// receives a copy of a CCDC recipe's whole submodel when its reference is selected.
//
// Two halves, because not every consumer has both. A Planet mosaic merges the same asset list without ever
// classifying, so it takes the assets alone.
//
// The roles live here rather than in each definition for the same reason the AOI's does: they name positions
// in one shared persisted shape, so four copies of the same string would be four places to drift.

export const CLASSIFICATION_SOURCE = 'CLASSIFICATION_SOURCE'
export const SOURCE_IMAGERY = 'SOURCE_IMAGERY'

// A bare recipe id, and optional: an absent one is a collection nobody chose to classify.
export const fromClassificationSource = model =>
    fromId({
        model,
        keys: ['sources', 'classification'],
        toReference: recipeReference,
        role: CLASSIFICATION_SOURCE
    })

// Bare ids of the ImageCollections planet/collection.js merges, in model order - the order is part of the
// request. An entry that exists without an id is a broken selection rather than an unmade one.
export const fromSourceAssets = model =>
    fromList({
        model,
        keys: ['sources', 'assets'],
        role: SOURCE_IMAGERY,
        itemResults: (id, path) => idResults({
            id,
            toReference: assetReference,
            role: SOURCE_IMAGERY,
            path,
            required: true
        })
    })

// The asset list is only read on the Planet branch (lib/js/ee/src/timeSeries/collection.js chooses radar,
// then optical, then Planet, and only planetImages touches it). The sources panel does not clear `assets`
// when the data set type changes, so an optical or radar model routinely carries a list left behind by an
// earlier Planet selection. Emitting it would pin a source the recipe cannot read.
//
// The classification is not conditional: collection.js resolves it BEFORE choosing a branch, so it is a
// dependency of every source type.
// A recipe that classifies its collection's images with the Classification its Sources select needs them to carry
// what the classifier reads (classifierInputs.js): refused at the data sets where an optical or radar collection
// would, otherwise at the classification. Selecting none requires nothing. For CCDC, Time Series and Phenology;
// Change Alerts inherits these settings rather than choosing them. The collection a pixel chart observes is the same
// one, classified the same way, so its observations are held to it too.
export const collectionClassifierRequirement = {
    code: UNSUPPLIED_CLASSIFIER_INPUTS,
    operations: [IMAGE_OUTPUT, PIXEL_OBSERVATIONS],
    findings: (model, {recordsOf}) => {
        const unsupplied = unsuppliedClassifierFeatures({
            required: classifierFeatures(recordsOf(CLASSIFICATION_SOURCE)),
            supplied: classifiedImageFeatures(model),
            alternatives: [...opticalAlternatives(model.options), RADAR_ALTERNATIVE]
        })
        return unsupplied
            ? [{path: ['model', 'sources', unsupplied.alternative ? 'dataSets' : 'classification'], missing: unsupplied.missing}]
            : []
    }
}

export const fromCollectionSources = model => [
    ...fromClassificationSource(model),
    ...(collectionType(model?.sources?.dataSets) === PLANET ? fromSourceAssets(model) : [])
]
