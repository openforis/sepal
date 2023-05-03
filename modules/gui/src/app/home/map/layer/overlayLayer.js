import Layer from './layer'

export default class OverlayLayer extends Layer {
    constructor({map, layerIndex = 0, busy$}) {
        super({map})
        this.layerIndex = layerIndex
        this.busy$ = busy$
        this.overlay = null
    }

    createOverlay() {
        throw new Error('Subclass should implement createOverlay')
    }

    addToMap() {
        super.addToMap()
        this.overlay = this.overlay || this.createOverlay()
        const {map, layerIndex, overlay} = this
        const {googleMap} = map.getGoogle()
        if (overlay) {
            googleMap.overlayMapTypes.setAt(layerIndex, overlay)
        }
    }

    removeFromMap() {
        super.removeFromMap()
        const {map, layerIndex, overlay} = this
        const {googleMap} = map.getGoogle()
        if (overlay) {
            // googleMap.overlayMapTypes.removeAt(layerIndex)
            // [HACK] Prevent flashing of removed layers, which happens when just setting layer to null
            googleMap.overlayMapTypes.insertAt(layerIndex, null)
            googleMap.overlayMapTypes.removeAt(layerIndex + 1)
        }
    }
}
