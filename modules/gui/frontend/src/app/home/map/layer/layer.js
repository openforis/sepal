export default class Layer {
    constructor({map}) {
        this.map = map
    }

    equals(_o) {
        throw new Error('Subclass should implement equals')
    }

    addToMap() {
        throw new Error('Subclass should implement addToMap')
    }

    removeFromMap() {
        throw new Error('Subclass should implement removeFromMap')
    }

    // TODO: is this needed at all?
    hide(_hidden) {
        // no-op
    }
}
