import {normalize} from 'app/home/map/visParams/visParams'
import _ from 'lodash'

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
    .value()

const parseLandcoverClass = (properties, bands) => {
    const visParams = _.chain(properties)
        .keys()
        .map(key => {
            const match = key.match(/^landcover_class_(.*)/)
            return match
                ? {key: match[1], value: properties[match[0]]}
                : null
        })
        .filter(match => match)
        .keyBy('key')
        .mapValues('value')
        .mapKeys((_value, key) => key === 'names' ? 'labels' : key)
        .set('type', 'categorical')
        .set('bands', bands[0])
        .value()
    return visParams.values
        ? [normalize(visParams)]
        : []
}

export const toVisualizations = (properties, bands) =>
    parseVisualization(properties).concat(parseLandcoverClass(properties, bands))

/*
    const extractLandcover = properties => {
    const getList = key => properties
        .select(
            image.propertyNames().map(name => ee.String(name).match(`^landcover_class_${key}`)).flatten()
        )
        .values()

    const valuesList = getList('values')
    const palette = getList('palette').flatten()
    const labels = getList('names').flatten()

    return valuesList.map(values => ({
        type: 'categorical',
        bands: image.bandNames().get(0), // No way to know which band is the categorical. Take first.
        labels,
        values,
        palette
    }))
}
*/
