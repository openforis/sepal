import {msg} from 'translate'
import {recipeActionBuilder} from '../../recipe'
import _ from 'lodash'
import api from 'api'
import guid from 'guid'

export const getDefaultModel = () => ({
    trainingData: {
        dataSets: [
            {
                dataSetId: guid(),
                name: msg('process.classification.panel.trainingData.type.COLLECTED.label'),
                type: "COLLECTED",
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
        seed: 0,

        lambda: 0.000001,

        decisionProcedure: 'Voting',
        svmType: 'C_SVC',
        kernelType: 'LINEAR',
        shrinking: true,
        degree: null,
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
                .build()
        },
        setEETableColumns(columns) {
            return set('SET_EE_TABLE_COLUMNS', 'ui.eeTable.columns', columns, {columns})
        },
        removeInputImage(imageToRemove) {
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
                .set('ui.collect.point', null)
                .dispatch()
        },
        setCollecting(collecting) {
            return set('SET_COLLECTING_REFERENCE_DATA', 'ui.collect.collecting', collecting, {collecting})
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


const supportRegression = classifierType =>
    ['RANDOM_FOREST', 'CART'].includes(classifierType)

const supportProbability = classifierType =>
    ['RANDOM_FOREST', 'CART'].includes(classifierType)

const submitRetrieveRecipeTask = recipe => {
    const name = recipe.title || recipe.placeholder
    const bands = recipe.ui.retrieveOptions.bands
    const scale = recipe.ui.retrieveOptions.scale
    const destination = recipe.ui.retrieveOptions.destination
    const taskTitle = msg(['process.classification.panel.retrieve.form.task', destination], {name})
    const pyramidingPolicy = {}
    bands.forEach(band => pyramidingPolicy[band] = band === 'class' ? 'mode' : 'mean')
    console.log('bands', bands, pyramidingPolicy)
    const task = {
        'operation': `image.${destination === 'SEPAL' ? 'sepal_export' : 'asset_export'}`,
        'params':
            {
                title: taskTitle,
                description: name,
                image: {
                    recipe: _.omit(recipe, ['ui']),
                    bands: {selection: bands},
                    scale,
                    pyramidingPolicy
                }
            }
    }
    return api.tasks.submit$(task).subscribe()
}