import _ from 'lodash'

const decimal = '(?:\\d*\\.)?\\d+'
const sign = '[+-]?'
const coordinate = `(${sign})?(${decimal})\\s*([NSEW])?`
const spacer = '\\s*[\\s,]\\s*'
const coordinates = `${coordinate}${spacer}${coordinate}`
const regexp = new RegExp(`^${coordinates}$`)

const coordinateWrappers = [
    {
        regexp: /^ee\.Geometry\.Point\s*\(\s*(.*)\s*\)$/i,
        order: 'lng-lat'
    },
    {
        regexp: /^(?:new\s+)?(?:google\.maps\.(?:core\.)?)?LatLng\s*\(\s*(.*)\s*\)$/i,
        order: 'lat-lng'
    }
]

const unwrapPair = string => {
    const pairs = {
        '[': ']',
        '(': ')',
        '{': '}'
    }
    const closing = pairs[string[0]]
    return closing && string.endsWith(closing)
        ? string.slice(1, -1).trim()
        : string
}

const normalizeCoordinates = string => {
    const trimmed = string.trim()
    const wrapper = coordinateWrappers.find(({regexp}) => regexp.test(trimmed))
    const match = wrapper?.regexp.exec(trimmed)
    let normalized = match ? match[1].trim() : trimmed
    let unwrapped
    do {
        unwrapped = normalized
        normalized = unwrapPair(normalized)
    } while (normalized !== unwrapped)
    return {coordinates: normalized, order: wrapper?.order}
}

const isUnsignedLatitudeCompatible = ({sign, value, dir}) =>
    !sign && value >= 0 && value <= 90 && (dir === 'N' || dir === 'S')

const isSignedLatitudeCompatible = ({value, dir}) =>
    value >= -90 && value <= 90 && !dir

const isLatitudeCompatible = coord =>
    isUnsignedLatitudeCompatible(coord) || isSignedLatitudeCompatible(coord)

const isUnsignedLongitudeCompatible = ({sign, value, dir}) =>
    !sign && value >= 0 && value <= 180 && (dir === 'E' || dir === 'W')

const isSignedLongitudeCompatible = ({value, dir}) =>
    value >= -180 && value <= 180 && !dir

const isLongitudeCompatible = coord =>
    isUnsignedLongitudeCompatible(coord) || isSignedLongitudeCompatible(coord)

const toLatitude = ({sign, value, dir}) =>
    value === '0'
        ? 0
        : (sign === '-' ? -1 : 1) * value * (dir === 'S' ? -1 : 1)

const toLongitude = ({sign, value, dir}) =>
    value === '0'
        ? 0
        : (sign === '-' ? -1 : 1) * value * (dir === 'W' ? -1 : 1)

export const parseCoordinates = string => {
    const {coordinates, order} = normalizeCoordinates(string)
    const parts = coordinates.toUpperCase().match(regexp)

    if (parts) {
        const coord1 = {
            sign: parts[1],
            value: parts[2],
            dir: parts[3]
        }
        const coord2 = {
            sign: parts[4],
            value: parts[5],
            dir: parts[6]
        }

        const results = []

        if (order !== 'lng-lat' && isLatitudeCompatible(coord1) && isLongitudeCompatible(coord2)) {
            results.push({
                lat: toLatitude(coord1),
                lng: toLongitude(coord2)
            })
        }

        if (order !== 'lat-lng' && isLatitudeCompatible(coord2) && isLongitudeCompatible(coord1)) {
            results.push({
                lat: toLatitude(coord2),
                lng: toLongitude(coord1)
            })
        }

        return _.uniqBy(results, formatCoordinates)
    }

    return []
}

const formatValue = ({value, digits}) =>
    digits
        ? value.toFixed(digits)
        : value

const formatCoordinate = ({value, positive, negative, digits}) => {
    switch(Math.sign(value)) {
        case 1:
            return `${formatValue({value, digits})} ${positive}`
        case -1:
            return `${formatValue({value, digits})} ${negative}`
        default:
            return '0'
    }
}

const formatLatitude = (lat, digits) =>
    formatCoordinate({value: lat, positive: 'N', negative: 'S', digits})

const formatLongitude = (lng, digits) =>
    formatCoordinate({value: lng, positive: 'E', negative: 'W', digits})

const formatCoordinatePair = (lng, lat, digits) =>
    _.compact([
        _.isFinite(lat) ? formatLatitude(lat, digits) : null,
        _.isFinite(lng) ? formatLongitude(lng, digits) : null
    ]).join(', ')

const formatCoordinatesArray = ([lng, lat], digits) =>
    formatCoordinatePair(lng, lat, digits)
    
const formatCoordinatesObject = ({lat, lng}, digits) =>
    formatCoordinatePair(lng, lat, digits)

export const formatCoordinates = (coords, digits) =>
    _.isArray(coords)
        ? formatCoordinatesArray(coords, digits)
        : formatCoordinatesObject(coords, digits)
