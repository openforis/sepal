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
        const {googleMap} = map.getGoogle()
        if (shape) {
            shape.setMap(googleMap)
        }
    }

    removeFromMap() {
        super.removeFromMap()
        const {shape} = this
        if (shape) {
            shape.setMap(null)
        }
    }

    hide(hidden) {
        hidden
            ? this.removeFromMap()
            : this.addToMap()
    }
}
