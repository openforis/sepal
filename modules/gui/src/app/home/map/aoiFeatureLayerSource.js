import {msg} from '~/translate'

export const createAoiFeatureLayerSource = () => ({
    id: 'aoi',
    type: 'Aoi',
    description: msg('featureLayerSources.Aoi.description')
})
