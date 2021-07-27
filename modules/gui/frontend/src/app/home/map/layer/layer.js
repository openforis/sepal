import {of} from 'rxjs'

export default class Layer {
    constructor({map, layerIndex = 0, progress$}) {
        this.map = map
        this.layerIndex = layerIndex
        this.progress$ = progress$
    }

    equals(_o) {
        throw new Error('Subclass needs to implement equals')
    }

    createTileProvider() {
        throw new Error('Subclass needs to implement createTileProvider')
    }

    addToMap() {
        throw new Error('Subclass needs to implement addToMap')
    }

    removeFromMap() {
        throw new Error('Subclass needs to implement removeFromMap')
    }

    hide(_hidden) {
        throw new Error('Subclass needs to implement hide')
    }

    initialize$() {
        return of(this)
    }
}
