import {msg} from '~/translate'

export const createNicfiPlanetImageLayerSource = () => ({
    id: 'planet-nicfi',
    type: 'Planet',
    sourceConfig: {
        description: msg('imageLayerSources.Planet.nicfiDescription')
    }
})
