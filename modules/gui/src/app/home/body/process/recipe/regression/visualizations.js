import {normalize} from '~/app/home/map/visParams/visParams'

export const getPreSetVisualizations = () => {
    const palette = ['#000000', '#480000', '#710101', '#BA0000', '#FF0000', '#FFA500', '#FFFF00', '#79C900', '#006400']
    return [
        normalize({
            type: 'continuous',
            bands: ['regression'],
            min: 0,
            max: 100,
            palette: palette
        }),

    ]
}
