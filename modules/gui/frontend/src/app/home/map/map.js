import {Provider, withMapContext} from './mapContext'
import {SepalMap} from './sepalMap'
import {compose} from 'compose'
import {v4 as uuid} from 'uuid'
import {withMapsContext} from './maps'
import Portal from 'widget/portal'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'
import styles from './map.module.css'

export const fromGoogleBounds = googleBounds => {
    const sw = googleBounds.getSouthWest()
    const ne = googleBounds.getNorthEast()
    return [
        [sw.lng(), sw.lat()],
        [ne.lng(), ne.lat()]
    ]
}

const createGoogleMap = (google, mapElement) => {
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

class _StaticMap extends React.Component {
    map = React.createRef()

    render() {
        const {children} = this.props
        return (
            <React.Fragment>
                <div ref={this.map} className={styles.map}/>
                <div className={styles.content}>
                    {children}
                </div>
            </React.Fragment>
        )
    }

    componentDidMount() {
        const {mapsContext: {google}} = this.props
        createGoogleMap(google, this.map.current)
    }
}

export const StaticMap = compose(
    _StaticMap,
    withMapsContext()
)

StaticMap.propTypes = {}

class _Map extends React.Component {
    state = {
        googleMap: null,
        zooming: false,
        projection: null
    }

    map = React.createRef()
    contextId = uuid()

    render() {
        const {children} = this.props
        const {mapContext} = this.state
        return (
            <Provider value={mapContext}>
                <div ref={this.map} className={styles.map}/>
                <div className={styles.content}>
                    {mapContext ? children : null}
                </div>
            </Provider>
        )
    }

    componentDidMount() {
        const {mapsContext: {google, googleMapsApiKey, norwayPlanetApiKey}} = this.props
        const googleMap = createGoogleMap(google, this.map.current)
        const sepalMap = new SepalMap({google, googleMapsApiKey, googleMap})
        this.setState({mapContext: {google, googleMapsApiKey, norwayPlanetApiKey, googleMap, sepalMap}})
    }
}

export const Map = compose(
    _Map,
    withMapsContext()
)

Map.propTypes = {
    children: PropTypes.object,
    className: PropTypes.string
}

class _MapLayer extends React.Component {
    state = {
        shown: false,
        projection: null
    }

    constructor(props) {
        super(props)
        const {mapContext: {google, googleMap, sepalMap}} = props

        const ReactOverlayView = class ReactOverlayView extends google.maps.OverlayView {
            constructor(component) {
                super()
                this.component = component
                this.xyz = null
            }
        
            draw() {
                const projection = this.getProjection() // TODO: Zooming changes the projection...
                const point = projection.fromLatLngToDivPixel(new google.maps.LatLng(0, 0))
                const xyz = [point.x, point.y, sepalMap.getZoom()]
                if (!_.isEqual(this.xyz, xyz)) {
                    this.xyz = xyz
                    this.component.setState({projection})
                    // changeProjection(projection)
                    // actionBuilder('PROJECTION_CHANGED', {xyz})
                    //     .set('map.projectionChange', xyz)
                    //     .dispatch()
                }
            }
        
            show(shown) {
                this.component.setState({shown})
            }

            onAdd() {
                this.show(true)
            }
        
            onRemove() {
                this.show(false)
            }
        }
    
        this.overlay = new ReactOverlayView(this)
        this.overlay.setMap(googleMap)
    }

    render() {
        const {shown, projection} = this.state
        const {className, children} = this.props
        const mapPanes = this.overlay.getPanes()
        const content = (
            <div className={className}>
                <ProjectionContext.Provider value={projection}>
                    {children}
                </ProjectionContext.Provider>
            </div>
        )
        return shown && mapPanes
            ? <Portal type='container' content={content} container={mapPanes.overlayMouseTarget}/>
            : null
    }

    componentWillUnmount() {
        this.overlay.setMap(null)
    }
}

export const MapLayer = compose(
    _MapLayer,
    withMapContext()
)

class _MapObject extends React.Component {
    render() {
        const {mapContext: {google, googleMap}, lat, lng, width, height, className, children} = this.props
        const shown = googleMap.getBounds().contains({lng, lat})
        if (!shown)
            return null
        return (
            <ProjectionContext.Consumer>
                {projection => {
                    if (!projection)
                        return null
                    const point = projection.fromLatLngToDivPixel(new google.maps.LatLng(lat, lng))
                    const style = {
                        position: 'absolute',
                        top: `calc(${point.y}px - ${height} / 2)`,
                        left: `calc(${point.x}px - ${width} / 2)`
                    }
                    return <div style={style} className={className}>
                        {children}
                    </div>
                }
                }
            </ProjectionContext.Consumer>
        )
    }
}

export const MapObject = compose(
    _MapObject,
    // connect(state => ({projectionChange: state.map.projectionChange})),
    withMapContext()
)

const ProjectionContext = React.createContext()
