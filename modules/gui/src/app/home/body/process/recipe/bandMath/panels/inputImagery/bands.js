import _ from 'lodash'

import {uuid} from '~/uuid'

export const bandsAvailableToAdd = (bands, includedBands) =>
    (Object.keys(bands || {}))
        .filter(name =>
            !(includedBands || [])
                .find(({name: n}) => name === n)
        )

// A selected band a current read of its source found absent. Without such a read, or with one reporting no bands at
// all, none is.
export const isMissingBand = ({name}, bands) =>
    !!Object.keys(bands || {}).length && !bands[name]

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
