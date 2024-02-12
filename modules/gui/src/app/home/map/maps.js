import {BehaviorSubject, Subject, debounceTime, distinctUntilChanged, filter, from, map, merge, of, switchMap, zip} from 'rxjs'
import {Loader} from 'google-maps'
import {SepalMap} from './sepalMap'
import {compose} from 'compose'
import {connect} from 'store'
import {getLogger} from 'log'
import {mapTag, mapViewTag} from 'tag'
import {v4 as uuid} from 'uuid'
import {withContext} from 'context'
import {withSubscriptions} from 'subscription'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'
import api from 'api'

const log = getLogger('maps')

const GOOGLE_MAPS_VERSION = '3.52'
const GOOGLE_MAPS_LIBRARIES = ['drawing', 'places']

const DEFAULT_ZOOM = 3
export const MIN_ZOOM = 3
export const MAX_ZOOM = 23

const Context = React.createContext()

export const withMapsContext = withContext(Context, 'mapsContext')

class _Maps extends React.Component {
    state = {
        mapsContext: null
    }

    view$ = new BehaviorSubject()
    scrollWheelEnabled$ = new BehaviorSubject()
    linkedMaps = new Set()

    constructor(props) {
        super(props)
        this.createGoogleMap = this.createGoogleMap.bind(this)
        this.createSepalMap = this.createSepalMap.bind(this)
        this.createMapContext = this.createMapContext.bind(this)
        this.initialize()
    }

    initialize() {
        const {stream} = this.props
        stream('INIT_MAPS',
            this.initialize$(),
            providers => this.setState({...providers, initialized: true}),
            error => this.handleError(error)
        )
    }

    initialize$() {
        return api.map.loadApiKeys$().pipe(
            switchMap(
                ({google: googleMapsApiKey, nicfiPlanet: nicfiPlanetApiKey}) =>
                    zip(
                        this.initGoogleMaps$(googleMapsApiKey),
                        this.initNicfiPlanet$(nicfiPlanetApiKey)
                    )
            ),
            map(([google, nicfiPlanet]) => ({google, nicfiPlanet}))
        )
    }

    getGoogleMapsLoader(googleMapsApiKey) {
        return new Loader(googleMapsApiKey, {
            version: GOOGLE_MAPS_VERSION,
            libraries: GOOGLE_MAPS_LIBRARIES
        })
    }

    initGoogleMaps$(googleMapsApiKey) {
        const loader = this.getGoogleMapsLoader(googleMapsApiKey)
        return from(loader.load()).pipe(
            switchMap(google =>
                of({google, googleMapsApiKey})
            )
        )
    }

    initNicfiPlanet$(nicfiPlanetApiKey) {
        return of({nicfiPlanetApiKey})
    }

    handleError(error) {
        const {onError} = this.props
        onError && onError(error)
        this.setState({error})
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
            scrollwheel: false,
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

        const styledMapTypeStyles = this.getStyleOptions(style)
        const styledMapTypeOptions = {
            name: 'map',
            maxZoom: MAX_ZOOM
        }
        const styledMapType = new google.maps.StyledMapType(styledMapTypeStyles, styledMapTypeOptions)

        googleMap.mapTypes.set('style', styledMapType)
        googleMap.setMapTypeId('style')

        return googleMap
    }

    createSepalMap({element, options, style, renderingEnabled$, renderingStatus$}) {
        const {google: {google}} = this.state
        const googleMap = this.createGoogleMap(element, options, style)
        return new SepalMap({google, googleMap, renderingEnabled$, renderingStatus$})
    }

    getCurrentView() {
        const {view$} = this
        const update = view$.getValue()
        return update && update.view
    }

    createMapContext(mapId = uuid()) {
        const {addSubscription} = this.props
        const {google: {googleMapsApiKey}, nicfiPlanet: {nicfiPlanetApiKey}} = this.state
        const requestedView$ = new Subject()

        const view$ = merge(
            this.view$.pipe(
                distinctUntilChanged(),
                filter(value => value),
                filter(({mapId: id}) => this.linkedMaps.has(mapId) && mapId !== id),
                map(({view}) => view)
            ),
            requestedView$
        )

        const updateView$ = new Subject()
        const linked$ = new Subject()
        const scrollWheelEnabled$ = this.scrollWheelEnabled$

        const setLinked = (linked, {synchronizeIn, synchronizeOut} = {}, view) => {
            if (linked) {
                const currentView = this.getCurrentView()
                this.linkedMaps.add(mapId)
                if (this.linkedMaps.size === 1 || synchronizeOut) {
                    this.view$.next({mapId, view})
                } else if (currentView && synchronizeIn) {
                    requestedView$.next(currentView)
                }
            } else {
                this.linkedMaps.delete(mapId)
            }
            log.debug(() => `${mapTag(mapId)} ${linked ? 'linked' : 'unlinked'}, now ${this.linkedMaps.size} linked.`)
        }

        const updateView = view => {
            if (this.linkedMaps.has(mapId)) {
                const currentView = this.getCurrentView()
                const {center, zoom} = view
                if (center && zoom) {
                    if (currentView && _.isEqual(currentView.center, center) && currentView.zoom === zoom) {
                        log.trace(() => `View update from linked ${mapTag(mapId)} ignored`)
                    } else {
                        log.debug(() => `View update from linked ${mapTag(mapId)} accepted: ${mapViewTag(view)}`)
                        this.view$.next({mapId, view})
                    }
                }
            } else {
                log.trace(() => `View update from unlinked ${mapTag(mapId)} discarded`)
            }
        }

        addSubscription(
            linked$.pipe(
                distinctUntilChanged()
            ).subscribe(
                ({linked, synchronize, view}) => setLinked(linked, synchronize, view)
            ),
            updateView$.pipe(
                debounceTime(500),
                distinctUntilChanged()
            ).subscribe(
                view => updateView(view)
            )
        )

        return {mapId, googleMapsApiKey, nicfiPlanetApiKey, view$, updateView$, linked$, scrollWheelEnabled$}
    }

    render() {
        const {children} = this.props
        const {error, initialized} = this.state
        return (
            <Context.Provider value={{
                createGoogleMap: this.createGoogleMap,
                createSepalMap: this.createSepalMap,
                createMapContext: this.createMapContext
            }}>
                {children(initialized, error)}
            </Context.Provider>
        )
    }

    componentDidMount() {
        this.initializeScrollWheel()
    }

    initializeScrollWheel() {
        const {addSubscription} = this.props
        const LOCAL_STORAGE_KEY = 'ScrollWheelMapZooming'
        const enabled = localStorage.getItem(LOCAL_STORAGE_KEY)
        this.scrollWheelEnabled$.next(!enabled || enabled === 'true')
        addSubscription(
            this.scrollWheelEnabled$.subscribe(
                enabled => localStorage.setItem(LOCAL_STORAGE_KEY, enabled)
            )
        )
    }
}

export const Maps = compose(
    _Maps,
    connect(),
    withSubscriptions()
)

Maps.propTypes = {
    children: PropTypes.any.isRequired,
    onError: PropTypes.func.isRequired
}
