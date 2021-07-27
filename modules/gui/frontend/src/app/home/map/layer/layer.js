import {of} from 'rxjs'

export default class Layer {
    equals(_o) {
        throw new Error('Subclass needs to implement equals')
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
