import _ from 'lodash'

import {normalize} from '~/app/home/map/visParams/visParams'

// Reversing the encoding the Task writer applies when it puts a visualization into asset properties: array
// fields are comma-joined, and a comma inside any string value is escaped as `\,`.
//
// `normalize` already undoes most of it - it splits the fields it knows are lists, and unescapes `labels`. Two
// gaps are left, and they are closed here rather than there because only this boundary knows the values came out
// of an asset property at all: `baseBands` is not one of normalize's list fields, so it would stay a string, and
// a scalar `name` is never unescaped, so a generated one would keep its backslashes.
const unescapeCommas = value =>
    _.isString(value)
        ? value.replace(/\\,/g, ',')
        : value

const toList = value =>
    _.isString(value)
        ? (value.match(/(\\.|[^,])+/g) || []).map(item => unescapeCommas(item.trim()))
        : value

const DECODE = {
    baseBands: toList,
    name: unescapeCommas
}

const decode = (key, value) => (DECODE[key] || _.identity)(value)

// Asset visualizations are independent metadata entries. Normalize each in isolation so one malformed entry
// cannot suppress valid siblings; parsing and grouping errors outside normalization still surface.
const tryNormalize = visParams => {
    try {
        return normalize(visParams)
    } catch (_error) {
        return null
    }
}

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
        props.forEach(({key, value}) => visParams[key] = decode(key, value))
        return tryNormalize(visParams)
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
        .map(band => tryNormalize({
            type: 'categorical',
            bands: [band],
            labels: properties[`${band}_class_names`],
            values: properties[`${band}_class_values`],
            palette: properties[`${band}_class_palette`],
        }))
        .filter(visParams => visParams)

export const toVisualizations = (properties, bands) =>
    parseVisualization(properties).concat(parseClassProperties(properties, bands))

