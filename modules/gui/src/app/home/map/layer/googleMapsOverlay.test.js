import {GoogleMapsOverlay} from './googleMapsOverlay'

const google = {maps: {core: {Size: class {
    constructor(width, height) {
        this.width = width
        this.height = height
    }
}}}}

const makeOverlay = (opacity = 1) => {
    const tileProvider = {
        id: 'tp',
        tileSize: 256,
        createElement: id => ({id, style: {}}),
        loadTile$: () => ({subscribe: () => ({unsubscribe: () => {}})}),
        renderTile: () => {},
        renderErrorTile: () => {},
        releaseTile: () => {},
        close: () => {}
    }
    return new GoogleMapsOverlay({tileProvider, google, name: 'test', opacity})
}

// zoom 1 -> maxCoord 2, so (0,0) is in bounds.
const getTile = overlay => overlay.getTile({x: 0, y: 0}, 1, document)

describe('GoogleMapsOverlay opacity', () => {
    it('applies the initial opacity to a newly created tile element', () => {
        const element = getTile(makeOverlay(0.5))
        expect(element.style.opacity).toBe(0.5)
    })

    it('does not set an inline opacity when fully opaque', () => {
        const element = getTile(makeOverlay(1))
        expect(element.style.opacity).toBeUndefined()
    })

    it('setOpacity restyles the mounted tile elements in place', () => {
        const overlay = makeOverlay(1)
        const a = getTile(overlay)
        const b = getTile(overlay)
        overlay.setOpacity(0.25)
        expect(overlay.opacity).toBe(0.25)
        expect(a.style.opacity).toBe(0.25)
        expect(b.style.opacity).toBe(0.25)
    })

    it('stops tracking a released tile so setOpacity no longer touches it', () => {
        const overlay = makeOverlay(1)
        const released = getTile(overlay)
        const kept = getTile(overlay)
        overlay.releaseTile(released)
        overlay.setOpacity(0.3)
        expect(released.style.opacity).toBeUndefined()
        expect(kept.style.opacity).toBe(0.3)
    })
})
