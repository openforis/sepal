import {of} from 'rxjs'
import Layer from './layer'

const polygonOptions = fill => ({
    fillColor: '#FBFAF2',
    fillOpacity: fill ? 0.07 : 0.000000000000000000000000000001,
    strokeColor: '#FBFAF2',
    strokeOpacity: 0.5,
    strokeWeight: 1
})

export class GooglePolygonLayer extends Layer {
    constructor({map, path, fill}) {
        super({map})
        const {google, googleMap} = map.getGoogle()
        this.googleMap = googleMap
        this.type = 'PolygonLayer'
        this.polygonPath = path
        this.fill = fill
        this.layer = new google.maps.Polygon({
            paths: path.map(([lng, lat]) =>
                new google.maps.LatLng(lat, lng)), ...polygonOptions(fill),
            clickable: false
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
            o instanceof GooglePolygonLayer &&
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
