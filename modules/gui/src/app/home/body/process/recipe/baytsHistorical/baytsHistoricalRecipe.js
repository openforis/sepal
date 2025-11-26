import moment from 'moment'

import {recipeActionBuilder} from '~/app/home/body/process/recipe'
import {submitRetrieveRecipeTask as submitTask} from '~/app/home/body/process/recipe/recipeTaskSubmitter'

import {getAvailableBands} from './bands'

const DATE_FORMAT = 'YYYY-MM-DD'

export const defaultModel = {
    dates: {
        fromDate: moment().subtract(1, 'year').format(DATE_FORMAT),
        toDate: moment().format(DATE_FORMAT)
    },
    options: {
        orbits: ['ASCENDING', 'DESCENDING'],
        orbitNumbers: 'DOMINANT',
        geometricCorrection: 'ELLIPSOID',
        spatialSpeckleFilter: 'LEE',
        kernelSize: 9,
        sigma: 0.9,
        strongScatterers: 'RETAIN',
        strongScattererValues: [0, -5],
        snicSize: 5,
        snicCompactness: 0.15,
        multitemporalSpeckleFilter: 'NONE',
        numberOfImages: 10,
        outlierRemoval: 'MODERATE',
        mask: ['SIDES', 'FIRST_LAST'],
        minAngle: 30.88,
        maxAngle: 45.35,
        minObservations: 20,
    }
}

export const RecipeActions = id => {
    const actionBuilder = recipeActionBuilder(id)

    const setAll = (name, values, otherProps) =>
        actionBuilder(name, otherProps)
            .setAll(values)
            .build()

    return {
        setBands(bands) {
            return setAll('SET_BANDS', {
                'ui.bands.selection': bands
            }, {bands})
        },
        retrieve(retrieveOptions) {
            return actionBuilder('REQUEST_BAYTS_HISTORICAL_RETRIEVAL', {retrieveOptions})
                .setAll({
                    'ui.retrieveState': 'SUBMITTED',
                    'ui.retrieveOptions': retrieveOptions,
                })
                .sideEffect(recipe => submitRetrieveRecipeTask(recipe))
                .dispatch()
        },
    }
}

const submitRetrieveRecipeTask = recipe => {
    const bands = Object.keys(getAvailableBands(recipe))
    return submitTask(recipe, {
        dataSetType: 'RADAR',
        customizeImage: image => ({...image, bands: {selection: bands}})
    })
}
