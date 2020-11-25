import {of} from 'rxjs'
import MarkerClusterer from '@googlemaps/markerclustererplus'
import _ from 'lodash'
import styles from './markerClustererLayer.module.css'

const DEFAULT_COLOR = '#FFFFFF'
const DEFAULT_STROKE_COLOR = '#000000'
const SELECTED_STROKE_COLOR = '#000000'
const DEFAULT_STROKE_WIDTH = 2
const SELECTED_STROKE_WIDTH = 3
const DEFAULT_SCALE = 0.5
const SELECTED_SCALE = 0.6

export default class MarkerClustererLayer {

    constructor({mapContext: {google, googleMap, sepalMap}, id, label, description}) {
        this.type = 'MarkerClustererLayer'
        this.toggleable = true
        this.google = google
        this.googleMap = googleMap
        this.sepalMap = sepalMap
        this.id = id
        this.label = label
        this.description = description
        this.mapMarkers = {}
        this.clickable = false

        // Path from https://github.com/scottdejonge/map-icons
        this.icon = {
            path: "M25.015 2.4c-7.8 0-14.121 6.204-14.121 13.854 0 7.652 14.121 32.746 14.121 32.746s14.122-25.094 14.122-32.746c0-7.65-6.325-13.854-14.122-13.854z",
            fillOpacity: 1,
            anchor: new google.maps.Point(25, 50),
            strokeWeight: DEFAULT_STROKE_WIDTH,
            strokeColor: DEFAULT_STROKE_COLOR,
            scale: DEFAULT_SCALE
        }

        this.markerCluster = new MarkerClusterer(null, [], {
            clusterClass: styles.cluster,
            maxZoom: 14
        })
        this.markerCluster.setStyles(
            this.markerCluster.getStyles().map(style => _.omit({...style, textColor: 'white'}, 'url'))
        )
    }

    setMarkers(markers) {
        this.mapMarkers = {}
        this.markers = markers
            .forEach(marker => {
                const {x, y} = marker
                this.mapMarkers[markerKey({x, y})] = this.toMapMarker(marker)
            })
        this.markerCluster.clearMarkers()
        this.markerCluster.addMarkers(Object.values(this.mapMarkers))
    }

    selectMarker(marker) {
        this.updateIcon(marker, {
            strokeWeight: SELECTED_STROKE_WIDTH,
            strokeColor: SELECTED_STROKE_COLOR,
            scale: SELECTED_SCALE
        })
    }

    deselectMarker(marker) {
        this.updateIcon(marker, {
            strokeWeight: DEFAULT_STROKE_WIDTH,
            strokeColor: DEFAULT_STROKE_COLOR,
            scale: DEFAULT_SCALE
        })
    }

    addMarker(marker) {
        console.log('addMarker', marker)
        const mapMarker = this.toMapMarker(marker)
        mapMarker.setIcon({
            ...mapMarker.getIcon(),
            strokeWeight: SELECTED_STROKE_WIDTH,
            strokeColor: SELECTED_STROKE_COLOR,
            scale: SELECTED_SCALE
        })
        this.mapMarkers[markerKey(marker)] = mapMarker
        this.markerCluster.addMarker(mapMarker)
    }

    updateMarker(marker) {
        console.log('updateMarker', marker)
        const mapMarker = this.getMapMarker(marker)
        mapMarker.data = marker
        this.updateIcon(marker, {fillColor: marker.color})
    }

    removeMarker(marker) {
        const mapMarker = this.mapMarkers[markerKey(marker)]
        delete this.mapMarkers[markerKey(marker)]
        if (mapMarker) {
            this.markerCluster.removeMarker(mapMarker)
        }
    }

    updateIcon(marker, iconUpdate) {
        const mapMarker = this.getMapMarker(marker)
        mapMarker.setIcon({...mapMarker.getIcon(), ...iconUpdate})
    }

    getMapMarker(marker) {
        const mapMarker = this.mapMarkers[markerKey(marker)]
        if (!mapMarker)
            throw new Error(`Marker not found: ${marker}`)
        return mapMarker
    }

    equals(o) {
        return _.isEqual(o && o.type, this.type)
    }

    addToMap() {
        this.markerCluster.clearMarkers()
        this.markerCluster.addMarkers(Object.values(this.mapMarkers))
        this.markerCluster.setMap(this.googleMap)
    }

    removeFromMap() {
        this.markerCluster.clearMarkers()
        this.markerCluster.setMap(null)
    }

    hide(hidden) {
        hidden ? this.removeFromMap() : this.addToMap()
    }

    initialize$() {
        return of(this)
    }

    toMapMarker(marker) {
        const {x, y, color = DEFAULT_COLOR, onClick} = marker
        const google = this.google
        const mapMarker = new google.maps.Marker({
            position: new google.maps.LatLng(y, x),
            draggable: false,
            icon: {...this.icon, fillColor: color},
            clickable: this.clickable
        })
        mapMarker.addListener("click", () => {
            onClick && onClick(this.mapMarkers[markerKey({x, y})].data)
        })
        mapMarker.data = marker
        return mapMarker
    }

    setClickable(flag) {
        this.clickable = flag
        Object.values(this.mapMarkers || {}).forEach(marker => marker.setClickable(flag))
    }
}

const markerKey = ({x, y}) => `${x},${y}`
