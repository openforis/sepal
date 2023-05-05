import {WMTSTileProvider} from './wmtsTileProvider'
import {combineLatest, filter, map} from 'rxjs'
import {toBandValues} from '../cursorValue'
import ee from '@google/earthengine'

const CONCURRENCY = 8
const TILE_SIZE = ee.layers.AbstractOverlay.DEFAULT_TILE_EDGE_LENGTH

export class EarthEngineTileProvider extends WMTSTileProvider {
    elements = {}
    offsets = {}

    constructor({urlTemplate, dataTypes, visParams, cursorValue$, boundsChanged$, dragging$, cursor$}) {
        super({
            type: 'EarthEngine',
            urlTemplate,
            concurrency: CONCURRENCY,
            tileSize: TILE_SIZE
        })
        this.dataTypes = dataTypes
        this.visParams = visParams
        this.cursorValue$ = cursorValue$
        this.subscriptions = [
            combineLatest(boundsChanged$, dragging$).pipe(
                map(([_, dragging]) => dragging),
                filter(dragging => !dragging)
            ).subscribe(
                () => this.calculateTileOffsets()
            ),
            cursor$.subscribe(
                cursor => this.cursorColor(cursor)
            )
        ]
    }

    calculateTileOffsets() {
        Object.values(this.elements).forEach(element => this.updateOffset(element))
    }

    createElement(id, doc) {
        const canvas = doc.createElement('canvas')
        canvas.setAttribute('id', id)
        canvas.setAttribute('width', TILE_SIZE)
        canvas.setAttribute('height', TILE_SIZE)
        return canvas
    }

    renderTile({doc, element, blob}) {
        const image = doc.createElement('img')
        image.setAttribute('src', (window.URL || window.webkitURL).createObjectURL(blob))
        image.onload = () => {
            this.elements[element.id] = element
            this.updateOffset(element)
            element.getContext('2d', {willReadFrequently: true}).drawImage(image, 0, 0, TILE_SIZE, TILE_SIZE, 0, 0, TILE_SIZE, TILE_SIZE)
        }
    }

    releaseTile(element) {
        delete this.elements[element.id]
        delete this.offsets[element.id]
    }

    updateOffset(element) {
        const rect = element.getBoundingClientRect()
        this.offsets[element.id] = {top: Math.floor(rect.top), left: Math.floor(rect.left)}
    }

    cursorColor(cursor) {
        if (cursor) {
            const {x, y} = cursor
            const id = Object.keys(this.offsets)
                .find(id => this.isInElement(id, x, y))
            if (id) {
                this.toColor(id, x, y)
            } else {
                this.cursorValue$.next([])
            }
        } else {
            this.cursorValue$.next([])
        }
    }

    toColor(id, x, y) {
        const element = this.elements[id]
        const {top, left} = this.offsets[id]
        const ctx = element.getContext('2d', {willReadFrequently: true})
        const {data} = ctx.getImageData(x - left, y - top, 1, 1)
        this.cursorValue$.next(this.getBandValues(data))
    }

    getBandValues([red, green, blue, alpha]) {
        if (alpha) {
            const bandValues = toBandValues([red, green, blue], this.visParams, this.dataTypes)
            if (bandValues.length) {
                return bandValues
            }
        }
        return []
    }

    isInElement(id, x, y) {
        const {top, left} = this.offsets[id]
        return x >= left && x < left + TILE_SIZE && y >= top && y < top + TILE_SIZE
    }

    close() {
        this.subscriptions.map(subscription => subscription.unsubscribe())
        this.elements = {}
        this.offsets = {}
    }
}
