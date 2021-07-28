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
        this.shape = this.shape || this.createShape()
        const {map, shape} = this
        const {googleMap} = map.getGoogle()
        shape.setMap(googleMap)
    }

    removeFromMap() {
        const {shape} = this
        shape.setMap(null)
    }

    hide(hidden) {
        hidden
            ? this.removeFromMap()
            : this.addToMap()
    }
}
