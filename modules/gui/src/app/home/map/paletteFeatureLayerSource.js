import {msg} from '~/translate'

export const createPaletteFeatureLayerSource = () => ({
    id: 'palette',
    type: 'Palette',
    description: msg('featureLayerSources.Palette.description'),
    defaultEnabled: true
})
