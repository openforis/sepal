import moment from 'moment'

import {recipeActionBuilder} from '~/app/home/body/process/recipe'
import {submitRetrieveRecipeTask as submitTask} from '~/app/home/body/process/recipe/recipeTaskSubmitter'

const DATE_FORMAT = 'YYYY-MM-DD'

export const defaultModel = {
    dates: {
        fromDate: moment().startOf('year').format(DATE_FORMAT),
        toDate: moment().add(1, 'years').startOf('year').format(DATE_FORMAT)
    },
    options: {
        orbits: ['ASCENDING', 'DESCENDING'],
        orbitNumbers: 'ALL',
        geometricCorrection: 'TERRAIN',
        spatialSpeckleFilter: 'LEE_SIGMA',
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
        minObservations: 1,
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
            return actionBuilder('REQUEST_RADAR_MOSAIC_RETRIEVAL', {retrieveOptions})
                .setAll({
                    'ui.retrieveState': 'SUBMITTED',
                    'ui.retrieveOptions': retrieveOptions,
                })
                .sideEffect(recipe => submitRetrieveRecipeTask(recipe))
                .dispatch()
        },
    }
}

const submitRetrieveRecipeTask = recipe =>
    submitTask(recipe, {
        dataSetType: 'RADAR'
    })
