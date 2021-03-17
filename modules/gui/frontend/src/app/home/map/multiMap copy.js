// import {NEVER, Subject} from 'rxjs'
// import {Provider} from './mapContext'
// import {SplitContent} from 'widget/splitContent'
// import {compose} from 'compose'
// import {connect} from 'store'
// import {debounceTime, filter, finalize, takeUntil} from 'rxjs/operators'
// import {getLogger} from 'log'
// import {getProcessTabsInfo} from '../body/process/process'
// import {mapBoundsTag, mapTag} from 'tag'
// import {msg} from 'translate'
// import {withMapsContext} from './maps'
// import Notifications from 'widget/notifications'
// import PropTypes from 'prop-types'
// import React from 'react'
// import _ from 'lodash'
// import styles from './map.module.css'
// import withSubscriptions from 'subscription'

// const log = getLogger('map')

// class _MultiMap extends React.Component {

//     state = {}

//     areaRefs = {
//         'center': React.createRef(),
//         'top': React.createRef(),
//         'top-right': React.createRef(),
//         'right': React.createRef(),
//         'bottom-right': React.createRef(),
//         'bottom': React.createRef(),
//         'bottom-left': React.createRef(),
//         'left': React.createRef(),
//         'top-left': React.createRef()
//     }

//     areas = [{
//         content: <div ref={this.areaRefs['center'].current} className={styles.map}/>,
//         placement: 'center'
//     }]

//     maps = {}

//     // Split

//     split(areas) {
//         this.setState({areas})
//     }

//     allMaps(callback) {
//         _.forEach(this.maps, (map, area) => {
//             log.info('allMaps', map)
//             callback(map, area)
//         })
//     }

//     firstMap(callback) {
//         const map = _.head(_.values(this.maps))
//         if (map) {
//             return callback(map)
//         }
//         return
//     }

//     selectedMap(callback) {
//         console.log('selectedMap', this.firstMap())
//         return this.firstMap(callback) // temporary
//     }

//     // Linking

//     setLinked(linked) {
//         this.allMaps(map => map.setLinked(linked))
//     }

//     toggleLinked() {
//         this.allMaps(map => map.toggleLinked())
//         // const {linked: wasLinked} = this.state
//         // const linked = !wasLinked
//         // this.setLinked(linked)
//     }

//     // Zooming

//     getZoom() {
//         return this.firstMap(map => map.getZoom())
//     }

//     setZoom(zoom) {
//         this.allMaps(map => map.setZoom(zoom))
//     }

//     zoomIn() {
//         this.allMaps(map => map.zoomIn())
//     }

//     zoomOut() {
//         this.allMaps(map => map.zoomOut())
//     }

//     isMaxZoom() {
//         return this.firstMap(map => map.isMaxZoom())
//     }

//     isMinZoom() {
//         return this.firstMap(map => map.isMinZoom())
//     }

//     getMetersPerPixel() {
//         return this.firstMap(map => map.getMetersPerPixel())
//     }

//     zoomArea() {
//         // const {google, googleMap} = this.state
//         // this.setState({zoomArea: true})
//         // this._drawingManager = new google.maps.drawing.DrawingManager({
//         //     drawingMode: google.maps.drawing.OverlayType.RECTANGLE,
//         //     drawingControl: false,
//         //     rectangleOptions: this.drawingOptions
//         // })
//         // const drawingListener = e => {
//         //     const rectangle = e.overlay
//         //     rectangle.setMap(null)
//         //     googleMap.fitBounds(rectangle.bounds)
//         //     this.cancelZoomArea()
//         // }
//         // google.maps.event.addListener(this._drawingManager, 'overlaycomplete', drawingListener)
//         // this._drawingManager.setMap(googleMap)
//     }

//     cancelZoomArea() {
//         // this.setState({zoomArea: false})
//         // this.disableDrawingMode()
//     }

//     // Bounds

//     fromGoogleBounds(googleBounds) {
//         const sw = googleBounds.getSouthWest()
//         const ne = googleBounds.getNorthEast()
//         return [
//             [sw.lng(), sw.lat()],
//             [ne.lng(), ne.lat()]
//         ]
//     }

//     toGoogleBounds(bounds) {
//         const {google} = this.state
//         return new google.maps.LatLngBounds(
//             {lng: bounds[0][0], lat: bounds[0][1]},
//             {lng: bounds[1][0], lat: bounds[1][1]}
//         )
//     }

//     fitBounds(bounds, padding = 0) {
//         this.allMaps(map => map.fitBounds(bounds, padding))
//     }

//     getBounds() {
//         return this.firstMap(map => map.getBounds())
//     }

//     // addListener(event, listener) {
//     //     const {google, googleMap} = this.state
//     //     const listenerId = googleMap.addListener(event, listener)
//     //     return {
//     //         remove: () => google.maps.event.removeListener(listenerId)
//     //     }
//     // }

//     // Layers

//     getLayer(id) {
//         return this.selectedMap(map => map.getLayer(id))
//         // return this.layerById[id]
//     }

//     // used by MANY
//     setLayer({id, layer, destroy$ = NEVER, onInitialized, onError}) {
//         return this.selectedMap(map => map.setLayer({id, layer, destroy$, onInitialized, onError}))
//     }

//     // listLayers() {
//     //     return Object.values(this.layerById)
//     // }

//     hideLayer(id, hidden) {
//         this.selectedMap(map => map.hideLayer(id, hidden))
//     }

//     removeLayer(id) {
//         this.selectedMap(map => map.removeLayer(id))
//     }

//     // setVisibility(visible) {
//     //     log.debug(`Visibility ${visible ? 'on' : 'off'}`)
//     //     _.forEach(this.layerById, (layer, id) =>
//     //         layer.hide(visible ? this.hiddenLayerById[id] : true)
//     //     )
//     // }

//     isLayerInitialized(id) {
//         return this.selectedMap(map => map.isLayerInitialized(id))
//     }

//     toggleableLayers() {
//         return this.selectedMap(map => map.toggleableLayers())
//     }

//     fitLayer(id) {
//         this.selectedMap(map => map.fitLayer(id))
//     }

//     drawPolygon(id, callback) {
//         // const {google, googleMap} = this.state
//         // this._drawingPolygon = {id, callback}
//         // this._drawingManager = this._drawingManager || new google.maps.drawing.DrawingManager({
//         //     drawingMode: google.maps.drawing.OverlayType.POLYGON,
//         //     drawingControl: false,
//         //     drawingControlOptions: {
//         //         position: google.maps.ControlPosition.TOP_CENTER,
//         //         drawingModes: ['polygon']
//         //     },
//         //     circleOptions: this.drawingOptions,
//         //     polygonOptions: this.drawingOptions,
//         //     rectangleOptions: this.drawingOptions
//         // })
//         // const drawingListener = e => {
//         //     const polygon = e.overlay
//         //     polygon.setMap(null)
//         //     const toPolygonPath = polygon => polygon.getPaths().getArray()[0].getArray().map(latLng =>
//         //         [latLng.lng(), latLng.lat()]
//         //     )
//         //     callback(toPolygonPath(polygon))
//         // }
//         // google.maps.event.addListener(this._drawingManager, 'overlaycomplete', drawingListener)
//         // this._drawingManager.setMap(googleMap)
//     }

//     disableDrawingMode() {
//         // const {google} = this.state
//         // if (this._drawingManager) {
//         //     this._drawingManager.setMap(null)
//         //     google.maps.event.clearListeners(this._drawingManager, 'overlaycomplete')
//         //     this._drawingPolygon = null
//         // }
//     }

//     onOneClick(listener) {
//         // const {google, googleMap} = this.state
//         // googleMap.setOptions({draggableCursor: 'pointer'})
//         // const instances = [
//         //     googleMap,
//         //     ...Object.values(this.layerById)
//         //         .filter(instance => instance.type === 'PolygonLayer')
//         //         .map(({layer}) => layer)
//         // ]
//         // instances.forEach(instance => {
//         //     google.maps.event.addListener(instance, 'click', ({latLng}) => {
//         //         listener({lat: latLng.lat(), lng: latLng.lng()})
//         //         this.clearClickListeners()
//         //     })
//         // })
//     }

//     onClick(listener) {
//         // const {google, googleMap} = this.state
//         // googleMap.setOptions({draggableCursor: 'pointer'})
//         // const instances = [
//         //     googleMap,
//         //     ...Object.values(this.layerById)
//         //         .filter(instance => instance.type === 'PolygonLayer')
//         //         .map(({layer}) => layer)
//         // ]
//         // instances.forEach(instance => {
//         //     google.maps.event.addListener(instance, 'click', ({latLng}) => {
//         //         listener({lat: latLng.lat(), lng: latLng.lng()})
//         //     })
//         // })
//     }

//     clearClickListeners() {
//         // const {google, googleMap} = this.state
//         // googleMap.setOptions({draggableCursor: null})
//         // const instances = [
//         //     googleMap,
//         //     ...Object.values(this.layerById)
//         //         .filter(({type}) => type === 'PolygonLayer')
//         //         .map(({layer}) => layer)
//         // ]
//         // instances.forEach(instance => google.maps.event.clearListeners(instance, 'click'))
//     }

//     render() {
//         log.info('render')
//         const {children} = this.props
//         const {google, googleMapsApiKey, norwayPlanetApiKey, googleMap, map, metersPerPixel, linked, zoomArea} = this.state
//         log.info('google', google)

//         const mapContext = {google, googleMapsApiKey, norwayPlanetApiKey, googleMap, map}

//         return (
//             <Provider value={{mapContext, linked, metersPerPixel, zoomArea}}>
//                 {/* <div ref={this.map} className={styles.map}/> */}
//                 <div className={styles.content}>
//                     {map ? children : null}
//                     {/* <SplitContent
//                         areas={this.areas}
//                     /> */}
//                 </div>
//             </Provider>
//         )
//     }

//     updateScale(metersPerPixel) {
//         this.setState({metersPerPixel})
//     }

//     initializeMaps() {
//         const {mapsContext: {createGoogleMap}} = this.props

//         _.forEach(this.areas, area => {
//             if (!area.googleMap) {
//                 log.info('creating google map for area', area.placement)
//                 this.maps[area.placement] = createGoogleMap(this.areaRefs[area.placement])
//             }
//         })
//     }

//     componentDidMount() {
//         log.info('componentDidMount')

//         const {mapsContext: {createGoogleMap, createMapContext}, onEnable, onDisable} = this.props

//         // const googleMap = createGoogleMap(this.map.current)
//         const {mapId, google, googleMapsApiKey, norwayPlanetApiKey, bounds$, updateBounds, notifyLinked} = createMapContext()

//         this.initializeMaps()

//         const map = {
//             fitBounds: this.fitBounds.bind(this),                       // collectPanel, aoi
//             getBounds: this.getBounds.bind(this),                       // aoi, mapLayer
//             getZoom: this.getZoom.bind(this),                           // aoi, sceneAreas, mapLayer
//             setZoom: this.setZoom.bind(this),                           // aoi
//             zoomIn: this.zoomIn.bind(this),                             // mapToolbar
//             zoomOut: this.zoomOut.bind(this),                           // mapToolbar
//             isMaxZoom: this.isMaxZoom.bind(this),                       // mapToolbar
//             isMinZoom: this.isMinZoom.bind(this),                       // mapToolbar
//             zoomArea: this.zoomArea.bind(this),                         // mapToolbar
//             cancelZoomArea: this.cancelZoomArea.bind(this),             // mapToolbar
//             isLayerInitialized: this.isLayerInitialized.bind(this),     // mapToolbar
//             toggleLinked: this.toggleLinked.bind(this),                 // mapToolbar
//             fromGoogleBounds: this.fromGoogleBounds.bind(this),         // polygonLayer
//             setLayer: this.setLayer.bind(this),                         // MANY
//             hideLayer: this.hideLayer.bind(this),                       // MANY
//             removeLayer: this.removeLayer.bind(this),                   // MANY
//             fitLayer: this.fitLayer.bind(this),                         // MANY
//             toggleableLayers: this.toggleableLayers.bind(this),         // layersMenu
//             drawPolygon: this.drawPolygon.bind(this),                   // polygonSection
//             disableDrawingMode: this.disableDrawingMode.bind(this),     // polygonSection
//             onClick: this.onClick.bind(this),                           // referenceDataLayer
//             onOneClick: this.onOneClick.bind(this),                     // chartPixelButton
//             clearClickListeners: this.clearClickListeners.bind(this)    // chartPixelButton, referenceDataLayer
//         }

//         onEnable(() => this.setVisibility(true))
//         onDisable(() => this.setVisibility(false))

//         // this.setState({mapId, google, googleMapsApiKey, norwayPlanetApiKey, googleMap, map}, () => {
//         this.setState({mapId, google, googleMapsApiKey, norwayPlanetApiKey, map}, () => {
//             // this.subscribe({bounds$, updateBounds, notifyLinked})
//             this.setLinked(getProcessTabsInfo().single)
//         })
//     }

//     componentDidUpdate(prevProps, prevState) {
//         log.info('componentDidUpdate')

//         this.initializeMaps()

//         // const {linked} = this.state
//         // const {linked: wasLinked} = prevState
//         // if (!linked && wasLinked) {
//         //     this.linked$.next(false)
//         // } else {
//         //     if (linked && !wasLinked) {
//         //         this.linked$.next(true)
//         //     }
//         //     this.updateBounds$.next()
//         // }
//     }

//     componentWillUnmount() {
//         // this.listLayers().map(layer => layer.removeFromMap())
//         // this.unsubscribe()
//     }

//     subscribe({bounds$, updateBounds, notifyLinked}) {
//         const {addSubscription} = this.props

//         this.centerChangedListener = this.addListener('center_changed', () => {
//             this.updateScale(this.getMetersPerPixel())
//             this.updateBounds$.next()
//         })

//         this.zoomChangedListener = this.addListener('zoom_changed', () => {
//             this.updateScale(this.getMetersPerPixel())
//             this.updateBounds$.next()
//         })

//         const {googleMap} = this.state
//         addSubscription(
//             bounds$.subscribe(
//                 bounds => {
//                     const {linked} = this.state
//                     if (bounds && linked) {
//                         const {center, zoom} = bounds
//                         log.debug(`${mapTag(this.state.mapId)} received ${mapBoundsTag(bounds)}`)
//                         const currentCenter = googleMap.getCenter()
//                         const currentZoom = googleMap.getZoom()
//                         if (!currentCenter || !currentCenter.equals(center)) {
//                             googleMap.setCenter(center)
//                         }
//                         if (!currentZoom || currentZoom !== zoom) {
//                             googleMap.setZoom(zoom)
//                         }
//                     }
//                 }
//             ),
//             this.updateBounds$.pipe(
//                 debounceTime(50)
//             ).subscribe(
//                 () => {
//                     const {linked} = this.state
//                     if (linked) {
//                         const center = googleMap.getCenter()
//                         const zoom = googleMap.getZoom()
//                         if (center && zoom) {
//                             const bounds = {center, zoom}
//                             log.debug(`${mapTag(this.state.mapId)} reporting ${mapBoundsTag(bounds)}`)
//                             updateBounds(bounds)
//                         }
//                     }
//                 }
//             ),
//             this.linked$.pipe(
//                 finalize(() => notifyLinked(false))
//             ).subscribe(
//                 linked => {
//                     log.debug(`${mapTag(this.state.mapId)} ${linked ? 'linked' : 'unlinked'}`)
//                     notifyLinked(linked)
//                 }
//             )
//         )
//     }

//     unsubscribe() {
//         this.centerChangedListener && this.centerChangedListener.remove()
//         this.zoomChangedListener && this.zoomChangedListener.remove()
//     }
// }

// export const MultiMap = compose(
//     _MultiMap,
//     connect(),
//     withMapsContext(),
//     withSubscriptions()
// )

// MultiMap.propTypes = {
//     children: PropTypes.object,
//     className: PropTypes.string
// }
