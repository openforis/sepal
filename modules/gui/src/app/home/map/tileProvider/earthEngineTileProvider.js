import {WMTSTileProvider} from './wmtsTileProvider'
import {combineLatest, filter, map} from 'rxjs'
import {handleError$} from './earthEngineError'
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

    getElementContext(element) {
        const ctx = element.getContext('2d', {willReadFrequently: true})
        ctx.imageSmoothingEnabled = false
        return ctx
    }

    calculateTileOffsets() {
        Object.values(this.elements).forEach(element => this.updateOffset(element))
    }

    createElement(id, doc) {
        const element = doc.createElement('canvas')
        element.setAttribute('id', id)
        element.setAttribute('width', TILE_SIZE)
        element.setAttribute('height', TILE_SIZE)
        return element
    }

    renderTile({element, blob}) {
        const image = new Image()
        image.setAttribute('src', (window.URL || window.webkitURL).createObjectURL(blob))
        image.onload = () => {
            this.elements[element.id] = element
            this.updateOffset(element)
            this.getElementContext(element).drawImage(image, 0, 0, TILE_SIZE, TILE_SIZE, 0, 0, TILE_SIZE, TILE_SIZE)
        }
    }

    handleError$(error, retryError) {
        return handleError$(error, retryError)
    }

    renderErrorTile({element, _error}) {
        const ctx = this.getElementContext(element)
        ctx.fillStyle = 'red'
        ctx.globalAlpha = .3
        const C = 6
        const STEP = TILE_SIZE / C
        for (let x = 0; x < C; x++) {
            for (let y = 0; y < C; y++) {
                if ((x + y) % 2 == 0) {
                    ctx.fillRect(x * STEP, y * STEP, STEP, STEP)
                }
            }
        }
    }

    releaseTile(element) {
        delete this.elements[element.id]
        delete this.offsets[element.id]
    }

    updateOffset(element) {
        const {top, left} = element.getBoundingClientRect()
        this.offsets[element.id] = {top: Math.floor(top), left: Math.floor(left)}
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
        const {data} = this.getElementContext(element).getImageData(x - left, y - top, 1, 1)
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
