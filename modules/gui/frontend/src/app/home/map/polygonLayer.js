import {compose} from 'compose'
import {connect} from 'store'
import {of} from 'rxjs'
import PropTypes from 'prop-types'
import React from 'react'

class _PolygonLayer extends React.Component {
    render() {
        return null
    }

    componentDidMount() {
        this.setLayer()
    }

    componentDidUpdate() {
        this.setLayer()
    }

    componentWillUnmount() {
        const {id, map} = this.props
        map.removeLayer(id)
    }

    setLayer() {
        const {id, path, map, componentWillUnmount$} = this.props
        if (path) {
            const layer = new Layer({map, path})
            map.setLayer({
                id,
                layer,
                destroy$: componentWillUnmount$
            })
        }
    }
}

export const PolygonLayer = compose(
    _PolygonLayer,
    connect()
)

PolygonLayer.propTypes = {
    id: PropTypes.string.isRequired,
    map: PropTypes.any,
    path: PropTypes.any
}

const polygonOptions = fill => ({
    fillColor: '#FBFAF2',
    fillOpacity: fill ? 0.07 : 0.000000000000000000000000000001,
    strokeColor: '#FBFAF2',
    strokeOpacity: 0.5,
    strokeWeight: 1
})

class Layer {
    constructor({map, path, fill}) {
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
