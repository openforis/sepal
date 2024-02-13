import {get$} from 'http-client'

const formatTileUrl = ({urlTemplate, x, y, zoom}) => {
    const width = Math.pow(2, zoom)
    x = x % width
    if (x < 0) {
        x += width
    }
    return urlTemplate
        .replace('{x}', x)
        .replace('{y}', y)
        .replace('{z}', zoom)
}

export default {
    loadTile$: ({urlTemplate, x, y, zoom}) =>
        get$(formatTileUrl({urlTemplate, x, y, zoom}), {
            maxRetries: 0,
            responseType: 'blob',
            crossDomain: true
        })
}
