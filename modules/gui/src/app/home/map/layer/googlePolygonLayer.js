import {Layer} from './layer'
import {of, tap} from 'rxjs'

export class GooglePolygonLayer extends Layer {
    constructor({map, path, fill}) {
        super()
        this.map = map
        this.type = 'PolygonLayer'
        this.path = path
        this.fill = fill
    }

    getPolygonOptions = (fill, paths) => ({
        fillColor: '#FBFAF2',
        fillOpacity: fill ? 0.07 : 1e-30,
        strokeColor: '#FBFAF2',
        strokeOpacity: 0.5,
        strokeWeight: 1,
        clickable: false,
        paths
    })

    createShape = () => {
        const {map, path, fill} = this
        const {google} = map.getGoogle()
        const paths = path.map(
            ([lng, lat]) => new google.maps.LatLng(lat, lng)
        )
        const polygonOptions = this.getPolygonOptions(fill, paths)
        return new google.maps.Polygon(polygonOptions)
    }

    addToMap = () => {
        this.overlay = this.createShape()
        const {map, overlay} = this
        const {googleMap} = map.getGoogle()
        if (overlay) {
            overlay.setMap(googleMap)
        }
    }

    addToMap$ = () =>
        of(true).pipe(
            tap(() => this.addToMap())
        )

    removeFromMap = () => {
        const {overlay} = this
        if (overlay) {
            overlay.setMap(null)
        }
    }

    equals = other =>
        other === this
            || other instanceof GooglePolygonLayer
                && other.path.toString() === this.path.toString()
                && other.fill === this.fill
}
