import {msg} from '~/translate'

export const createGoogleSatelliteImageLayerSource = () => ({
    id: 'google-satellite',
    type: 'GoogleSatellite',
    sourceConfig: {
        description: msg('imageLayerSources.GoogleSatellite.description')
    }
})
