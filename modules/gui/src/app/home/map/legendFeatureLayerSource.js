import {msg} from '~/translate'

export const createLegendFeatureLayerSource = () => ({
    id: 'legend',
    type: 'Legend',
    description: msg('featureLayerSources.Legend.description'),
    defaultEnabled: true
})
