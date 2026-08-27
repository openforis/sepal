import {vi} from 'vitest'

// MAX_ZOOM is all this layer needs from the maps module, which otherwise pulls in the Google loader and
// the Redux store.
vi.mock('../maps', () => ({MAX_ZOOM: 23}))

import {GoogleLabelsLayer} from './googleLabelsLayer'

// Stands in for google.maps.StyledMapType, keeping the styles it was constructed with. Nothing wraps or
// delegates to it: it renders through an internal path, so it is registered as-is.
class FakeStyledMapType {
    constructor(styles, options) {
        this.styles = styles
        this.options = options
    }
}

const fakeMap = () => {
    const overlays = []
    return {
        getGoogle: () => ({
            google: {maps: {StyledMapType: FakeStyledMapType}},
            googleMap: {
                overlayMapTypes: {
                    getArray: () => overlays,
                    getAt: index => overlays[index],
                    insertAt: (index, overlay) => overlays.splice(index, 0, overlay),
                    removeAt: index => overlays.splice(index, 1)[0],
                    setAt: (index, overlay) => { overlays[index] = overlay }
                }
            }
        })
    }
}

const ALL_ENABLED = {administrative: true, landscape: true, poi: true, road: true, transit: true, water: true}

const layerWith = (settings = ALL_ENABLED) =>
    new GoogleLabelsLayer({map: fakeMap(), layerIndex: 1, settings})

const mounted = settings => {
    const layer = layerWith(settings)
    layer.addToMap()
    return layer
}

describe('GoogleLabelsLayer registration', () => {
    it('registers the styled map type itself, unwrapped', () => {
        expect(mounted().overlay).toBeInstanceOf(FakeStyledMapType)
    })
})

describe('GoogleLabelsLayer category settings', () => {
    it('hides a disabled category with a final visibility-off rule for its feature type', () => {
        const layer = mounted({...ALL_ENABLED, road: false})

        expect(layer.overlay.styles.at(-1)).toEqual({featureType: 'road', stylers: [{visibility: 'off'}]})
    })
})

describe('GoogleLabelsLayer equality', () => {
    it('is equal when the category settings match', () => {
        expect(layerWith().equals(layerWith())).toBe(true)
    })

    it('is not equal when a category setting differs', () => {
        expect(layerWith().equals(layerWith({...ALL_ENABLED, road: false}))).toBe(false)
    })
})
