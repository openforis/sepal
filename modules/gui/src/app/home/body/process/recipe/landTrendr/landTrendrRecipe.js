import moment from 'moment'

import api from '~/apiRegistry'
import {recipeActionBuilder} from '~/app/home/body/process/recipe'
import {defaultModel as defaultOpticalModel} from '~/app/home/body/process/recipe/opticalMosaic/opticalMosaicRecipe'
import {submitRetrieveRecipeTask as submitTask} from '~/app/home/body/process/recipe/recipeTaskSubmitter'

// yod/dur are whole years, not continuous values - averaging them at
// overview zoom levels (e.g. yod 2003 and 2004 -> 2003.5) is meaningless,
// so they need 'sample' pyramiding like changeAlerts/baytsAlerts use for
// their own discrete bands. The rest (mag/preval/postval/rmse/sig) are
// genuinely continuous and read better with 'mean'.
const SAMPLE_BANDS = ['yod', 'dur']
const pyramidingPolicy = bands => {
    const policy = {}
    bands.forEach(band => policy[band] = SAMPLE_BANDS.includes(band) ? 'sample' : 'mean')
    return policy
}

export const defaultModel = {
    dates: {
        startYear: 2000,
        endYear: moment().year() - 1
    },
    sources: {
        cloudPercentageThreshold: 75,
        dataSets: {
            LANDSAT: ['LANDSAT_9', 'LANDSAT_8', 'LANDSAT_7', 'LANDSAT_TM']
        },
        index: 'nbr'
    },
    options: {
        ...defaultOpticalModel.compositeOptions,
        corrections: ['SR'],
        // defaultOpticalModel.compositeOptions has no cloudBuffer (only the
        // unrelated cloudBuffering) - CCDC gets it for free by also
        // spreading defaultPlanetModel.options, which LandTrendr doesn't
        // need. Without it, compositeOptions.jsx's componentDidMount sees
        // cloudBuffer as undefined and calls .set(0) right after mount,
        // which marks the PRC form dirty (showing Cancel/Apply) even
        // though nothing was actually changed.
        cloudBuffer: 0
    },
    landTrendrOptions: {
        maxSegments: 6,
        spikeThreshold: 0.9,
        vertexCountOvershoot: 3,
        preventOneYearRecovery: false,
        recoveryThreshold: 0.25,
        pvalThreshold: 0.05,
        bestModelProportion: 0.75,
        minObservationsNeeded: 6,
        changeDirection: 'GREATEST',
        minMagnitude: 0
    }
}

export const RecipeActions = id => {
    const actionBuilder = recipeActionBuilder(id)
    return {
        setChartPixel(latLng) {
            return actionBuilder('SET_CHART_PIXEL', latLng)
                .set('ui.chartPixel', latLng)
                .build()
                .dispatch()
        },

        retrieve(retrieveOptions) {
            return actionBuilder('REQUEST_LANDTRENDR_RETRIEVAL', {retrieveOptions})
                .setAll({
                    'ui.retrieveState': 'SUBMITTED',
                    'ui.retrieveOptions': retrieveOptions
                })
                .sideEffect(recipe => submitRetrieveRecipeTask(recipe))
                .dispatch()
        }
    }
}

export const loadLandTrendrSegments$ = ({recipe, latLng}) =>
    api.gee.loadLandTrendrSegments$({recipe, latLng})

const submitRetrieveRecipeTask = recipe =>
    submitTask(recipe, {
        dataSetType: 'OPTICAL',
        pyramidingPolicy
    })
