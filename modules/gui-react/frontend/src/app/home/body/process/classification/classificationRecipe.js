import globalActionBuilder from 'action-builder'
import backend from 'backend'
import {recipePath, RecipeState} from '../recipe'

export {recipePath, RecipeState}

export const RecipeActions = (id) => {

    const actionBuilder = (name, props) => {
        return globalActionBuilder(name, props)
            .within(recipePath(id))
    }
    const set = (name, prop, value, otherProps) =>
        actionBuilder(name, otherProps)
            .set(prop, value)
            .build()
    const setAll = (name, values, otherProps) =>
        actionBuilder(name, otherProps)
            .setAll(values)
            .build()

    return {
        setSource(sourceForm) {
            return setAll('SET_SOURCE', {
                'ui.source': {...sourceForm},
                'source': createSource(sourceForm),
            }, {sourceForm})
        },
        setFusionTableColumns(columns) {
            return set('SET_FUSION_TABLE_COLUMNS', 'ui.fusionTable.columns', columns, {columns})
        },
        setTrainingData(trainingDataForm) {
            return setAll('SET_TRAINING_DATA', {
                'ui.trainingData': {...trainingDataForm},
                'trainingData': createTrainingData(trainingDataForm),
            }, {trainingDataForm})
        },
        retrieve(retrieveOptions) {
            return actionBuilder('REQUEST_CLASSIFICATION_RETRIEVAL', {retrieveOptions})
                .setAll({
                    'ui.retrieveState': 'SUBMITTED',
                    'ui.retrieveOptions': retrieveOptions,
                })
                .sideEffect(recipe => backend.gee.retrieveClassification(recipe))
                .build()
        },
    }
}

const createSource = (sourceForm) => {
    switch (sourceForm.section) {
        case 'recipe':
            return {
                type: 'recipe',
                id: sourceForm.recipe
            }
        case 'asset':
            return {
                type: 'asset',
                id: sourceForm.asset
            }
        default:
            throw new Error('Invalid source section: ' + sourceForm.section)
    }
}

const createTrainingData = (trainingDataForm) => {
    return {
        type: 'fusionTable',
        id: trainingDataForm.fusionTable,
        classColumn: trainingDataForm.fusionTableColumn,
    }
}