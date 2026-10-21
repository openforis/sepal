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
        const requested = [].concat(model?.sources?.[field] ?? []).filter(isClassifiedOutput)
        const records = requested.length ? recordsOf(role) : []
        if (!records) {
            return []
        }
        const unsupported = unprovidedClassifiedOutputs(records[0], requested)
        return unsupported.length ? [{path: ['model', 'sources', field], unsupported}] : []
    }
})
