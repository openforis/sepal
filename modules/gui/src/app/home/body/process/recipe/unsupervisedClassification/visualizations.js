// import {normalize} from '~/app/home/map/visParams/visParams'

import {colorBrewerOptions, pickColors} from 'app/home/map/visParams/palettePreSets'
import {normalize} from 'app/home/map/visParams/visParams'
import {sequence} from 'array'

import {getMaxNumberofClusters} from './unsupervisedClassificationRecipe'

export const getPreSetVisualizations = recipe => {
    const maxNumberOfClusters = getMaxNumberofClusters(recipe)
    const options = colorBrewerOptions(maxNumberOfClusters)[0].options
    const colors = options.find(({label}) => label === 'Paired').value
    const palette = pickColors(maxNumberOfClusters, colors)
    const values = sequence(0, maxNumberOfClusters - 1)
    return [
        normalize({
            type: 'categorical',
            bands: ['class'],
            min: 0,
            max: maxNumberOfClusters - 1,
            values,
            labels: values,
            palette: palette
        }),
    ]
}
