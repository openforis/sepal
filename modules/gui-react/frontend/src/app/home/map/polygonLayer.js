import './map.module.css'
import {fromGoogleBounds, google, polygonOptions} from './map'
import {of} from 'rxjs'
import {sepalMap} from 'app/home/map/map'

export const setPolygonLayer = (
    {
        contextId,
        layerSpec: {id, path},
        _fill,
        destroy$,
        onInitialized
    }) => {
    const layer = path ? new PolygonLayer(path) : null
    sepalMap.getContext(contextId).setLayer({id, layer, destroy$, onInitialized})
    return layer
}

class PolygonLayer {
    constructor(path, fill) {
        this.polygonPath = path
        this.fill = fill
        this.layer = new google.maps.Polygon({
            paths: path.map(([lng, lat]) =>
                new google.maps.LatLng(lat, lng)), ...polygonOptions(fill)
        })
        const googleBounds = new google.maps.LatLngBounds()
        this.layer.getPaths().getArray().forEach((path) =>
            path.getArray().forEach((latLng) =>
                googleBounds.extend(latLng)
            ))
        this.bounds = fromGoogleBounds(googleBounds)
    }

    equals(o) {
        return o === this || (
            o instanceof PolygonLayer &&
            o.polygonPath.toString() === this.polygonPath.toString() &&
            o.fill === this.fill
        )
    }

    addToMap(googleMap) {
        this.layer.setMap(googleMap)
    }

    removeFromMap(_googleMap) {
        this.layer.setMap(null)
    }

    initialize$() {
        return of(this)
    }
}
