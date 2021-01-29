import {NEVER, Subject} from 'rxjs'
import {Provider, withMapContext} from './mapContext'
import {compose} from 'compose'
import {connect} from 'store'
import {filter, takeUntil} from 'rxjs/operators'
import {getProcessTabsInfo} from '../body/process/process'
import {msg} from 'translate'
import {select} from 'store'
import {withMapsContext} from './maps'
import {withRecipePath} from '../body/process/recipe'
import Notifications from 'widget/notifications'
import Portal from 'widget/portal'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'
import actionBuilder from 'action-builder'
import styles from './map.module.css'
import withSubscriptions from 'subscription'

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
        const {mapsContext: {createGoogleMap}} = this.props
        createGoogleMap(this.map.current)
    }
}

export const StaticMap = compose(
    _StaticMap,
    withMapsContext()
)

StaticMap.propTypes = {}

const mapStateToProps = (_state, {recipePath}) => {
    return {
        single: getProcessTabsInfo().single,
        linked: select([recipePath, 'ui.map.linked'])
    }
}

class _Map extends React.Component {
    layerById = {}
    updateBounds$ = new Subject()
    requestBounds$ = new Subject()

    drawingOptions = {
        fillColor: '#FBFAF2',
        fillOpacity: 0.07,
        strokeColor: '#c5b397',
        strokeOpacity: 1,
        strokeWeight: 2,
        clickable: false,
        editable: false,
        zIndex: 1
    }

    removeLayer$ = new Subject()
    map = React.createRef()

    state = {
        mapId: null,
        mapContext: null,
        zooming: false,
        metersPerPixel: null,
    }

    // Linking

    isLinked() {
        const {linked} = this.props
        return linked
    }

    setLinked(linked) {
        const {recipePath} = this.props
        actionBuilder('TOGGLE_LINKED')
            .set([recipePath, 'ui.map.linked'], linked)
            .dispatch()
    }

    toggleLinked() {
        const {linked: wasLinked} = this.props
        const linked = !wasLinked
        this.setLinked(linked)
    }

    // Zooming

    getZoom() {
        const {googleMap} = this.state
        return googleMap.getZoom()
    }

    setZoom(zoom) {
        const {googleMap} = this.state
        return googleMap.setZoom(zoom)
    }

    zoomIn() {
        const {googleMap} = this.state
        googleMap.setZoom(Math.min(googleMap.maxZoom, googleMap.getZoom() + 1))
    }

    zoomOut() {
        const {googleMap} = this.state
        googleMap.setZoom(Math.max(googleMap.minZoom, googleMap.getZoom() - 1))
    }

    isMaxZoom() {
        const {googleMap} = this.state
        return googleMap.getZoom() === googleMap.maxZoom
    }

    isMinZoom() {
        const {googleMap} = this.state
        return googleMap.getZoom() === googleMap.minZoom
    }

    getMetersPerPixel() {
        const {googleMap} = this.state
        const latitude = googleMap.getCenter().lat()
        const zoom = googleMap.getZoom()
        return Math.round(
            156543.03392 * Math.cos(latitude * Math.PI / 180) / Math.pow(2, zoom)
        )
    }

    // used by mapToolbar
    zoomArea() {
        const {google, googleMap} = this.state
        this.setState({zooming: true})
        this._drawingManager = new google.maps.drawing.DrawingManager({
            drawingMode: google.maps.drawing.OverlayType.RECTANGLE,
            drawingControl: false,
            rectangleOptions: this.drawingOptions
        })
        const drawingListener = e => {
            const rectangle = e.overlay
            rectangle.setMap(null)
            googleMap.fitBounds(rectangle.bounds)
            this.cancelZoomArea()
        }
        google.maps.event.addListener(this._drawingManager, 'overlaycomplete', drawingListener)
        this._drawingManager.setMap(googleMap)

    }

    // used by mapToolbar
    cancelZoomArea() {
        this.setState({zooming: false})
        this.disableDrawingMode()
    }

    // used by mapToolbar, chartPixelButton
    isZooming() {
        const {zooming} = this.state
        return zooming
    }

    // Bounds

    // user by polygonLayer
    fromGoogleBounds(googleBounds) {
        const sw = googleBounds.getSouthWest()
        const ne = googleBounds.getNorthEast()
        return [
            [sw.lng(), sw.lat()],
            [ne.lng(), ne.lat()]
        ]
    }

    // used here
    toGoogleBounds(bounds) {
        const {google} = this.state
        return new google.maps.LatLngBounds(
            {lng: bounds[0][0], lat: bounds[0][1]},
            {lng: bounds[1][0], lat: bounds[1][1]}
        )
    }

    // used by aoi, map, collectPanel
    fitBounds(bounds, padding) {
        const {googleMap} = this.state
        const nextBounds = this.toGoogleBounds(bounds)
        const currentBounds = googleMap.getBounds()
        const boundsChanged = !currentBounds || !currentBounds.equals(nextBounds)
        if (boundsChanged) {
            googleMap.fitBounds(nextBounds, padding)
        }
    }

    // user by aoi, map
    getBounds() {
        const {googleMap} = this.state
        return this.fromGoogleBounds(googleMap.getBounds())
    }

    // used by this
    addListener(event, listener) {
        const {google, googleMap} = this.state
        const listenerId = googleMap.addListener(event, listener)
        return {
            removeListener: () => google.maps.event.removeListener(listenerId)
        }
    }

    // used by map
    onCenterChanged(listener) {
        return this.addListener('center_changed', listener)
    }

    // used by map
    onZoomChanged(listener) {
        return this.addListener('zoom_changed', listener)
    }

    // used by earthEngineLayer, map
    onBoundsChanged(listener) {
        return this.addListener('bounds_changed', listener)
    }

    // Layers

    getLayer(id) {
        return this.layerById[id]
    }

    // used by MANY
    setLayer({id, layer, destroy$ = NEVER, onInitialized, onError}) {
        const existingLayer = this.getLayer(id)
        const unchanged = layer === existingLayer || (existingLayer && existingLayer.equals(layer))
        if (unchanged) {
            return false
        }
        this.removeLayer(id)
        if (layer) {
            this.layerById[id] = layer
            layer.initialize$().pipe(
                takeUntil(destroy$),
                takeUntil(this.removeLayer$.pipe(
                    filter(layerId => layerId === id),
                ))
            ).subscribe(
                () => {
                    layer.__initialized__ = true
                    layer.addToMap()
                    onInitialized && onInitialized(layer)
                },
                error => onError
                    ? onError(error)
                    : Notifications.error({message: msg('map.layer.error'), error})
            )
        }
        return true
    }

    // used by MANY
    hideLayer(id, hidden) {
        const layer = this.getLayer(id)
        if (layer) {
            layer.hide(hidden)
        }
    }

    // used by MANY
    removeLayer(id) {
        const layer = this.getLayer(id)
        if (layer) {
            this.removeLayer$.next(id)
            layer.removeFromMap()
            delete this.getLayer(id)
        }
    }

    // used by mapToolbar
    isLayerInitialized(id) {
        const layer = this.getLayer(id)
        return !!(layer && layer.__initialized__)
    }

    // used by layersMenu
    toggleableLayers() {
        return _.orderBy(Object.values(this.layerById).filter(layer => layer.toggleable), ['layerIndex'])
    }

    // used by MANY
    fitLayer(id) {
        const layer = this.getLayer(id)
        if (layer && layer.bounds) {
            this.fitBounds(layer.bounds)
        }
    }

    // used by polygonSection
    drawPolygon(id, callback) {
        const {google, googleMap} = this.state
        this._drawingPolygon = {id, callback}
        this._drawingManager = this._drawingManager || new google.maps.drawing.DrawingManager({
            drawingMode: google.maps.drawing.OverlayType.POLYGON,
            drawingControl: false,
            drawingControlOptions: {
                position: google.maps.ControlPosition.TOP_CENTER,
                drawingModes: ['polygon']
            },
            circleOptions: this.drawingOptions,
            polygonOptions: this.drawingOptions,
            rectangleOptions: this.drawingOptions
        })
        const drawingListener = e => {
            const polygon = e.overlay
            polygon.setMap(null)
            const toPolygonPath = polygon => polygon.getPaths().getArray()[0].getArray().map(latLng =>
                [latLng.lng(), latLng.lat()]
            )
            callback(toPolygonPath(polygon))
        }
        google.maps.event.addListener(this._drawingManager, 'overlaycomplete', drawingListener)
        this._drawingManager.setMap(googleMap)
    }

    // used by polygonSection
    disableDrawingMode() {
        const {google} = this.state
        if (this._drawingManager) {
            this._drawingManager.setMap(null)
            google.maps.event.clearListeners(this._drawingManager, 'overlaycomplete')
            this._drawingPolygon = null
        }
    }

    // used by chartPixelButton
    onOneClick(listener) {
        const {google, googleMap} = this.state
        googleMap.setOptions({draggableCursor: 'pointer'})
        const instances = [
            googleMap,
            ...Object.values(this.layerById)
                .filter(instance => instance.type === 'PolygonLayer')
                .map(({layer}) => layer)
        ]
        instances.forEach(instance => {
            google.maps.event.addListener(instance, 'click', ({latLng}) => {
                listener({lat: latLng.lat(), lng: latLng.lng()})
                this.clearClickListeners()
            })
        })
    }

    // used by referenceDataLayer
    onClick(listener) {
        const {google, googleMap} = this.state
        googleMap.setOptions({draggableCursor: 'pointer'})
        const instances = [
            googleMap,
            ...Object.values(this.layerById)
                .filter(instance => instance.type === 'PolygonLayer')
                .map(({layer}) => layer)
        ]
        instances.forEach(instance => {
            google.maps.event.addListener(instance, 'click', ({latLng}) => {
                listener({lat: latLng.lat(), lng: latLng.lng()})
            })
        })
    }

    // used by chartPixelButton, referenceDataLayer
    clearClickListeners() {
        const {google, googleMap} = this.state
        googleMap.setOptions({draggableCursor: null})
        const instances = [
            googleMap,
            ...Object.values(this.layerById)
                .filter(({type}) => type === 'PolygonLayer')
                .map(({layer}) => layer)
        ]
        instances.forEach(instance => google.maps.event.clearListeners(instance, 'click'))
    }

    render() {
        const {linked, children} = this.props
        const {google, googleMapsApiKey, norwayPlanetApiKey, googleMap, sepalMap, toggleLinked, metersPerPixel} = this.state
        const mapContext = {google, googleMapsApiKey, norwayPlanetApiKey, googleMap, sepalMap}
        return (
            <Provider value={{mapContext, linked, toggleLinked, metersPerPixel}}>
                <div ref={this.map} className={styles.map}/>
                <div className={styles.content}>
                    {sepalMap ? children : null}
                </div>
            </Provider>
        )
    }

    updateScale(metersPerPixel) {
        this.setState({metersPerPixel})
    }

    componentDidMount() {
        const {mapsContext: {createMapContext}, single} = this.props
        const {mapId, google, googleMapsApiKey, norwayPlanetApiKey, googleMap, bounds$, updateBounds, requestBounds} = createMapContext(this.map.current)

        const sepalMap = {
            getZoom: this.getZoom.bind(this),
            setZoom: this.setZoom.bind(this),
            zoomIn: this.zoomIn.bind(this),
            zoomOut: this.zoomOut.bind(this),
            isMaxZoom: this.isMaxZoom.bind(this),
            isMinZoom: this.isMinZoom.bind(this),
            getMetersPerPixel: this.getMetersPerPixel.bind(this),
            zoomArea: this.zoomArea.bind(this),
            cancelZoomArea: this.cancelZoomArea.bind(this),
            isZooming: this.isZooming.bind(this),
            fromGoogleBounds: this.fromGoogleBounds.bind(this),
            toGoogleBounds: this.toGoogleBounds.bind(this),
            fitBounds: this.fitBounds.bind(this),
            getBounds: this.getBounds.bind(this),
            onCenterChanged: this.onCenterChanged.bind(this),
            onZoomChanged: this.onZoomChanged.bind(this),
            onBoundsChanged: this.onBoundsChanged.bind(this),
            getLayer: this.getLayer.bind(this),
            setLayer: this.setLayer.bind(this),
            hideLayer: this.hideLayer.bind(this),
            removeLayer: this.removeLayer.bind(this),
            isLayerInitialized: this.isLayerInitialized.bind(this),
            toggleableLayers: this.toggleableLayers.bind(this),
            fitLayer: this.fitLayer.bind(this),
            drawPolygon: this.drawPolygon.bind(this),
            disableDrawingMode: this.disableDrawingMode.bind(this),
            onClick: this.onClick.bind(this),
            onOneClick: this.onOneClick.bind(this),
            clearClickListeners: this.clearClickListeners.bind(this),
            toggleLinked: this.toggleLinked.bind(this)
        }

        this.setState({mapId, google, googleMapsApiKey, norwayPlanetApiKey, googleMap, sepalMap}, () => {
            this.subscribe({bounds$, updateBounds, requestBounds})
            this.setLinked(single)
        })
    }

    componentDidUpdate(prevProps) {
        const {linked} = this.props
        const {linked: wasLinked} = prevProps
        if (linked && !wasLinked) {
            this.requestBounds$.next()
        } else {
            this.updateBounds$.next()
        }
    }

    componentWillUnmount() {
        this.unsubscribe()
    }

    subscribe({bounds$, updateBounds, requestBounds}) {
        const {addSubscription} = this.props

        this.centerChanged = this.onCenterChanged(() => {
            this.updateScale(this.getMetersPerPixel())
            this.updateBounds$.next()
        })

        this.zoomChanged = this.onZoomChanged(() => {
            this.updateScale(this.getMetersPerPixel())
            this.updateBounds$.next()
        })

        const {googleMap} = this.state
        addSubscription(
            bounds$.subscribe(
                bounds => {
                    const {linked} = this.props
                    if (bounds && linked) {
                        const {center, zoom} = bounds
                        const currentCenter = googleMap.getCenter()
                        const currentZoom = googleMap.getZoom()
                        if (!currentCenter || !currentCenter.equals(center)) {
                            googleMap.setCenter(center)
                        }
                        if (!currentZoom || currentZoom !== zoom) {
                            googleMap.setZoom(zoom)
                        }
                    }
                }
            ),
            this.updateBounds$.subscribe(
                () => {
                    const {linked} = this.props
                    if (linked) {
                        const center = googleMap.getCenter()
                        const zoom = googleMap.getZoom()
                        if (center && zoom) {
                            updateBounds({center, zoom})
                        }
                    }
                }
            ),
            this.requestBounds$.subscribe(
                () => requestBounds()
            )
        )
    }

    unsubscribe() {
        this.boundsChanged && this.boundChanged.removeListener()
        this.centerChanged && this.centerChanged.removeListener()
        this.zoomChanged && this.zoomChanged.removeListener()
    }
}

export const Map = compose(
    _Map,
    connect(mapStateToProps),
    withRecipePath(),
    withMapsContext(),
    withSubscriptions()
)

Map.propTypes = {
    recipeId: PropTypes.string.isRequired,
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
