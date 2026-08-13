import moment from 'moment'

import {recipeActionBuilder} from '~/app/home/body/process/recipe'
import {pyramidingPolicies, submitRetrieveRecipeTask as submitTask} from '~/app/home/body/process/recipe/recipeTaskSubmitter'

const DATE_FORMAT = 'YYYY-MM-DD'

export const defaultModel = {
    aoi: {},
    sources: {
        classification: undefined,
        dataSets: {},
        cloudPercentageThreshold: 75,
        changeFromClasses: [],
        changeToClasses: []
    },
    // Pre-process ("PRC") — pre-filled from the classification mosaic's compositeOptions.
    // Defaults mirror optical mosaic (opticalMosaicRecipe.js:32-51).
    options: {
        corrections: ['SR', 'BRDF'],
        brdfMultiplier: 4,
        filters: [],
        orbitOverlap: 'KEEP',
        tileOverlap: 'QUICK_REMOVE',
        includedCloudMasking: ['sepalCloudScore', 'landsatCFMask', 'sentinel2CloudScorePlus'],
        sentinel2CloudProbabilityMaxCloudProbability: 65,
        sentinel2CloudScorePlusBand: 'cs_cdf',
        sentinel2CloudScorePlusMaxCloudProbability: 45,
        landsatCFMaskCloudMasking: 'MODERATE',
        landsatCFMaskCloudShadowMasking: 'MODERATE',
        landsatCFMaskCirrusMasking: 'MODERATE',
        landsatCFMaskDilatedCloud: 'REMOVE',
        sepalCloudScoreMaxCloudProbability: 30,
        cloudBuffer: 0,
        holes: 'ALLOW',
        snowMasking: 'ON',
        compose: 'MEDOID'
    },
    dates: {
        baselineStart: moment().subtract(2, 'years').startOf('year').format(DATE_FORMAT),
        baselineEnd: moment().subtract(1, 'years').startOf('year').format(DATE_FORMAT),
        monitoringStart: moment().subtract(1, 'years').startOf('year').format(DATE_FORMAT),
        monitoringEnd: moment().format(DATE_FORMAT),
        derived: false
    },
    // Change-detection params (renamed from model.options).
    pyeoAlertsOptions: {
        minConsecutiveDetections: 2,
        indexGate: {index: 'ndvi', threshold: 0.2}
    }
}

export const RecipeActions = id => {
    const actionBuilder = recipeActionBuilder(id)

    return {
        setBands(bands) {
            return actionBuilder('SET_BANDS', {bands})
                .set('ui.bands.selection', bands)
                .dispatch()
        },
        setClassificationLegend(classificationLegend) {
            return actionBuilder('SET_CLASSIFICATION_LEGEND', {classificationLegend})
                .set('ui.classificationLegend', classificationLegend)
                .dispatch()
        },
        retrieve(retrieveOptions) {
            return actionBuilder('REQUEST_PYEO_ALERTS_RETRIEVAL', {retrieveOptions})
                .setAll({
                    'ui.retrieveState': 'SUBMITTED',
                    'ui.retrieveOptions': retrieveOptions
                })
                .sideEffect(recipe => submitRetrieveRecipeTask(recipe))
                .dispatch()
        }
    }
}

const submitRetrieveRecipeTask = recipe =>
    submitTask(recipe, {
        pyramidingPolicy: pyramidingPolicies.sample
    })
