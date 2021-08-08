import {Loader} from 'google-maps'
import {SepalMap} from './sepalMap'
import {Subject, from, merge, of, zip} from 'rxjs'
import {compose} from 'compose'
import {connect} from 'store'
import {debounceTime, distinctUntilChanged, filter, map, switchMap} from 'rxjs/operators'
import {getLogger} from 'log'
import {mapTag, mapViewTag} from 'tag'
import {v4 as uuid} from 'uuid'
import {withContext} from 'context'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'
import api from 'api'

const log = getLogger('maps')

const GOOGLE_MAPS_VERSION = '3.44'

const DEFAULT_ZOOM = 3
const MIN_ZOOM = 3
const MAX_ZOOM = 22

export const MapsContext = React.createContext()

export const withMapsContext = withContext(MapsContext, 'mapsContext')

class _Maps extends React.Component {
    state = {
        mapsContext: null
    }

    view$ = new Subject()
    currentView = null
    linkedMaps = new Set()

    constructor(props) {
        super(props)
        const {onError, stream} = props
        stream('INIT_MAPS',
            this.initMaps$(),
            mapsContext => this.setState(mapsContext),
            error => {
                onError(error)
                this.setState({error})
            }
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
            zoom: DEFAULT_ZOOM,
            minZoom: MIN_ZOOM,
            maxZoom: MAX_ZOOM,
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

    getScale({center, zoom}) {
        return 156543.03392 * Math.cos(center.lat * Math.PI / 180) / Math.pow(2, zoom)
    }

    createMapContext(mapId = uuid()) {
        const {google: {googleMapsApiKey}, norwayPlanet: {norwayPlanetApiKey}} = this.state
        const requestedView$ = new Subject()

        const view$ = merge(
            this.view$.pipe(
                debounceTime(100),
                distinctUntilChanged(),
                filter(({mapId: id}) => mapId !== id),
                map(({view}) => view)
            ),
            requestedView$
        )

        const notifyLinked = linked => {
            if (linked) {
                this.linkedMaps.add(mapId)
            } else {
                this.linkedMaps.delete(mapId)
            }
            log.debug(() => `Linked maps: ${this.linkedMaps.size}`)
            if (linked && this.linkedMaps.size > 1 && this.currentView) {
                requestedView$.next(this.currentView)
            }
        }

        const updateView = view => {
            const {currentView} = this
            const {center, zoom, bounds} = view

            if (currentView && _.isEqual(currentView.center, center) && currentView.zoom === zoom) {
                log.debug(() => `View update from ${mapTag(mapId)} ignored`)
            } else {
                log.debug(() => `View update from ${mapTag(mapId)} accepted: ${mapViewTag(view)}`)
                const scale = this.getScale({center, zoom})
                this.view$.next({mapId, view: {
                    center,
                    zoom,
                    bounds,
                    scale
                }})
                this.currentView = view
            }
        }

        return {mapId, googleMapsApiKey, norwayPlanetApiKey, view$, updateView, notifyLinked}
    }

    render() {
        const {children} = this.props
        const {error, initialized} = this.state
        const {view$} = this
        return (
            <MapsContext.Provider value={{
                createGoogleMap: this.createGoogleMap,
                createSepalMap: this.createSepalMap,
                createMapContext: this.createMapContext,
                view$: view$.pipe(
                    map(({view}) => view)
                )
            }}>
                {children(initialized, error)}
            </MapsContext.Provider>
        )
    }
}

export const Maps = compose(
    _Maps,
    connect()
)

Maps.propTypes = {
    children: PropTypes.any.isRequired,
    onError: PropTypes.func.isRequired
}
