// import {Provider} from './mapContext'
// import {Subject} from 'rxjs'
// import {compose} from 'compose'
// import {connect} from 'store'
// import {debounceTime, finalize} from 'rxjs/operators'
// import {getLogger} from 'log'
// import {getProcessTabsInfo} from '../body/process/process'
// import {mapBoundsTag, mapTag} from 'tag'
// import {withMapsContext} from './maps'
// import PropTypes from 'prop-types'
// import React from 'react'
// import _ from 'lodash'
// import styles from './map.module.css'
// import withSubscriptions from 'subscription'

// const log = getLogger('map')

// class _MultiMap extends React.Component {
//     updateBounds$ = new Subject()
//     linked$ = new Subject()

//     // map = React.createRef()
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

//     state = {
//         mapId: null,
//         mapContext: null,
//         metersPerPixel: null,
//         zoomArea: false,
//         linked: false
//     }

//     toggleLinked() {
//         const {linked: wasLinked} = this.state
//         const linked = !wasLinked
//         this.setState({linked})
//     }

//     addListener(event, listener) {
//         const {mapContext: {google, googleMap}} = this.state
//         const listenerId = googleMap.addListener(event, listener)
//         return {
//             remove: () => google.maps.event.removeListener(listenerId)
//         }
//     }

//     render() {
//         const {children} = this.props
//         const {mapContext, metersPerPixel, linked, zoomArea} = this.state
//         const toggleLinked = this.toggleLinked.bind(this)
//         return (
//             <Provider value={{mapContext, toggleLinked, linked, metersPerPixel, zoomArea}}>
//                 {/* <div ref={this.map} className={styles.map}/> */}
//                 <div className={styles.content}>
//                     {mapContext ? children : null}
//                 </div>
//             </Provider>
//         )
//     }

//     updateScale(metersPerPixel) {
//         this.setState({metersPerPixel})
//     }

//     initializeMaps() {
//         const {mapsContext: {createSepalMap}} = this.props
//         _.forEach(this.areas, area => {
//             if (!area.googleMap) {
//                 log.info('creating google map for area', area.placement)
//                 this.maps[area.placement] = createSepalMap(this.areaRefs[area.placement].current)
//             }
//         })
//     }

//     componentDidMount() {
//         const {mapsContext: {createSepalMap, createMapContext}, onEnable, onDisable} = this.props
//         const {mapId, google, googleMapsApiKey, norwayPlanetApiKey, bounds$, updateBounds, notifyLinked} = createMapContext()

//         this.initializeMaps()

//         const map = createSepalMap(this.map.current)
//         const {googleMap} = map.getGoogle()
//         const zoomArea$ = map.getZoomArea$()
//         const mapContext = {google, googleMapsApiKey, norwayPlanetApiKey, googleMap, map}

//         this.setState({mapId, mapContext, linked: getProcessTabsInfo().single}, () => {
//             this.subscribe({zoomArea$, bounds$, updateBounds, notifyLinked})
//             onEnable(() => map.setVisibility(true))
//             onDisable(() => map.setVisibility(false))
//         })
//     }

//     componentDidUpdate(prevProps, prevState) {
//         const {linked} = this.state
//         const {linked: wasLinked} = prevState
//         if (!linked && wasLinked) {
//             this.linked$.next(false)
//         } else {
//             if (linked && !wasLinked) {
//                 this.linked$.next(true)
//             }
//             this.updateBounds$.next()
//         }
//     }

//     componentWillUnmount() {
//         const {map} = this.state
//         map.removeAllLayers()
//         this.unsubscribe()
//     }

//     subscribe({zoomArea$, bounds$, updateBounds, notifyLinked}) {
//         const {mapContext: {googleMap, map}} = this.state
//         const {addSubscription} = this.props

//         this.centerChangedListener = this.addListener('center_changed', () => {
//             this.updateScale(map.getMetersPerPixel())
//             this.updateBounds$.next()
//         })

//         this.zoomChangedListener = this.addListener('zoom_changed', () => {
//             this.updateScale(map.getMetersPerPixel())
//             this.updateBounds$.next()
//         })

//         addSubscription(
//             zoomArea$.subscribe(
//                 zoomArea => this.setState({zoomArea})
//             ),
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
