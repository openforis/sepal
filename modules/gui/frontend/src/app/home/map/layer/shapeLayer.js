import Layer from './layer'

export default class ShapeLayer extends Layer {
    constructor({map}) {
        super({map})
        this.shape = null
    }

    createShape() {
        throw new Error('Subclass should implement createShape')
    }

    addToMap() {
        super.addToMap()
        this.shape = this.shape || this.createShape()
        const {map, shape} = this
        if (shape) {
            map.addShape(shape)
        }
    }

    removeFromMap() {
        super.removeFromMap()
        const {map, shape} = this
        if (shape) {
            map.removeShape(shape)
        }
    }

    hide(hidden) {
        hidden
            ? this.removeFromMap()
            : this.addToMap()
    }
}
