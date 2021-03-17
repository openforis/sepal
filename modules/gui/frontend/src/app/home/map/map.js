import {Provider} from './mapContext'
import {Subject} from 'rxjs'
import {compose} from 'compose'
import {connect} from 'store'
import {debounceTime, finalize} from 'rxjs/operators'
import {getLogger} from 'log'
import {getProcessTabsInfo} from '../body/process/process'
import {mapBoundsTag, mapTag} from 'tag'
import {withMapsContext} from './maps'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'
import styles from './map.module.css'
import withSubscriptions from 'subscription'

const log = getLogger('map')

class _Map extends React.Component {
    updateBounds$ = new Subject()
    linked$ = new Subject()

    map = React.createRef()

    state = {
        mapId: null,
        sepalMap: null,
        googleMapsApiKey: null,
        norwayPlanetApiKey: null,
        metersPerPixel: null,
        zoomArea: false,
        linked: false
    }

    toggleLinked() {
        const {linked: wasLinked} = this.state
        const linked = !wasLinked
        this.setState({linked})
    }

    addListener(event, listener) {
        const {sepalMap} = this.state
        const {google, googleMap} = sepalMap.getGoogle()
        const listenerId = googleMap.addListener(event, listener)
        return {
            remove: () => google.maps.event.removeListener(listenerId)
        }
    }

    render() {
        const {children} = this.props
        const {sepalMap, googleMapsApiKey, norwayPlanetApiKey, metersPerPixel, linked, zoomArea} = this.state
        const toggleLinked = this.toggleLinked.bind(this)
        return (
            <Provider value={{sepalMap, googleMapsApiKey, norwayPlanetApiKey, toggleLinked, linked, metersPerPixel, zoomArea}}>
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
        const {mapsContext: {createSepalMap, createMapContext}, onEnable, onDisable} = this.props
        const {mapId, googleMapsApiKey, norwayPlanetApiKey, bounds$, updateBounds, notifyLinked} = createMapContext()
        const sepalMap = createSepalMap(this.map.current)
        const zoomArea$ = sepalMap.getZoomArea$()

        this.setState({
            mapId,
            sepalMap,
            googleMapsApiKey,
            norwayPlanetApiKey,
            linked: getProcessTabsInfo().single
        }, () => {
            this.subscribe({zoomArea$, bounds$, updateBounds, notifyLinked})
            onEnable(() => sepalMap.setVisibility(true))
            onDisable(() => sepalMap.setVisibility(false))
        })
    }

    componentDidUpdate(prevProps, prevState) {
        const {linked} = this.state
        const {linked: wasLinked} = prevState
        if (!linked && wasLinked) {
            this.linked$.next(false)
        } else {
            if (linked && !wasLinked) {
                this.linked$.next(true)
            }
            this.updateBounds$.next()
        }
    }

    componentWillUnmount() {
        const {sepalMap} = this.state
        sepalMap.removeAllLayers()
        this.unsubscribe()
    }

    subscribe({zoomArea$, bounds$, updateBounds, notifyLinked}) {
        const {sepalMap} = this.state
        const {addSubscription} = this.props
        const {googleMap} = sepalMap.getGoogle()

        this.centerChangedListener = this.addListener('center_changed', () => {
            this.updateScale(sepalMap.getMetersPerPixel())
            this.updateBounds$.next()
        })

        this.zoomChangedListener = this.addListener('zoom_changed', () => {
            this.updateScale(sepalMap.getMetersPerPixel())
            this.updateBounds$.next()
        })

        addSubscription(
            zoomArea$.subscribe(
                zoomArea => this.setState({zoomArea})
            ),
            bounds$.subscribe(
                bounds => {
                    const {linked} = this.state
                    if (bounds && linked) {
                        const {center, zoom} = bounds
                        log.debug(`${mapTag(this.state.mapId)} received ${mapBoundsTag(bounds)}`)
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
            this.updateBounds$.pipe(
                debounceTime(50)
            ).subscribe(
                () => {
                    const {linked} = this.state
                    if (linked) {
                        const center = googleMap.getCenter()
                        const zoom = googleMap.getZoom()
                        if (center && zoom) {
                            const bounds = {center, zoom}
                            log.debug(`${mapTag(this.state.mapId)} reporting ${mapBoundsTag(bounds)}`)
                            updateBounds(bounds)
                        }
                    }
                }
            ),
            this.linked$.pipe(
                finalize(() => notifyLinked(false))
            ).subscribe(
                linked => {
                    log.debug(`${mapTag(this.state.mapId)} ${linked ? 'linked' : 'unlinked'}`)
                    notifyLinked(linked)
                }
            )
        )
    }

    unsubscribe() {
        this.centerChangedListener && this.centerChangedListener.remove()
        this.zoomChangedListener && this.zoomChangedListener.remove()
    }
}

export const Map = compose(
    _Map,
    connect(),
    withMapsContext(),
    withSubscriptions()
)

Map.propTypes = {
    children: PropTypes.object,
    className: PropTypes.string
}
