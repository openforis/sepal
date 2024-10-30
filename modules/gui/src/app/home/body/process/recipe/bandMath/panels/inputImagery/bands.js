import _ from 'lodash'

import {uuid} from '~/uuid'

export const bandsAvailableToAdd = (bands, includedBands) =>
    (Object.keys(bands || {}))
        .filter(name =>
            !(includedBands || [])
                .find(({name: n}) => name === n)
        )

export const defaultBand = (name, bands) => {
    const id = uuid()
    const values = bands[name].values
    const type = values && values.length ? 'categorical' : 'continuous'
    const legendEntries = type === 'categorical'
        ? defaultLegendEntries(name, bands)
        : []
    return {id, name, type, legendEntries}
}

export const defaultLegendEntries = (name, bands) => {
    const visualization = bands[name]
    return ((visualization && visualization.values) || [])
        .map((value, i) => ({
            id: uuid(),
            color: (visualization.palette && visualization.palette[i]) || '#000000',
            value,
            label: (visualization.labels && visualization.labels[i]) || `${value}`
        }))
}
