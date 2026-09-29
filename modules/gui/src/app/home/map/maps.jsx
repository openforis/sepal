import {importLibrary, setOptions} from '@googlemaps/js-api-loader'
import _ from 'lodash'
import PropTypes from 'prop-types'
import React from 'react'
import {BehaviorSubject, debounceTime, distinctUntilChanged, filter, forkJoin, from, map, merge, of, skip, Subject, switchMap, zip} from 'rxjs'

import api from '~/apiRegistry'
import {compose} from '~/compose'
import {connect} from '~/connect'
import {withContext} from '~/context'
import {getLogger} from '~/log'
import {withSubscriptions} from '~/subscription'
import {mapTag, mapViewTag} from '~/tag'
import {themeManager} from '~/theme'
import {uuid} from '~/uuid'

import {SepalMap} from './sepalMap'

const log = getLogger('maps')

// Note: Google Maps API v.3.5+ deprecates Marker for AdvancedMarkerElement, which requires creating a MapId
// Note: a retired numbered version silently falls back to the weekly channel, so a channel is pinned
const GOOGLE_MAPS_VERSION = 'quarterly'
const GOOGLE_MAPS_LIBRARIES = ['core', 'geocoding', 'marker', 'places']

const DEFAULT_ZOOM = 3
export const MIN_ZOOM = 3
export const MAX_ZOOM = 23
const STYLED_MAP_TYPE_OPTIONS = {
    name: 'map',
    maxZoom: MAX_ZOOM
}

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
        this.followTheme = this.followTheme.bind(this)
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

    initGoogleMaps$(googleMapsApiKey) {
        setOptions({
            key: googleMapsApiKey,
            v: GOOGLE_MAPS_VERSION,
        })
        
        const libraries = ['maps', ...GOOGLE_MAPS_LIBRARIES].reduce(
            (libraries, library) => ({...libraries, [library]: from(importLibrary(library))}),
            {}
        )

        return forkJoin(libraries).pipe(
            map(({core, maps, marker, places, geocoding}) =>
                ({google: {maps: {...maps, core, marker, places, geocoding}, googleMapsApiKey}})
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

    getStyleOptions(style, theme) {
        // https://developers.google.com/maps/documentation/javascript/style-reference
        switch (style) {
            case 'sepalStyle':
                return theme === 'light' ? LIGHT_BASE_STYLE : DARK_BASE_STYLE
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
            center: new google.maps.core.LatLng(16.7794913, 9.6771556),
            mapTypeId: google.maps.MapTypeId.ROADMAP,
            zoomControl: false,
            cameraControl: false,
            mapTypeControl: false,
            scaleControl: false,
            streetViewControl: false,
            rotateControl: false,
            fullscreenControl: false,
            // Google only reads this at creation; a live theme switch restyles the tiles, not this.
            backgroundColor: BACKGROUND_COLORS[themeManager.theme],
            gestureHandling: 'greedy',
            draggableCursor: 'pointer',
            ...options
        }

        const googleMap = new google.maps.Map(mapElement, mapOptions)
        this.applyStyle(googleMap, style, themeManager.theme)
        return googleMap
    }

    // The caller owns the returned subscription: it ends with the map, not with this component.
    followTheme(googleMap, style = 'sepalStyle') {
        return themeManager.theme$.pipe(
            skip(1)
        ).subscribe(
            theme => this.applyStyle(googleMap, style, theme)
        )
    }

    applyStyle(googleMap, style, theme) {
        const {google: {google}} = this.state
        googleMap.mapTypes.set('style', new google.maps.StyledMapType(this.getStyleOptions(style, theme), STYLED_MAP_TYPE_OPTIONS))
        googleMap.setMapTypeId('style')
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
                followTheme: this.followTheme,
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

const BACKGROUND_COLORS = {
    dark: '#131314',
    light: '#e9e6df'
}

const DARK_BASE_STYLE = [
    {stylers: [{visibility: 'simplified'}]},
    {stylers: [{color: '#131314'}]},
    {featureType: 'transit.station', stylers: [{visibility: 'off'}]},
    {featureType: 'poi', stylers: [{visibility: 'off'}]},
    {featureType: 'water', stylers: [{color: '#191919'}, {lightness: 4}]},
    {elementType: 'labels.text.fill', stylers: [{visibility: 'off'}, {lightness: 25}]}
]

const LIGHT_BASE_STYLE = [
    {stylers: [{visibility: 'simplified'}]},
    {stylers: [{color: '#e9e6df'}]},
    {featureType: 'transit.station', stylers: [{visibility: 'off'}]},
    {featureType: 'poi', stylers: [{visibility: 'off'}]},
    {featureType: 'water', stylers: [{color: '#cdd5da'}]},
    {elementType: 'labels.text.fill', stylers: [{visibility: 'off'}]}
]

Maps.propTypes = {
    children: PropTypes.any.isRequired,
    onError: PropTypes.func.isRequired
}
