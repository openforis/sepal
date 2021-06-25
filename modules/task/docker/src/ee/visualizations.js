const _ = require('lodash')

const toVisualizationProperties = (visualizations = [], bands) => {
    const filteredVisualizations = visualizations
        .map(visParams => Object.keys(visParams).includes('name')
            ? visParams
            : {...visParams, name: visParams.bands.join(', ')}
        )
        .filter(visParams => visParams.bands.every(band => bands.selection.includes(band)))

    const uniqueVisualizations = _.uniqBy(filteredVisualizations, 'name')
    const result = {}
    uniqueVisualizations.forEach((visParams, i) => {
        Object.keys(visParams).forEach(key => {
            const value = visParams[key]
            result[`visualization_${i}_${key}`] = _.isArray(value)
                ? value.map(encode).join(',')
                : encode(value)
        })
    })
    return result
}

const encode = value =>
    _.isString(value)
        ? value.replace(/,/g, '\\,')
        : value

module.exports = {toVisualizationProperties}
