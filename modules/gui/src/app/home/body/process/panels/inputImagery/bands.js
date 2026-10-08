import _ from 'lodash'

import {uuid} from '~/uuid'

export const bandsAvailableToAdd = (bands, includedBands) =>
    (Object.keys(bands || {}))
        .filter(band => !(includedBands || []).find(({band: b}) => band === b))

// A selected band a current read of its source found absent. Without such a read, or with one reporting no bands at
// all, none is.
export const isMissingBand = ({band}, bands) =>
    !!Object.keys(bands || {}).length && !bands[band]

export const defaultBand = (bandName, bands) => {
    const id = uuid()
    const values = bands[bandName].values
    const type = values && values.length ? 'categorical' : 'continuous'
    const legendEntries = type === 'categorical'
        ? defaultLegendEntries(bandName, bands)
        : []
    return {id, band: bandName, type, legendEntries}
}

export const defaultLegendEntries = (bandName, bands) => {
    const visualization = bands[bandName]
    return ((visualization && visualization.values) || [])
        .map((value, i) => ({
            id: uuid(),
            color: (visualization.palette && visualization.palette[i]) || '#000000',
            value,
            label: (visualization.labels && visualization.labels[i]) || `${value}`
        }))
}
