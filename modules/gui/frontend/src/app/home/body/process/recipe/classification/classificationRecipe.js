import {msg} from 'translate'
import {normalize} from 'app/home/map/visParams/visParams'
import {recipeActionBuilder} from '../../recipe'
import {removeImageLayerSource} from '../../mapLayout/imageLayerSources'
import {selectFrom} from 'stateUtils'
import _ from 'lodash'
import api from 'api'
import guid from 'guid'

export const getDefaultModel = () => ({
    trainingData: {
        dataSets: [
            {
                dataSetId: guid(),
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
        retrieve(retrieveOptions) {
            return actionBuilder('REQUEST_CLASSIFICATION_RETRIEVAL', {retrieveOptions})
                .setAll({
                    'ui.retrieveState': 'SUBMITTED',
                    'ui.retrieveOptions': retrieveOptions
                })
                .sideEffect(recipe => submitRetrieveRecipeTask(recipe))
                .dispatch()
        },
        setEETableColumns(columns) {
            return set('SET_EE_TABLE_COLUMNS', 'ui.eeTable.columns', columns, {columns})
        },
        removeInputImage(imageToRemove) {
            removeImageLayerSource({sourceId: imageToRemove.id, recipeId: id})
            actionBuilder('REMOVE_INPUT_IMAGE', {imageToRemove})
                .del(['model.inputImagery.images', {id: imageToRemove.id}])
                .del(['ui.inputImagery.images', {id: imageToRemove.id}])
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

export const getBandOptions = (legend, classifierType) =>
    [
        {
            value: 'class',
            label: msg('process.classification.bands.class')
        },
        supportRegression(classifierType) && {
            value: 'regression',
            label: msg('process.classification.bands.regression')
        },
        supportProbability(classifierType) && {
            value: 'class_probability',
            label: msg('process.classification.bands.classProbability')
        },
        ...legend.entries.map(({value, label}) => supportProbability(classifierType) && {
            value: `probability_${value}`,
            label: msg('process.classification.bands.probability', {class: label})
        })
    ].filter(option => option)

export const supportRegression = classifierType =>
    ['RANDOM_FOREST', 'GRADIENT_TREE_BOOST', 'CART'].includes(classifierType)

export const supportProbability = classifierType =>
    ['RANDOM_FOREST', 'GRADIENT_TREE_BOOST', 'CART', 'SVM', 'NAIVE_BAYES'].includes(classifierType)

const submitRetrieveRecipeTask = recipe => {
    const name = recipe.title || recipe.placeholder
    const bands = recipe.ui.retrieveOptions.bands
    const scale = recipe.ui.retrieveOptions.scale
    const destination = recipe.ui.retrieveOptions.destination
    const taskTitle = msg(['process.retrieve.form.task', destination], {name})
    const pyramidingPolicy = {}
    bands.forEach(band => pyramidingPolicy[band] = band === 'class' ? 'mode' : 'mean')
    const task = {
        'operation': `image.${destination === 'SEPAL' ? 'sepal_export' : 'asset_export'}`,
        'params':
            {
                title: taskTitle,
                description: name,
                image: {
                    recipe: _.omit(recipe, ['ui']),
                    bands: {selection: bands},
                    visualizations: getAllVisualizations(recipe),
                    scale,
                    pyramidingPolicy
                }
            }
    }
    return api.tasks.submit$(task).subscribe()
}

export const getAllVisualizations = recipe => [
    ...Object.values((selectFrom(recipe, ['layers.userDefinedVisualizations', 'this-recipe']) || {})),
    ...preSetVisualizationOptions(recipe).map(({visParams}) => visParams)
]

export const preSetVisualizationOptions = recipe => {
    const legend = selectFrom(recipe, 'model.legend') || {}
    const entries = _.sortBy(legend.entries, 'value')
    if (!entries.length) {
        return []
    }
    const classifierType = selectFrom(recipe, 'model.classifier.type')
    const min = entries[0].value
    const max = _.last(entries).value
    const probabilityPalette = ['#000000', '#480000', '#710101', '#BA0000', '#FF0000', '#FFA500', '#FFFF00',
        '#79C900', '#006400']
    return [
        {
            value: 'class',
            label: msg('process.classification.bands.class'),
            visParams: normalize({
                type: 'categorical',
                bands: ['class'],
                min,
                max,
                values: entries.map(({value}) => value),
                labels: entries.map(({label}) => label),
                palette: entries.map(({color}) => color),
            })
        },
        supportRegression(classifierType) && {
            value: 'regression',
            label: msg('process.classification.bands.regression'),
            visParams: normalize({
                type: 'continuous',
                bands: ['regression'],
                min,
                max,
                palette: entries.map(({color}) => color),
            })
        },
        supportProbability(classifierType) && {
            value: 'class_probability',
            label: msg('process.classification.bands.classProbability'),
            visParams: normalize({
                type: 'continuous',
                bands: ['class_probability'],
                min: 0,
                max: 100,
                palette: probabilityPalette
            })
        },
        ...legend.entries.map(({value, label}) => supportProbability(classifierType) && {
            value: `probability_${value}`,
            label: msg('process.classification.bands.probability', {class: label}),
            visParams: normalize({
                type: 'continuous',
                bands: [`probability_${value}`],
                min: 0,
                max: 100,
                palette: probabilityPalette
            })
        })
    ].filter(option => option)
}

export const hasTrainingData = recipe => {
    const countPerClass = (recipe.ui.collect && recipe.ui.collect.countPerClass) || {}
    const hasRecipeDataType = recipe.model.trainingData.dataSets.find(({type}) => type === 'RECIPE')
    return hasRecipeDataType || Object.values(countPerClass).filter(count => count > 0).length >= 2
}
