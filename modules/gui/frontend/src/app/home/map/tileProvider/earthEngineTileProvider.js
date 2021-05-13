import {Subject, combineLatest, concat, of, pipe} from 'rxjs'
import {WMTSTileProvider} from './wmtsTileProvider'
import {debounceTime, distinctUntilChanged, filter, finalize, last, map, switchMap, takeUntil, windowTime} from 'rxjs/operators'
import {toBandValues} from '../cursorValue'
import ee from '@google/earthengine'

const CONCURRENCY = 4
const TILE_SIZE = ee.layers.AbstractOverlay.DEFAULT_TILE_EDGE_LENGTH

export class EarthEngineTileProvider extends WMTSTileProvider {
    elements = {}
    offsets = {}

    constructor({urlTemplate, visParams, cursorValue$, boundsChanged$, dragging$, cursor$}) {
        super({
            type: 'EarthEngine',
            urlTemplate,
            concurrency: CONCURRENCY,
            tileSize: TILE_SIZE
        })
        this.visParams = visParams
        this.cursorValue$ = cursorValue$
        this.subscriptions = [
            combineLatest([boundsChanged$, dragging$]).pipe(
                map(([_, dragging]) => dragging),
                filter(dragging => !dragging)
            ).subscribe(
                () => this.calculateTileOffsets()
            ),
            cursor$.pipe(
                lastInWindow(100)
            ).subscribe(
                cursor => this.cursorColor(cursor)
            ),
        ]
    }

    calculateTileOffsets() {
        Object.values(this.elements).forEach(element => this.updateOffset(element))
    }

    createElement(id, doc) {
        const canvas = doc.createElement('canvas')
        canvas.id = id
        canvas.width = TILE_SIZE
        canvas.height = TILE_SIZE
        return canvas
    }

    renderTile({doc, element, blob}) {
        const image = doc.createElement('img')
        image.setAttribute('src', (window.URL || window.webkitURL).createObjectURL(blob))
        image.onload = () => {
            this.elements[element.id] = element
            this.updateOffset(element)
            element.getContext('2d').drawImage(image, 0, 0, TILE_SIZE, TILE_SIZE)
        }

        image.src = URL.createObjectURL(blob)
    }

    releaseTile(element) {
        delete this.elements[element.id]
        delete this.offsets[element.id]
    }

    updateOffset(element) {
        const rect = element.getBoundingClientRect()
        this.offsets[element.id] = {top: rect.top, left: rect.left}
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
        const offsetX = x - left
        const offsetY = y - top
        const data = element.getContext('2d').getImageData(offsetX, offsetY, 1, 1).data
        const [red, green, blue, alpha] = data
        if (alpha) {
            this.cursorValue$.next(toBandValues([red, green, blue], this.visParams))
        } else {
            this.cursorValue$.next([])
        }
    }

    isInElement(id, x, y) {
        const {top, left} = this.offsets[id]
        return x >= left && x <= left + TILE_SIZE && y >= top && y <= top + TILE_SIZE
    }

    close() {
        this.subscriptions.map(subscription => subscription.unsubscribe())
        this.elements = {}
        this.offsets = {}
    }
}

const EMPTY_WINDOW = Symbol('NO_MESSAGE_IN_WINDOW')
const lastInWindow = time => {
    const cancel$ = new Subject()
    return pipe(
        finalize(() => cancel$.next(true)),
        windowTime(time),
        switchMap(window$ => concat(of(EMPTY_WINDOW), window$).pipe(last())),
        filter(value => value !== EMPTY_WINDOW),
        takeUntil(cancel$)
    )
}
