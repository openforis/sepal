import _ from 'lodash'

const UUID_MATCHER = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-5][0-9a-f]{3}-[089ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const UUID_DISPLAY_SIZE = 4
const ARG_DELIMITER = '.'

const isUuid = uuid =>
    UUID_MATCHER.test(uuid)

const toString = value =>
    _.isString(value)
        ? isUuid(value)
            ? value.substr(-UUID_DISPLAY_SIZE)
            : value
        : JSON.stringify(value)

const argsJoiner = (args, delimiter = ARG_DELIMITER) =>
    _.compact(args.map(arg => toString(arg))).join(delimiter)

const tag = (tag, args, delimiter) => `${tag}<${argsJoiner(args, delimiter)}>`

export const areaTag = (mapId, layerId) => tag('Area', [mapId, layerId])

export const mapTag = (mapId, layerId) => tag('Map', [mapId, layerId])

export const mapViewTag = ({center, zoom}) => tag('View', [center.lat.toFixed(4), center.lng.toFixed(4), zoom], '/')

export const tileTag = ({tileProviderId, tileId}) => tag('Tile', [tileProviderId, tileId])

export const tileProviderTag = tileProviderId => tag('TileProvider', [tileProviderId])
