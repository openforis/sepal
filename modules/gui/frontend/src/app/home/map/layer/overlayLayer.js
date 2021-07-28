import Layer from './layer'

export default class OverlayLayer extends Layer {
    constructor({map, layerIndex = 0, progress$}) {
        super({map})
        this.layerIndex = layerIndex
        this.progress$ = progress$
        this.overlay = null
    }

    createOverlay() {
        throw new Error('Subclass should implement createOverlay')
    }

    addToMap() {
        this.overlay = this.overlay || this.createOverlay()
        const {map, layerIndex, overlay} = this
        if (overlay) {
            map.addOverlay(layerIndex, overlay)
        }
    }

    removeFromMap() {
        const {map, layerIndex, overlay} = this
        if (overlay) {
            map.removeOverlay(layerIndex)
        }
    }

    hide(hidden) {
        const {overlay} = this
        if (overlay) {
            overlay.setOpacity(hidden ? 0 : 1)
        }
    }
}
