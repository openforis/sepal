import {selectFrom} from '~/stateUtils'

// The legend and classifier of the Classification a recipe's Sources select - its type, and its configuration, which decides
// what it can output (supportProbability) - as what is offered of its outputs reads them: the record's own while the
// session holds it, so an edit to it is seen at once; otherwise as the operation the offer is for resolved it
// (`recordOf`, operationReadiness.js), while the runtime holds a current answer read from it; otherwise as copied when it
// was selected (`ui.classification`).
export const selectedClassificationOfState = (state, recipe, recordOf = () => null) => {
    const id = selectFrom(recipe, 'model.sources.classification')
    const record = id ? selectFrom(state, ['process.loadedRecipes', id]) || recordOf(id) : null
    return record
        ? {
            classificationLegend: selectFrom(record, 'model.legend') || null,
            classifierType: selectFrom(record, 'model.classifier.type') || null,
            classifier: selectFrom(record, 'model.classifier') || null
        }
        : {
            classificationLegend: selectFrom(recipe, 'ui.classification.classificationLegend'),
            classifierType: selectFrom(recipe, 'ui.classification.classifierType'),
            classifier: selectFrom(recipe, 'ui.classification.classifier')
        }
}
