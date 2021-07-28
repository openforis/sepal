import {of} from 'rxjs'
import ShapeLayer from './shapeLayer'

export class GooglePolygonLayer extends ShapeLayer {
    constructor({map, path, fill}) {
        super({map})
        this.type = 'PolygonLayer'
        this.path = path
        this.fill = fill
    }

    getPolygonOptions(fill) {
        return {
            fillColor: '#FBFAF2',
            fillOpacity: fill ? 0.07 : 1e-30,
            strokeColor: '#FBFAF2',
            strokeOpacity: 0.5,
            strokeWeight: 1,
            clickable: false
        }
    }

    createShape() {
        const {map, path, fill} = this
        const {google} = map.getGoogle()
        const polygonOptions = this.getPolygonOptions(fill)
        const paths = path.map(([lng, lat]) => new google.maps.LatLng(lat, lng))
        return new google.maps.Polygon({...polygonOptions, paths})
        // const googleBounds = new google.maps.LatLngBounds()
        // this.layer.getPaths().getArray().forEach(path =>
        //     path.getArray().forEach(latLng =>
        //         googleBounds.extend(latLng)
        //     ))
        // this.bounds = map.fromGoogleBounds(googleBounds)
    }

    equals(o) {
        return o === this || (
            o instanceof GooglePolygonLayer &&
            o.path.toString() === this.path.toString() &&
            o.fill === this.fill
        )
    }

    initialize$() {
        return of(this)
    }
}
