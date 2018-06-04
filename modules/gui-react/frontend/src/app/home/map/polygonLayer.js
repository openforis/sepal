import {sepalMap} from 'app/home/map/map'
import {of} from 'rxjs'
import {fromGoogleBounds, google, polygonOptions} from './map'
import './map.module.css'

export const setPolygonLayer = (
    {
        contextId,
        layerSpec: {id, path},
        fill,
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

    addToMap(map) {
        this.layer.setMap(map)
    }

    removeFromMap(map) {
        this.layer.setMap(null)
    }

    initialize$() {
        return of(this)
    }
}
