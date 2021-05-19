import _ from 'lodash'

const unsignedDecimal = '(?:\\d*\\.)?\\d+'
const decimal = `[+-]?${unsignedDecimal}`
const coordinate = `(${decimal})\\s*([NSEW])?`
const spacer = '\\s*[\\s,]\\s*'
const coordinates = `${coordinate}${spacer}${coordinate}`
const regexp = new RegExp(`^${coordinates}(.*)$`)

const isUnsignedLatitudeCompatible = ({value, dir}) =>
    value >= 0 && value <= 90 && (dir === 'N' || dir === 'S')

const isSignedLatitudeCompatible = ({value, dir}) =>
    value >= -90 && value <= 90 && !dir

const isLatitudeCompatible = coord =>
    isUnsignedLatitudeCompatible(coord) || isSignedLatitudeCompatible(coord)

const isUnsignedLongitudeCompatible = ({value, dir}) =>
    value >= 0 && value <= 180 && (dir === 'E' || dir === 'W')

const isSignedLongitudeCompatible = ({value, dir}) =>
    value >= -180 && value <= 180 && !dir

const isLongitudeCompatible = coord =>
    isUnsignedLongitudeCompatible(coord) || isSignedLongitudeCompatible(coord)

const toLatitude = ({value, dir}) =>
    parseFloat(value) * (dir === 'S' ? -1 : 1)

const toLongitude = ({value, dir}) =>
    parseFloat(value) * (dir === 'W' ? -1 : 1)

export const parseCoordinates = string => {
    const parts = string.trim().toUpperCase().match(regexp)

    if (parts) {
        const coord1 = {
            value: parts[1],
            dir: parts[2]
        }
        const coord2 = {
            value: parts[3],
            dir: parts[4]
        }

        const results = []

        if (isLatitudeCompatible(coord1) && isLongitudeCompatible(coord2)) {
            results.push({
                lat: toLatitude(coord1),
                lng: toLongitude(coord2)
            })
        }

        if (isLatitudeCompatible(coord2) && isLongitudeCompatible(coord1)) {
            results.push({
                lat: toLatitude(coord2),
                lng: toLongitude(coord1)
            })
        }

        return results
    }

    return []
}

const formatValue = ({value, positive, negative}) => {
    switch(Math.sign(value)) {
    case 1:
        return `${value} ${positive}`
    case -1:
        return `${value} ${negative}`
    default:
        return '0'
    }
}

const formatLatitude = lat =>
    formatValue({value: lat, positive: 'N', negative: 'S'})

const formatLongitude = lng =>
    formatValue({value: lng, positive: 'E', negative: 'W'})

export const formatCoordinates = ({lat, lng}) =>
    `${formatLatitude(lat)}, ${formatLongitude(lng)}`
