import _ from 'lodash'

import {normalize} from '~/app/home/map/visParams/visParams'

const parseVisualization = properties => _.chain(properties)
    .keys()
    .map(key => {
        const match = key.match(/^visualization_(\d+)_(.*)/)
        return match
            ? {i: match[1], key: match[2], value: properties[match[0]]}
            : null
    })
    .filter(match => match)
    .groupBy('i')
    .sortBy('i')
    .values()
    .map(props => {
        const visParams = {}
        props.forEach(({key, value}) => visParams[key] = value)
        return normalize(visParams)
    })
    .filter(visParams => visParams)
    .value()

const parseClassProperties = (properties, bands) =>
    bands
        .filter(band =>
            _.intersection(Object.keys(properties), [
                `${band}_class_names`,
                `${band}_class_palette`,
                `${band}_class_values`,
            ]
            ).length === 3)
        .map(band => normalize({
            type: 'categorical',
            bands: [band],
            labels: properties[`${band}_class_names`],
            values: properties[`${band}_class_values`],
            palette: properties[`${band}_class_palette`],
        }))
        .filter(visParams => visParams)

export const toVisualizations = (properties, bands) =>
    parseVisualization(properties).concat(parseClassProperties(properties, bands))

