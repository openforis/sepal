import {Loader} from 'google-maps'
import {Subject, from, of, zip} from 'rxjs'
import {compose} from 'compose'
import {connect} from 'store'
import {debounceTime, filter, map, switchMap} from 'rxjs/operators'
import {v4 as uuid} from 'uuid'
import {withContext} from 'context'
import PropTypes from 'prop-types'
import React from 'react'
import api from 'api'

const GOOGLE_MAPS_VERSION = '3.42'

export const MapsContext = React.createContext()

export const withMapsContext = withContext(MapsContext, 'mapsContext')

class _Maps extends React.Component {
    state = {
        mapsContext: null
    }

    constructor(props) {
        super(props)
        const {stream} = props
        this.bounds$ = new Subject()
        stream('INIT_MAPS',
            this.initMaps$(),
            mapsContext => this.setState({mapsContext})
        )
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
                ...google,
                ...norwayPlanet,
                createGoogleMap: this.createGoogleMap.bind(this),
                createMapContext: this.createMapContext.bind(this)
            }))
        )
    }

    initGoogleMaps$(googleMapsApiKey) {
        const loader = new Loader(googleMapsApiKey, {
            version: GOOGLE_MAPS_VERSION,
            libraries: ['drawing']
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

    createGoogleMap(mapElement) {
        const {mapsContext: {google}} = this.state
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
            gestureHandling: 'greedy'
        }
    
        // https://developers.google.com/maps/documentation/javascript/style-reference
        const sepalStyle = new google.maps.StyledMapType([
            {stylers: [{visibility: 'simplified'}]},
            {stylers: [{color: '#131314'}]},
            {featureType: 'transit.station', stylers: [{visibility: 'off'}]},
            {featureType: 'poi', stylers: [{visibility: 'off'}]},
            {featureType: 'water', stylers: [{color: '#191919'}, {lightness: 4}]},
            {elementType: 'labels.text.fill', stylers: [{visibility: 'off'}, {lightness: 25}]}
        ], {name: 'sepalMap'})
    
        const googleMap = new google.maps.Map(mapElement, mapOptions)
    
        googleMap.mapTypes.set('sepalStyle', sepalStyle)
        googleMap.setMapTypeId('sepalStyle')
    
        return googleMap
    }
    
    createMapContext(mapElement) {
        const {mapsContext: {google, googleMapsApiKey, norwayPlanetApiKey}} = this.state
        const mapId = uuid()
        const googleMap = this.createGoogleMap(mapElement)
        // const sepalMap = new SepalMap({google, googleMapsApiKey, googleMap})
        // const mapContext = {google, googleMapsApiKey, norwayPlanetApiKey, googleMap, sepalMap}
        const bounds$ = this.bounds$.pipe(
            debounceTime(250),
            filter(({mapId: id}) => id !== mapId),
            map(({bounds}) => bounds)
        )

        const updateBounds = bounds => this.bounds$.next({mapId, bounds})
        
        return {google, googleMapsApiKey, norwayPlanetApiKey, googleMap, bounds$, updateBounds}
    }

    render() {
        const {children} = this.props
        const {mapsContext} = this.state
        const initialized = !!mapsContext
        return (
            <MapsContext.Provider value={mapsContext}>
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
