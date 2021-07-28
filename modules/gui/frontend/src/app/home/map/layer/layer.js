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

    addToMap() {
        throw new Error('Subclass needs to implement addToMap')
    }

    removeFromMap() {
        throw new Error('Subclass needs to implement removeFromMap')
    }

    // TODO: is this needed at all?
    hide(_hidden) {
        // no-op
    }

    initialize$() {
        return of(this)
    }
}
