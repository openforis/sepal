import {Loader} from 'google-maps'
import {SepalMap} from './sepalMap'
import {Subject, from, merge, of, zip} from 'rxjs'
import {compose} from 'compose'
import {connect} from 'store'
import {debounceTime, distinctUntilChanged, filter, map, switchMap} from 'rxjs/operators'
import {getLogger} from 'log'
import {mapTag} from 'tag'
import {v4 as uuid} from 'uuid'
import {withContext} from 'context'
import PropTypes from 'prop-types'
import React from 'react'
import api from 'api'

const log = getLogger('maps')

const GOOGLE_MAPS_VERSION = '3.44'

export const MapsContext = React.createContext()

export const withMapsContext = withContext(MapsContext, 'mapsContext')

class _Maps extends React.Component {
    state = {
        mapsContext: null,
        center: {},
        zoom: null,
        scale: null
    }

    currentBounds = null
    linkedMaps = new Set()

    constructor(props) {
        super(props)
        const {stream} = props
        this.bounds$ = new Subject()
        stream('INIT_MAPS',
            this.initMaps$(),
            mapsContext => this.setState(mapsContext)
        )
        this.createGoogleMap = this.createGoogleMap.bind(this)
        this.createSepalMap = this.createSepalMap.bind(this)
        this.createMapContext = this.createMapContext.bind(this)
    }

    initMaps$() {
        return api.map.loadApiKeys$().pipe(
            switchMap(({google: googleMapsApiKey, norwayPlanet: norwayPlanetApiKey}) =>
                zip(
                    this.initGoogleMaps$(googleMapsApiKey),
                    this.initNorwayPlanet$(norwayPlanetApiKey)
                )
            ),
            map(([google, norwayPlanet]) => ({
                google,
                norwayPlanet,
                initialized: true
            }))
        )
    }

    initGoogleMaps$(googleMapsApiKey) {
        const loader = new Loader(googleMapsApiKey, {
            version: GOOGLE_MAPS_VERSION,
            libraries: ['drawing', 'places']
        })
        return from(loader.load()).pipe(
            switchMap(google =>
                of({google, googleMapsApiKey})
            )
        )
    }

    initNorwayPlanet$(norwayPlanetApiKey) {
        return of({norwayPlanetApiKey})
    }

    getStyleOptions(style = 'sepalStyle') {
        // https://developers.google.com/maps/documentation/javascript/style-reference
        switch (style) {
        case 'sepalStyle':
            return [
                {stylers: [{visibility: 'simplified'}]},
                {stylers: [{color: '#131314'}]},
                {featureType: 'transit.station', stylers: [{visibility: 'off'}]},
                {featureType: 'poi', stylers: [{visibility: 'off'}]},
                {featureType: 'water', stylers: [{color: '#191919'}, {lightness: 4}]},
                {elementType: 'labels.text.fill', stylers: [{visibility: 'off'}, {lightness: 25}]}
            ]
        case 'overlayStyle':
            return [
                {stylers: [{visibility: 'off'}]}
            ]
        default:
            throw Error(`Unsupported map style ${style}`)
        }
    }

    createGoogleMap(mapElement, options = {}, style = 'sepalStyle') {
        const {google: {google}} = this.state
        const mapOptions = {
            zoom: 3,
            minZoom: 3,
            maxZoom: 17,
            center: new google.maps.LatLng(16.7794913, 9.6771556),
            mapTypeId: google.maps.MapTypeId.ROADMAP,
            zoomControl: false,
            mapTypeControl: false,
            scaleControl: false,
            streetViewControl: false,
            rotateControl: false,
            fullscreenControl: false,
            backgroundColor: '#131314',
            gestureHandling: 'greedy',
            draggableCursor: 'pointer',
            ...options
        }

        const googleMap = new google.maps.Map(mapElement, mapOptions)

        googleMap.mapTypes.set('style', new google.maps.StyledMapType(this.getStyleOptions(style), {name: 'map'}))
        googleMap.setMapTypeId('style')

        return googleMap
    }

    createSepalMap(mapElement, options, style) {
        const {google: {google}} = this.state
        const googleMap = this.createGoogleMap(mapElement, options, style)
        return new SepalMap(google, googleMap)
    }

    createMapContext(mapId = uuid()) {
        const {google: {googleMapsApiKey}, norwayPlanet: {norwayPlanetApiKey}} = this.state
        const requestedBounds$ = new Subject()

        const bounds$ = merge(
            this.bounds$.pipe(
                debounceTime(50),
                distinctUntilChanged(),
                filter(({mapId: id}) => mapId !== id),
                map(({bounds}) => bounds)
            ),
            requestedBounds$
        )

        const notifyLinked = linked => {
            if (linked) {
                this.linkedMaps.add(mapId)
            } else {
                this.linkedMaps.delete(mapId)
            }
            log.debug(`Linked maps: ${this.linkedMaps.size}`)
            if (linked && this.linkedMaps.size > 1 && this.currentBounds) {
                requestedBounds$.next(this.currentBounds)
            }
        }

        const updateBounds = bounds => {
            const {currentBounds} = this
            const {center, zoom} = bounds

            if (currentBounds && currentBounds.center.equals(center) && currentBounds.zoom === zoom) {
                log.debug(`Bounds update from ${mapTag(mapId)} ignored`)
            } else {
                log.debug(`Bounds update from ${mapTag(mapId)} accepted`)
                this.bounds$.next({mapId, bounds})
                this.currentBounds = bounds
                const scale = Math.round(
                    156543.03392 * Math.cos(center.lat() * Math.PI / 180) / Math.pow(2, zoom)
                )
                this.setState({
                    center: center ? {lat: center.lat(), lng: center.lng()} : {},
                    zoom,
                    scale
                })
            }
        }

        return {mapId, googleMapsApiKey, norwayPlanetApiKey, bounds$, updateBounds, notifyLinked}
    }

    render() {
        const {children} = this.props
        const {initialized, bounds, center, zoom, scale} = this.state
        return (
            <MapsContext.Provider value={{
                createGoogleMap: this.createGoogleMap,
                createSepalMap: this.createSepalMap,
                createMapContext: this.createMapContext,
                center,
                zoom,
                scale
            }}>
                {children(initialized)}
            </MapsContext.Provider>
        )
    }
}

export const Maps = compose(
    _Maps,
    connect()
)

Maps.propTypes = {
    children: PropTypes.any
}
