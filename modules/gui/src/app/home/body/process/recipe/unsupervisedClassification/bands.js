import {msg} from '~/translate'

import {getMaxNumberofClusters} from './unsupervisedClassificationRecipe'

export const bandPresentation = recipe => ({
    class: {
        dataType: {precision: 'int', min: 0, max: getMaxNumberofClusters(recipe) - 1},
        label: msg('process.unsupervisedClassification.bands.class')
    }
})
