import {MarkerClusterer} from '@googlemaps/markerclusterer'
import Layer from './layer/oldlayer'
import _ from 'lodash'

const DEFAULT_COLOR = '#FFFFFF'
const DEFAULT_STROKE_COLOR = '#000000'
const SELECTED_STROKE_COLOR = '#000000'
const DEFAULT_STROKE_WIDTH = 2
const SELECTED_STROKE_WIDTH = 3
const DEFAULT_SCALE = 0.5
const SELECTED_SCALE = 0.6

export default class MarkerClustererLayer extends Layer {

    constructor({map, id, label, description}) {
        super({map})
        const {google, googleMap} = map.getGoogle()
        this.type = 'MarkerClustererLayer'
        this.toggleable = true
        this.google = google
        this.googleMap = googleMap
        this.id = id
        this.label = label
        this.description = description
        this.mapMarkers = {}
        this.clickable = false

        // Path from https://github.com/scottdejonge/map-icons
        this.icon = {
            path: 'M25.015 2.4c-7.8 0-14.121 6.204-14.121 13.854 0 7.652 14.121 32.746 14.121 32.746s14.122-25.094 14.122-32.746c0-7.65-6.325-13.854-14.122-13.854z',
            fillOpacity: 1,
            anchor: new this.google.maps.Point(25, 50),
            strokeWeight: DEFAULT_STROKE_WIDTH,
            strokeColor: DEFAULT_STROKE_COLOR,
            scale: DEFAULT_SCALE
        }

        const renderer = {render: ({count, position}) => {
            const svg = window.btoa(`
  <svg fill="hsla(0, 0%, 0%, 0.4)" stroke="#FF0000" stroke-width="10" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240">
    <circle cx="120" cy="120" opacity=".6" r="70" stroke="hsla(0, 0%, 49%, 0.8)" stroke-width="10" />
    <circle cx="120" cy="120" opacity=".3" r="90" stroke="hsla(0, 0%, 49%, 0.8)" stroke-width="10" />
    <circle cx="120" cy="120" opacity=".2" r="110" stroke="hsla(0, 0%, 49%, 0.8)" stroke-width="10" />
  </svg>`)

            return new google.maps.Marker({
                position,
                icon: {
                    url: `data:image/svg+xml;base64,${svg}`,
                    scaledSize: new google.maps.Size(45, 45),
                },
                label: {
                    text: String(count),
                    color: 'rgba(255,255,255,0.9)',
                    fontSize: '12px',
                },
                title: `Cluster of ${count} markers`,
                zIndex: Number(google.maps.Marker.MAX_ZINDEX) + count,
            })
        }}

        this.markerCluster = new MarkerClusterer({
            map: null,
            markers: [],
            renderer
        })
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
        if (_.isFinite(marker['class'])) {
            this.updateIcon(marker, {
                strokeWeight: DEFAULT_STROKE_WIDTH,
                strokeColor: DEFAULT_STROKE_COLOR,
                scale: DEFAULT_SCALE
            })
        } else {
            this.removeMarker(marker)
        }
    }

    addMarker(marker) {
        const mapMarker = this.toMapMarker(marker)
        mapMarker.setIcon({
            ...mapMarker.getIcon(),
            strokeWeight: SELECTED_STROKE_WIDTH,
            strokeColor: SELECTED_STROKE_COLOR,
            scale: SELECTED_SCALE
        })
        this.mapMarkers[markerKey(marker)] = mapMarker
        this.markerCluster.addMarker(mapMarker)
        return mapMarker
    }

    updateMarker(marker) {
        const mapMarker = this.findMapMarker(marker)
        if (mapMarker) {
            mapMarker.data = marker
            this.updateIcon(marker, {fillColor: marker.color})
        }
    }

    removeMarker(marker) {
        const mapMarker = this.findMapMarker(marker)
        if (mapMarker) {
            this.markerCluster.removeMarker(mapMarker)
        }
        delete this.mapMarkers[markerKey(marker)]
    }

    updateIcon(marker, iconUpdate) {
        const mapMarker = this.findMapMarker(marker)
        if (mapMarker) {
            mapMarker.setIcon({...mapMarker.getIcon(), ...iconUpdate})
        }
    }

    findMapMarker(marker) {
        return this.mapMarkers[markerKey(marker)]
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
        hidden
            ? this.removeFromMap()
            : this.addToMap()
    }

    toMapMarker(marker) {
        const {x, y, color = DEFAULT_COLOR, onClick} = marker
        const mapMarker = new this.google.maps.Marker({
            position: new this.google.maps.LatLng(y, x),
            draggable: false,
            icon: {...this.icon, fillColor: color},
            clickable: this.clickable
        })
        mapMarker.data = marker
        mapMarker.addListener('click', () => {
            const m = this.findMapMarker({x, y})
            m && onClick && onClick(m.data)
        })
        return mapMarker
    }

    setClickable(flag) {
        this.clickable = flag
        Object.values(this.mapMarkers || {}).forEach(marker => marker.setClickable(flag))
    }
}

const markerKey = ({x, y}) => `${x},${y}`
