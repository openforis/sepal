import {ADAPTER_MEMBERS, otherPolygonIds, toAdapterLib, toBounds, toPolygonFeature, toPolygonPath} from './drawing'

const rectangle = ([west, south], [east, north]) => feature([
    [west, south], [east, south], [east, north], [west, north], [west, south]
])

const feature = coordinates => ({
    type: 'Feature',
    properties: {mode: 'polygon'},
    geometry: {type: 'Polygon', coordinates: [coordinates]}
})

describe('toPolygonPath', () => {
    it('drops the closing vertex GeoJSON rings carry', () => {
        expect(toPolygonPath(feature([[10, 20], [30, 20], [30, 40], [10, 20]])))
            .toEqual([[10, 20], [30, 20], [30, 40]])
    })

    it('leaves an already-open ring untouched', () => {
        expect(toPolygonPath(feature([[10, 20], [30, 20], [30, 40]])))
            .toEqual([[10, 20], [30, 20], [30, 40]])
    })

    it('keeps coordinates in lng/lat order', () => {
        expect(toPolygonPath(feature([[-58.4, -34.6], [2.3, 48.9], [139.7, 35.7], [-58.4, -34.6]])))
            .toEqual([[-58.4, -34.6], [2.3, 48.9], [139.7, 35.7]])
    })
})

describe('toBounds', () => {
    it('returns south-west and north-east corners', () => {
        expect(toBounds(rectangle([10, 20], [30, 40])))
            .toEqual([[10, 20], [30, 40]])
    })

    it('is independent of the direction the rectangle was drawn in', () => {
        expect(toBounds(rectangle([30, 40], [10, 20])))
            .toEqual([[10, 20], [30, 40]])
    })

    it('handles bounds spanning the equator and prime meridian', () => {
        expect(toBounds(rectangle([-10, -5], [15, 25])))
            .toEqual([[-10, -5], [15, 25]])
    })
})

describe('toAdapterLib', () => {
    // Mirrors the namespace maps.jsx builds: the `maps` library spread flat, everything else nested.
    const google = {maps: {
        Data: 'Data',
        OverlayView: 'OverlayView',
        core: {LatLng: 'LatLng', LatLngBounds: 'LatLngBounds', Point: 'Point', Size: 'Size'},
        marker: {}, places: {}, geocoding: {}
    }}

    it.each(ADAPTER_MEMBERS)('exposes %s, which the adapter reads off the namespace', member => {
        expect(toAdapterLib(google)[member]).toBeDefined()
    })

    it('would not find the core members on the unflattened namespace', () => {
        expect(google.maps.LatLng).toBeUndefined()
    })
})

describe('otherPolygonIds', () => {
    const polygon = id => ({id, geometry: {type: 'Polygon'}})
    const point = id => ({id, geometry: {type: 'Point'}})

    it('lists the polygons that are not the one being kept', () => {
        expect(otherPolygonIds([polygon('a'), polygon('b'), polygon('c')], 'c')).toEqual(['a', 'b'])
    })

    it('never lists coordinate points, which the mode owns', () => {
        expect(otherPolygonIds([polygon('a'), point('a1'), point('a2')], 'a')).toEqual([])
    })

    it('leaves the kept polygon\'s own points alone while listing an older polygon', () => {
        expect(otherPolygonIds([polygon('old'), point('old1'), polygon('new'), point('new1')], 'new'))
            .toEqual(['old'])
    })

    it('lists nothing for an empty store', () => {
        expect(otherPolygonIds([], 'a')).toEqual([])
    })
})

describe('toPolygonFeature', () => {
    const path = [[10, 20], [30, 20], [30, 40]]

    it('closes the ring GeoJSON requires', () => {
        expect(toPolygonFeature(path).geometry.coordinates[0])
            .toEqual([[10, 20], [30, 20], [30, 40], [10, 20]])
    })

    it('does not double the closing vertex of an already-closed path', () => {
        expect(toPolygonFeature([...path, [10, 20]]).geometry.coordinates[0])
            .toEqual([[10, 20], [30, 20], [30, 40], [10, 20]])
    })

    it('tags the feature as a polygon-mode feature, which is what makes it editable', () => {
        expect(toPolygonFeature(path).properties.mode).toBe('polygon')
    })

    it('round-trips through toPolygonPath', () => {
        expect(toPolygonPath(toPolygonFeature(path))).toEqual(path)
    })
})
