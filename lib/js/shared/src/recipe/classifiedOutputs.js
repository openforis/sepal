import {CLASSIFIED_COLLECTION, CLASSIFIER, conditionalNeed, REFERENCE} from './output/readiness.js'
import {classificationBands} from './type/classification.js'

// What a recipe's Sources may ask of the Classification they select beyond its features (classifierInputs.js): the
// outputs it computes for each image of their collection, a regression or a class's probability
// (lib/js/ee/src/timeSeries/collection.js). Each is one only where the Classification declares it, by what its
// classifier's configuration supports (classificationBands) - read from its record, never from its image.

export const UNSUPPORTED_CLASSIFIED_OUTPUT = 'UNSUPPORTED_CLASSIFIED_OUTPUT'

// A band a collection's images carry only because their Classification computes it.
export const isClassifiedOutput = band =>
    typeof band === 'string' && (band === 'regression' || band.startsWith('probability_'))

// The classified outputs the Classification a record is about does not provide, of those asked for.
export const unprovidedClassifiedOutputs = (classification, bands) => {
    const provided = classification ? classificationBands(classification.model).map(({name}) => name) : []
    return bands.filter(isClassifiedOutput).filter(band => !provided.includes(band))
}

// A requirement of a recipe whose configuration chooses classified outputs at `field` of its Sources - a band, or a
// list of them - for the operations that build them: each must be one the Classification its Sources select
// (`role`) provides, refused at that field naming those it does not (`unsupported`). Choosing none requires nothing,
// and a Classification not yet held is waited for, never taken for one providing nothing.
export const classifiedOutputRequirement = ({field, role, operations}) => ({
    code: UNSUPPORTED_CLASSIFIED_OUTPUT,
    operations,
    findings: (model, {recordsOf}) => {
        const requested = classifiedOutputsAt(model, field)
        const records = requested.length ? recordsOf(role) : []
        if (!records) {
            return []
        }
        const unsupported = unprovidedClassifiedOutputs(records[0], requested)
        return unsupported.length ? [{path: ['model', 'sources', field], unsupported}] : []
    }
})

// What a recipe whose configuration chooses classified outputs at `field` of its Sources needs of the Classification they
// select, for the operations that build them: computing one trains that Classification's classifier and applies it to
// the collection's images (CLASSIFIER); choosing none reads nothing of it but what its classifier reads of them
// (REFERENCE).
export const classifiedOutputNeed = field => conditionalNeed({
    when: model => classifiedOutputsAt(model, field).length > 0,
    then: CLASSIFIER,
    otherwise: REFERENCE
})

// The stages a request runs beyond its own operation, by the bands that operation builds - `effective`, as the code
// building them derives them: observations build the bands requested, CCDC's segments those and its breakpoint bands
// (fittedMeasures, type/ccdc.js). Building one the collection's Classification computes classifies the collection
// (CLASSIFIED_COLLECTION). This is the one place a request's bands decide what it is judged as. The lists are constant,
// so what is watched for one can be told from another's by identity.
export const requestStages = effective => effective.some(isClassifiedOutput) ? CLASSIFYING : NO_STAGES

const NO_STAGES = Object.freeze([])
const CLASSIFYING = Object.freeze([CLASSIFIED_COLLECTION])

const classifiedOutputsAt = (model, field) => [].concat(model?.sources?.[field] ?? []).filter(isClassifiedOutput)
