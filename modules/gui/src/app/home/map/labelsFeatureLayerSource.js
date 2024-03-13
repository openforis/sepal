import {msg} from '~/translate'

export const createLabelsFeatureLayerSource = () => ({
    id: 'labels',
    type: 'Labels',
    description: msg('featureLayerSources.Labels.description')
})
