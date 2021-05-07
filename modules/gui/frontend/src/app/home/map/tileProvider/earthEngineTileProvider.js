import {WMTSTileProvider} from './wmtsTileProvider'
import ee from '@google/earthengine'

const CONCURRENCY = 4

export class EarthEngineTileProvider extends WMTSTileProvider {
    constructor({urlTemplate}) {
        super({
            type: 'EarthEngine',
            urlTemplate,
            concurrency: CONCURRENCY,
            tileSize: ee.layers.AbstractOverlay.DEFAULT_TILE_EDGE_LENGTH
        })
    }

    // createElement(doc) {
    //     const canvas = doc.createElement('canvas')
    //     canvas.width = ee.layers.AbstractOverlay.DEFAULT_TILE_EDGE_LENGTH
    //     canvas.height = ee.layers.AbstractOverlay.DEFAULT_TILE_EDGE_LENGTH
    //     return canvas
    // }
    //
    // renderTile({doc, element, blob}) {
    //     const size = ee.layers.AbstractOverlay.DEFAULT_TILE_EDGE_LENGTH
    //     const image = doc.createElement('img')
    //     image.setAttribute('src', (window.URL || window.webkitURL).createObjectURL(blob))
    //     image.onload = () => {
    //         element.getContext('2d').drawImage(image, 0, 0, size, size)
    //         const toColor = ({offsetX, offsetY}) => {
    //             const data = element.getContext('2d').getImageData(offsetX, offsetY, 1, 1).data
    //             const [red, green, blue, alpha] = data
    //             if (alpha) {
    //                 console.log({red, green, blue})
    //             }
    //         }
    //         element.addEventListener('mousemove', toColor, false)
    //     }
    //
    //     image.src = URL.createObjectURL(blob)
    // }
}
