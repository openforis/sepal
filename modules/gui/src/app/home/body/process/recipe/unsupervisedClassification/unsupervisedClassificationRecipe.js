import _ from 'lodash'

import {selectFrom} from '~/stateUtils'

export const getDefaultModel = () => ({
    sampling: {
        numberOfSamples: 1e4,
        sampleScale: 10,
    },
    auxiliaryImagery: [],
    clusterer: {
        type: 'KMEANS',
        numberOfClusters: 5
    }
})

export const getMaxNumberofClusters = recipe => {
    const {type, numberOfClusters, maxNumberOfClusters} = selectFrom(recipe, 'model.clusterer')
    return ['KMEANS', 'LVQ'].includes(type)
        ? numberOfClusters
        : maxNumberOfClusters
}

export const retrieveTask = {
    includeTimeRange: false
}
