import {getAllVisualizations} from '../ccdc/ccdcRecipe'
import {getAvailableBands} from '../../../../../../sources'
import {msg} from 'translate'
import {recipeActionBuilder} from '../../recipe'
import _ from 'lodash'
import api from 'api'

export const defaultModel = {
    date: {
    },
    source: {},
    options: {
        harmonics: 3,
        gapStrategy: 'INTERPOLATE',
        extrapolateSegment: 'CLOSEST',
        extrapolateMaxDays: 30
    }
}

export const RecipeActions = id => {
    const actionBuilder = recipeActionBuilder(id)

    return {
        setBands(selection, baseBands) {
            return actionBuilder('SET_BANDS', {selection, baseBands})
                .set('ui.bands.selection', selection)
                .set('ui.bands.baseBands', baseBands)
                .dispatch()
        },
        setChartPixel(latLng) {
            return actionBuilder('SET_CHART_PIXEL', latLng)
                .set('ui.chartPixel', latLng)
                .dispatch()
        },
        retrieve(retrieveOptions) {
            return actionBuilder('REQUEST_CCDC_SLICE_RETRIEVAL', {retrieveOptions})
                .setAll({
                    'ui.retrieveState': 'SUBMITTED',
                    'ui.retrieveOptions': retrieveOptions
                })
                .sideEffect(recipe => submitRetrieveRecipeTask(recipe))
                .build()
        },
        updateRecipeSourceDetails(loadedRecipe, classification) {
            const corrections = loadedRecipe.model.options.corrections
            const bands = getAvailableBands({
                sources: loadedRecipe.model.sources.dataSets,
                corrections,
                timeScan: false,
                classification: classification
                    ? {
                        classifierType: classification.model.classifier.type,
                        classificationLegend: classification.model.legend,
                        include: ['regression', 'probabilities']
                    }
                    : {}
            })
            const source = {
                type: 'RECIPE_REF',
                bands,
                dateFormat: loadedRecipe.model.ccdcOptions.dateFormat,
                startDate: loadedRecipe.model.dates.startDate,
                endDate: loadedRecipe.model.dates.endDate,
                visualizations: getAllVisualizations(loadedRecipe)
            }
            return actionBuilder('UPDATE_SOURCE_RECIPE', {source})
                .set('ui.sourceDetails', source)
                .dispatch()
        },
        // removeSourceRecipe() {
        //     return actionBuilder('UPDATE_SOURCE_RECIPE', {source})
        //         .set('ui.sourceDetails', source)
        //         .dispatch()
        // }
    }
}

export const loadCCDCSegments$ = ({recipe, latLng, bands}) =>
    api.gee.loadCCDCSegments$({recipe: recipe.model.source, latLng, bands})

const submitRetrieveRecipeTask = recipe => {
    const name = recipe.title || recipe.placeholder
    const scale = recipe.ui.retrieveOptions.scale
    const destination = recipe.ui.retrieveOptions.destination
    const taskTitle = msg(['process.ccdcSlice.panel.retrieve.task', destination], {name})
    const {baseBands, bandTypes, segmentBands} = recipe.ui.retrieveOptions
    const bandTypeSuffixes = {
        VALUE: '',
        RMSE: '_rmse',
        MAGNITUDE: '_magnitude',
        INTERCEPT: '_intercept',
        SLOPE: '_slope',
        PHASE1: '_phase_1',
        PHASE2: '_phase_2',
        PHASE3: '_phase_3',
        AMPLITUDE1: '_amplitude_1',
        AMPLITUDE2: '_amplitude_2',
        AMPLITUDE3: '_amplitude_3',
    }
    const bands = [
        ...baseBands
            .map(baseBand => bandTypes.map(bandType => `${baseBand}${bandTypeSuffixes[bandType]}`))
            .flat(),
        ...segmentBands
    ]
    const task = {
        'operation': `image.${destination === 'SEPAL' ? 'sepal_export' : 'asset_export'}`,
        'params':
            {
                title: taskTitle,
                description: name,
                image: {recipe: _.omit(recipe, ['ui']), bands: {selection: bands, baseBands}, scale}
            }
    }
    return api.tasks.submit$(task).subscribe()
}
