import Color from 'color'
import _ from 'lodash'

export const normalize = visParams => {
    const normalized = {...visParams}

    const toArray = key => {
        const value = normalized[key]
        return _.isString(value)
            ? value.split(',').map(s => s.trim())
            : !_.isArray(value) && !_.isNil(value)
                ? [value]
                : value
    }

    const toNumbers = key => normalized[key]
        ? normalized[key].map(value => _.isString(value)
            ? parseFloat(value)
            : value
        )
        : null

    const toBooleans = key => normalized[key]
        ? normalized[key].map(value => _.isString(value)
            ? value === 'true'
            : !!value
        )
        : null

    const size = key => {
        const targetSize = normalized.bands.length
        const array = normalized[key]
        if (!array || targetSize === array.lenngth) {
            return normalized[key]
        }
        if (array.length < targetSize) {
            const last = array[array.length - 1]
            return _.concat(
                array,
                new Array(targetSize - array.length).fill(last)
            )
        } else {
            return array.slice(0, targetSize)
        }
    }

    if (['rgb', 'hsv'].includes(normalized.type) && _.isNil(normalized.gamma)) {
        normalized.gamma = 1
    }

    if (['rgb', 'hsv', 'continuous'].includes(normalized.type) && _.isNil(normalized.inverted)) {
        normalized.inverted = false
    }

    ['bands', 'min', 'max', 'palette', 'values', 'gamma', 'inverted']
        .map(key => normalized[key] = toArray(key));
    ['min', 'max', 'values', 'gamma']
        .map(key => normalized[key] = toNumbers(key));
    ['inverted']
        .map(key => normalized[key] = toBooleans(key));
    ['min', 'max', 'gamma', 'inverted']
        .map(key => normalized[key] = size(key))

    if (normalized.type === 'categorical') {
        normalized.min = [_.min(normalized.values)]
        normalized.max = [_.max(normalized.values)]
    }

    if (normalized.type === 'continuous' && !normalized.palette) {
        normalized.palette = ['#000000', '#FFFFFF']
    }

    if (['categorical', 'continuous'].includes(normalized.type)) {
        normalized.palette = normalized.palette.map(color => {
            try {
                return Color(color).hex()
            } catch (e) {
                if (/[0-9A-Fa-f]{6}/.test(color)) {
                    return Color(`#${color}`).hex()
                } else {
                    throw e
                }
            }
        }
        )
    }

    Object.keys(normalized).forEach(key => {
        if (_.isNil(normalized[key])) {
            delete normalized[key]
        }
    })
    return normalized
}
