import {Layer} from './layer'

// Sole owner of placement in googleMap.overlayMapTypes. Both families that live in that array - tile layers
// and the Google labels style - go through here, because the array is shared mutable state addressed by
// position while React independently reorders the layers occupying it.
export class OverlayMapTypeLayer extends Layer {
    // Overlays mount asynchronously (a tile layer waits for its map id), so an index requested before the
    // overlay exists has to survive until it mounts.
    setLayerIndex = layerIndex => {
        this.layerIndex = layerIndex
        const {overlay} = this
        if (overlay) {
            const overlayMapTypes = this.overlayMapTypes()
            const currentIndex = overlayMapTypes.getArray().indexOf(overlay)
            if (currentIndex !== layerIndex) {
                // Swap rather than overwrite, so the layer displaced from the target slot survives at the
                // slot this one vacates. An overlay currently absent from the array (displaced by a sibling
                // earlier in the same update sequence) still claims its slot: that is how it re-enters the
                // stack, and whatever it displaces in turn re-enters on its own update.
                const displacedOverlay = overlayMapTypes.getAt(layerIndex)
                if (currentIndex !== -1) {
                    overlayMapTypes.setAt(currentIndex, displacedOverlay ?? null)
                }
                overlayMapTypes.setAt(layerIndex, overlay)
            }
        }
    }

    mountOverlay = overlay => {
        this.overlay = overlay
        this.overlayMapTypes().setAt(this.layerIndex, overlay)
    }

    removeFromMap = () => {
        const {overlay} = this
        if (overlay) {
            // Locate by identity: the recorded index goes stale as soon as a sibling moves.
            const overlayMapTypes = this.overlayMapTypes()
            const overlayIndex = overlayMapTypes.getArray().indexOf(overlay)
            if (overlayIndex !== -1) {
                // Prevent flashing of removed layers, which happens when just setting the overlay to null.
                overlayMapTypes.insertAt(overlayIndex, null)
                overlayMapTypes.removeAt(overlayIndex + 1)
            }
            this.closeOverlay(overlay)
        }
    }

    // Detaching is shared; disposing is not. Only overlays that own a tile provider have anything to close.
    closeOverlay = () => undefined

    overlayMapTypes = () =>
        this.map.getGoogle().googleMap.overlayMapTypes
}
