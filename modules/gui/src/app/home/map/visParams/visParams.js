import Color from 'color'
import _ from 'lodash'

export const normalize = visParams => {
    const normalized = {...visParams}

    const decodeList = (key, list) => {
        return list && key === 'labels'
            ? list.map(v => _.isString(v)
                ? v.replace(/\\,/g, ',')
                : v
            )
            : list
    }

    const toArray = key => {
        const value = normalized[key]
        if (!value) {
            return []
        }
        const list = _.isString(value)
            ? value.match(/(\\.|[^,])+/g).map(s => s.trim())
            : !_.isArray(value) && !_.isNil(value)
                ? [value]
                : value
        return decodeList(key, list)
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

    ['bands', 'min', 'max', 'palette', 'labels', 'values', 'gamma', 'inverted']
        .map(key => normalized[key] = toArray(key))

    if (!normalized.type) {
        normalized.type = normalized.bands.length > 1
            ? 'rgb'
            : normalized.values
                ? 'categorical'
                : 'continuous'
    }

    if (['rgb', 'hsv'].includes(normalized.type) && _.isNil(normalized.gamma)) {
        normalized.gamma = [1]
    }

    if (['rgb', 'hsv', 'continuous'].includes(normalized.type) && _.isNil(normalized.inverted)) {
        normalized.inverted = [false]
    }

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
        })
    }

    if (visParams.gamma) {
        normalized.palette = undefined // Cannot have gamma and palette
    }
    if (normalized.palette) {
        normalized.gamma = undefined // Cannot have gamma and palette
    }

    Object.keys(normalized).forEach(key => {
        if (_.isNil(normalized[key])) {
            delete normalized[key]
        }
    })
    return normalized.bands.length ? normalized : null
}
