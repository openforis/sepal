import {of} from 'rxjs'

const polygonOptions = fill => ({
    fillColor: '#FBFAF2',
    fillOpacity: fill ? 0.07 : 0.000000000000000000000000000001,
    strokeColor: '#FBFAF2',
    strokeOpacity: 0.5,
    strokeWeight: 1
})

export const setPolygonLayer = ({
    map,
    layerSpec: {id, path},
    _fill,
    destroy$,
    onInitialized
}) => {
    const layer = path ? new PolygonLayer({map, path}) : null
    map.setLayer({id, layer, destroy$, onInitialized})
    return layer
}

export class PolygonLayer {
    constructor({map, path, fill}) {
        const {google, googleMap} = map.getGoogle()
        this.googleMap = googleMap
        this.type = 'PolygonLayer'
        this.polygonPath = path
        this.fill = fill
        this.layer = new google.maps.Polygon({
            paths: path.map(([lng, lat]) =>
                new google.maps.LatLng(lat, lng)), ...polygonOptions(fill)
        })
        const googleBounds = new google.maps.LatLngBounds()
        this.layer.getPaths().getArray().forEach(path =>
            path.getArray().forEach(latLng =>
                googleBounds.extend(latLng)
            ))
        this.bounds = map.fromGoogleBounds(googleBounds)
    }

    equals(o) {
        return o === this || (
            o instanceof PolygonLayer &&
            o.polygonPath.toString() === this.polygonPath.toString() &&
            o.fill === this.fill
        )
    }

    addToMap() {
        this.layer.setMap(this.googleMap)
    }

    removeFromMap() {
        this.layer.setMap(null)
    }

    hide(hidden) {
        hidden
            ? this.removeFromMap()
            : this.addToMap()
    }

    initialize$() {
        return of(this)
    }
}
