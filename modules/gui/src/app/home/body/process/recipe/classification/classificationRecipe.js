import _ from 'lodash'

import {removeInputImage} from '~/app/home/body/process/inputImages'
import {removeImageLayerSource} from '~/app/home/body/process/mapLayout/imageLayerSources'
import {recipeActionBuilder, recipePath} from '~/app/home/body/process/recipe'
import {select} from '~/store'
import {msg} from '~/translate'
import {uuid} from '~/uuid'

export const getDefaultModel = () => ({
    trainingData: {
        dataSets: [
            {
                dataSetId: uuid(),
                name: msg('process.classification.panel.trainingData.type.COLLECTED.label'),
                type: 'COLLECTED',
                referenceData: []
            }
        ]
    },
    auxiliaryImagery: [],
    classifier: {
        type: 'RANDOM_FOREST',
        numberOfTrees: 25,
        variablesPerSplit: null,
        minLeafPopulation: 1,
        bagFraction: 0.5,
        maxNodes: null,
        seed: 1,

        shrinkage: 0.005,
        samplingRate: 0.7,
        loss: 'LeastAbsoluteDeviation',

        lambda: 0.000001,

        decisionProcedure: 'Voting',
        svmType: 'C_SVC',
        kernelType: 'LINEAR',
        shrinking: true,
        degree: 3,
        gamma: null,
        coef0: 0,
        cost: 1,
        nu: 0.5,

        metric: 'euclidean'
    }
})

export const RecipeActions = id => {
    const actionBuilder = recipeActionBuilder(id)

    const set = (name, prop, value, otherProps) =>
        actionBuilder(name, otherProps)
            .set(prop, value)
            .build()
    return {
        setEETableColumns(columns) {
            return set('SET_EE_TABLE_COLUMNS', 'ui.eeTable.columns', columns, {columns})
        },
        // An input is its entry, known by its imageId; another can share its source, and keeps the source's layer.
        removeInputImage(imageToRemove) {
            const images = select(recipePath(id, 'model.inputImagery.images')) || []
            const sourceShared = images.some(image => image.imageId !== imageToRemove.imageId && image.id === imageToRemove.id)
            if (!sourceShared) {
                removeImageLayerSource({sourceId: imageToRemove.id, recipeId: id})
            }
            removeInputImage(id, imageToRemove)
        },
        clearTrainingDataSet(dataSetToRemove) {
            actionBuilder('REMOVE_TRAINING_DATA_SET', {dataSetToRemove})
                .set(['model.trainingData.dataSets', {dataSetId: dataSetToRemove.dataSetId}, 'referenceData'], [])
                .del(['ui.trainingData.dataSets', {dataSetId: dataSetToRemove.dataSetId}, 'referenceData'], [])
                .dispatch()
        },
        removeTrainingDataSet(dataSetToRemove) {
            actionBuilder('REMOVE_TRAINING_DATA_SET', {dataSetToRemove})
                .del(['model.trainingData.dataSets', {dataSetId: dataSetToRemove.dataSetId}])
                .del(['ui.trainingData.dataSets', {dataSetId: dataSetToRemove.dataSetId}])
                .dispatch()
        },
        setSelectedPoint(point) {
            return set('SET_SELECTED_POINT', 'ui.collect.point', point, {point})
                .dispatch()
        },
        addSelectedPoint(point) {
            actionBuilder('ADD_SELECTED_POINT', {point})
                .push(['model.trainingData.dataSets', {type: 'COLLECTED'}, 'referenceData'], point)
                .del(['ui.collect.history', {x: point.x, y: point.y}])
                .push('ui.collect.history', point)
                .set('ui.collect.point', point)
                .dispatch()
        },
        updateSelectedPoint(point) {
            actionBuilder('UPDATE_SELECTED_POINT', {point})
                .assign([
                    'model.trainingData.dataSets',
                    point.dataSetId ? {dataSetId: point.dataSetId} : {type: 'COLLECTED'},
                    'referenceData',
                    {x: point.x, y: point.y}
                ], {x: point.x, y: point.y, 'class': point['class']})
                .set('ui.collect.lastValue', point['class'])
                .set('ui.collect.point', point)
                .dispatch()
        },
        removeSelectedPoint(point) {
            actionBuilder('REMOVE_SELECTED_POINT', {point})
                .del([
                    'model.trainingData.dataSets',
                    point.dataSetId ? {dataSetId: point.dataSetId} : {type: 'COLLECTED'},
                    'referenceData',
                    {x: point.x, y: point.y}
                ])
                .del(['ui.collect.history', {x: point.x, y: point.y}])
                .set('ui.collect.point', null)
                .dispatch()
        },
        pushToHistory(point) {
            actionBuilder('PUSH_TO_HISTORY', {point})
                .del(['ui.collect.history', {x: point.x, y: point.y}])
                .push('ui.collect.history', point)
                .dispatch()
        },
        setCollecting(collecting) {
            set('SET_COLLECTING_REFERENCE_DATA', 'ui.collect.collecting', collecting, {collecting})
                .dispatch()
        },
        setCountPerClass(countPerClass) {
            set('SET_COUNT_PER_CLASS', 'ui.collect.countPerClass', countPerClass, {countPerClass})
                .dispatch()
        },
        setNextPoints(nextPoints) {
            actionBuilder('SET_NEXT_POINTS', {nextPoints})
                .set('ui.collect.nextPoints', nextPoints)
                .set('ui.collect.lastValue', null)
                .dispatch()
        },
        nextPointSelected() {
            actionBuilder('NEXT_POINT_SELECTED')
                .del(['ui.collect.nextPoints', [0]])
                .set('ui.collect.lastValue', null)
                .dispatch()
        },
        unsetLastValue() {
            actionBuilder('UNSET_LAST_VALUE')
                .set('ui.collect.lastValue', null)
                .dispatch()
        }
    }
}

export const retrieveTask = {
    includeTimeRange: false
}

export const hasTrainingData = recipe => {
    const hasRecipeDataType = recipe.model.trainingData.dataSets.find(({type}) => type === 'RECIPE')
    if (hasRecipeDataType) {
        return true
    }
    if (recipe.ui.collect) {
        const countPerClass = recipe.ui.collect.countPerClass || {}
        return Object.values(countPerClass).filter(count => count > 0).length >= 2
    } else {
        return !!recipe.model.trainingData.dataSets.find(({referenceData = []}) => referenceData.length)
    }
}
