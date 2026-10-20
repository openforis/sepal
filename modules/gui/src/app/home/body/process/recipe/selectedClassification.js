import {selectFrom} from '~/stateUtils'

// The legend and classifier of the Classification a recipe's Sources select, as what is offered of its outputs reads them:
// the record's own while the session holds it, so an edit to it is seen at once; otherwise as copied when it was
// selected (`ui.classification`).
export const selectedClassificationOfState = (state, recipe) => {
    const id = selectFrom(recipe, 'model.sources.classification')
    const record = id ? selectFrom(state, ['process.loadedRecipes', id]) : null
    return record
        ? {
            classificationLegend: selectFrom(record, 'model.legend') || null,
            classifierType: selectFrom(record, 'model.classifier.type') || null
        }
        : {
            classificationLegend: selectFrom(recipe, 'ui.classification.classificationLegend'),
            classifierType: selectFrom(recipe, 'ui.classification.classifierType')
        }
}
