import {of} from 'rxjs'
import {google, map, polygonOptions} from './map'
import './map.module.css'

class Polygon {
    static setLayer(contextId, {id, path}, onInitialized) {
        const layer = path ? new Polygon(path) : null
        const changed = map.getLayers(contextId).set(id, layer)
        if (layer && changed && onInitialized)
            onInitialized(layer)
        return layer
    }

    constructor(path) {
        this.polygonPath = path
        this.layer = new google.maps.Polygon({
            paths: path.map(([lng, lat]) =>
                new google.maps.LatLng(lat, lng)), ...polygonOptions
        })
        const bounds = new google.maps.LatLngBounds()
        this.layer.getPaths().getArray().forEach((path) =>
            path.getArray().forEach((latLng) =>
                bounds.extend(latLng)
            ))
        this.bounds = bounds
    }

    equals(o) {
        return o === this || (
            o instanceof Polygon &&
            o.polygonPath.toString() === this.polygonPath.toString()
        )
    }

    addToMap(map) {
        this.layer.setMap(map)
    }

    removeFromMap(map) {
        this.layer.setMap(null)
    }

    loadBounds$() {
        return of(this.bounds)
    }
}

export default Polygon