import {BehaviorSubject, ReplaySubject, Subject} from 'rxjs'
import {Content, SectionLayout} from 'widget/sectionLayout'
import {MapAreaContext} from './mapAreaContext'
import {MapContext} from './mapContext'
import {SplitView} from 'widget/split/splitView'
import {VisParamsPanel} from './visParams/visParamsPanel'
import {compose} from 'compose'
import {connect} from 'store'
import {debounceTime, distinctUntilChanged, finalize} from 'rxjs/operators'
import {getImageLayerSource} from './imageLayerSource/imageLayerSource'
import {getLogger} from 'log'
import {getProcessTabsInfo} from '../body/process/process'
import {mapBoundsTag, mapTag} from 'tag'
import {recipePath} from '../body/process/recipe'
import {selectFrom} from 'stateUtils'
import {withLayers} from '../body/process/withLayers'
import {withMapsContext} from './maps'
import {withRecipe} from '../body/process/recipeContext'
import MapScale from './mapScale'
import MapToolbar from './mapToolbar'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'
import actionBuilder from 'action-builder'
import styles from './map.module.css'
import withSubscriptions from 'subscription'

const log = getLogger('map')

const mapRecipeToProps = recipe => ({
    bounds: selectFrom(recipe, 'ui.bounds'),
    recipe
})

class _Map extends React.Component {
    updateBounds$ = new Subject()
    linked$ = new ReplaySubject()
    mapInitialized$ = new BehaviorSubject()
    mouseDown$ = new Subject()

    state = {
        maps: {},
        areas: null,
        mapId: null,
        googleMapsApiKey: null,
        norwayPlanetApiKey: null,
        zoomArea: null,
        selectedZoomArea: null,
        linked: null,
    }

    constructor() {
        super()
        this.mapAreaRefCallback = this.mapAreaRefCallback.bind(this)
        this.mapDelegate = this.mapDelegate.bind(this)
    }

    allMaps(callback) {
        const {maps} = this.state
        _.forEach(maps, ({map, listeners, subscriptions}, area) => {
            callback({area, map, listeners, subscriptions})
        })
    }

    withFirstMap(callback) {
        const {maps} = this.state
        const area = _.head(_.keys(maps))
        const {map = null} = maps[area] || {}
        return map
            ? callback(map, area)
            : null
    }

    removeArea(area) {
        log.debug(`${mapTag(this.state.mapId)} removing area ${area}`)
        const {maps} = this.state
        const {map, listeners, subscriptions} = maps[area]
        const {google} = map.getGoogle()
        _.forEach(listeners, listener =>
            google.maps.event.removeListener(listener)
        )
        _.forEach(subscriptions, subscription =>
            subscription.unsubscribe()
        )
        this.setState(({maps}) => {
            const updatedMaps = {...maps}
            delete updatedMaps[area]
            return ({maps: updatedMaps})
        })
    }

    synchronizeOut(map) {
        const {center, zoom} = map.getView()
        this.allMaps(({map}) => map.setView({center, zoom}))
        this.updateBounds$.next({center, zoom})
    }

    synchronizeIn({center, zoom}) {
        this.allMaps(({map}) => map.setView({center, zoom}))
    }

    synchronizeCursor(area, latLng) {
        const {layers: {mode}} = this.props
        this.allMaps(({area: otherArea, map}) => {
            if (mode === 'grid') {
                otherArea !== area ? map.setCursor(latLng) : null
            } else {
                map.setCursor(null)
            }
        })
    }

    setVisibility(visible) {
        this.allMaps(({map}) => map.setVisibility(visible))
    }

    zoomArea(zoomArea) {
        this.setState({zoomArea, selectedZoomArea: null}, () => {
            this.allMaps(({map}) => zoomArea ? map.zoomArea() : map.cancelZoomArea())
        })
    }

    isZoomArea() {
        const {zoomArea} = this.state
        return zoomArea
    }

    renderImageLayerSource(source, layerConfig, area) {
        const {recipe} = this.props
        const {maps} = this.state
        const map = maps[area] && maps[area].map
        const updateLayerConfig = layerConfig => this.updateLayerConfig(layerConfig, area)

        const {component} = getImageLayerSource({recipe, source, layerConfig, map})

        return (
            <React.Fragment>
                <div
                    className={styles.map}
                    data-area={area}
                    ref={this.mapAreaRefCallback}
                    onMouseDown={() => this.mouseDown$.next(area)}
                />
                <MapAreaContext.Provider value={{area, updateLayerConfig}}>
                    <VisParamsPanel area={area} updateLayerConfig={updateLayerConfig}/>
                    {component}
                </MapAreaContext.Provider>
            </React.Fragment>
        )
    }

    mapAreaRefCallback(element) {
        if (element) {
            const area = element.dataset.area
            this.createArea(area, element)
        }
    }

    updateLayerConfig(layerConfig, area) {
        const {recipe} = this.props
        actionBuilder('UPDATE_LAYER_CONFIG', layerConfig)
            .set(
                [recipePath(recipe.id), 'layers.areas', area, 'imageLayer.layerConfig'],
                layerConfig
            )
            .dispatch()
    }

    createArea(area, element) {
        const {maps} = this.state
        if (!maps[area]) {
            log.debug(`${mapTag(this.state.mapId)} creating area ${area}`)
            const {mapsContext: {createSepalMap}} = this.props
            const map = createSepalMap(element)
            this.withFirstMap(firstMap => map.setView(firstMap.getView())) // Make sure a new map is synchronized
            const {googleMap} = map.getGoogle()
            const listeners = [
                googleMap.addListener('mouseout', () => this.synchronizeCursor(area, null)),
                googleMap.addListener('mousemove', ({latLng}) => this.synchronizeCursor(area, latLng)),
                googleMap.addListener('center_changed', () => this.synchronizeOut(map)),
                googleMap.addListener('zoom_changed', () => this.synchronizeOut(map))
            ]

            const subscriptions = [
                this.mouseDown$.subscribe(mouseDownArea => {
                    const {zoomArea, selectedZoomArea} = this.state
                    if (zoomArea) {
                        if (selectedZoomArea) {
                            if (mouseDownArea === area && selectedZoomArea !== area) {
                                this.zoomArea(false)
                            }
                        } else {
                            if (mouseDownArea === area) {
                                this.setState({selectedZoomArea: area})
                            } else {
                                map.cancelZoomArea()
                            }
                        }
                    }
                }),
                map.getZoomArea$().subscribe(() =>
                    this.zoomArea(false)
                )
            ]

            this.setState(({maps}) => ({maps: {...maps, [area]: {map, listeners, subscriptions}}}))
            // google.maps.event.addListenerOnce(googleMap, 'idle', () => {
            //     console.log('idle', area)
            //     this.setState(({maps}) => ({maps: {...maps, [area]: {map, listeners, subscriptions}}}))
            // })
        }
    }

    setLinked(linked) {
        this.setState({linked}, () => this.linked$.next(linked))
    }

    toggleLinked() {
        const {linked: wasLinked} = this.state
        const linked = !wasLinked
        this.setLinked(linked)
    }

    isLinked() {
        const {linked} = this.state
        return linked
    }

    render() {
        const {layers, imageLayerSources} = this.props
        const {googleMapsApiKey, norwayPlanetApiKey, selectedZoomArea} = this.state

        const areas = _.map(layers.areas, (layer, area) => {
            const {sourceId, layerConfig} = layer.imageLayer
            const source = imageLayerSources.find(({id}) => id === sourceId)
            return ({
                placement: area,
                content: this.renderImageLayerSource(source, layerConfig, area)
            })
        })

        // TODO: Maybe overkill. Requires proper cleanup of removed map areas too.
        //       Thinking is that the this.setState() is async, and we might not have got all at the same time
        return (
            <MapContext.Provider value={{
                map: this.mapDelegate(),
                googleMapsApiKey,
                norwayPlanetApiKey
            }}>
                <SplitView
                    areas={areas}
                    mode={layers.mode}
                    maximize={layers.mode === 'stack' ? selectedZoomArea : null}>
                    <div className={styles.content}>
                        {this.isMapInitialized() ? this.renderRecipe() : null}
                    </div>
                </SplitView>
            </MapContext.Provider>
        )
    }

    isMapInitialized() {
        const {maps} = this.state
        return !_.isEmpty(maps)
        // const {maps} = this.state
        // const {layers} = this.props
        // const initialized = !_.isEmpty(maps) && _.isEqual(new Set(Object.keys(maps)), new Set(Object.keys(layers.areas)))
        // console.log({initialized, maps: Object.keys(maps), areas: layers && layers.areas && Object.keys(layers.areas)})
        // return initialized
    }

    renderRecipe() {
        const {className, recipeContext: {statePath}, children} = this.props
        return (
            <SectionLayout>
                <Content>
                    <div className={className}>
                        <MapToolbar statePath={[statePath, 'ui']}/>
                        <MapScale/>
                        {children}
                    </div>
                </Content>
            </SectionLayout>
        )
    }

    componentDidMount() {
        const {mapsContext: {createMapContext}, onEnable, onDisable} = this.props
        const {mapId, googleMapsApiKey, norwayPlanetApiKey, bounds$, updateBounds, notifyLinked} = createMapContext()

        this.setLinked(getProcessTabsInfo().single)

        this.setState({
            mapId,
            googleMapsApiKey,
            norwayPlanetApiKey
        }, () => {
            this.subscribe({bounds$, updateBounds, notifyLinked})
            onEnable(() => this.setVisibility(true))
            onDisable(() => this.setVisibility(false))
        })
    }

    componentDidUpdate(prevProps) {
        const {layers: {areas: prevAreas}} = prevProps
        const {layers: {areas}} = this.props
        Object.keys(prevAreas)
            .filter(area => !Object.keys(areas).includes(area))
            .map(area => this.removeArea(area))

        if (this.isMapInitialized()) {
            this.mapInitialized$.next(true)
        }
    }

    componentWillUnmount() {
        this.allMaps(({area}) => {
            this.removeArea(area)
        })
    }

    subscribe({bounds$, updateBounds, notifyLinked}) {
        const {addSubscription} = this.props
        addSubscription(
            bounds$.subscribe(
                bounds => {
                    const {linked} = this.state
                    if (bounds && linked) {
                        log.debug(`${mapTag(this.state.mapId)} received ${mapBoundsTag(bounds)}`)
                        this.synchronizeIn(bounds)
                    }
                }
            ),
            this.updateBounds$.pipe(
                debounceTime(50),
                distinctUntilChanged()
            ).subscribe(
                ({center, zoom}) => {
                    const {linked} = this.state
                    if (linked) {
                        if (center && zoom) {
                            const bounds = {center, zoom}
                            log.debug(`${mapTag(this.state.mapId)} reporting ${mapBoundsTag(bounds)}`)
                            updateBounds(bounds)
                        }
                    }
                }
            ),
            this.linked$.pipe(
                distinctUntilChanged(),
                finalize(() => notifyLinked(false))
            ).subscribe(
                linked => {
                    log.debug(`${mapTag(this.state.mapId)} ${linked ? 'linked' : 'unlinked'}`)
                    notifyLinked(linked)
                }
            )
        )
    }

    mapDelegate() {
        const {bounds} = this.props
        const {maps: mapByArea} = this.state
        const maps = Object.values(mapByArea).map(({map}) => map)
        const map = maps[0]

        const isInitialized = () => bounds

        return {
            toggleLinked: () => this.toggleLinked(),
            isLinked: () => this.isLinked(),
            canZoomIn: () => !map.isMaxZoom(),
            zoomIn: () => map.zoomIn(),
            canZoomOut: () => !map.isMinZoom(),
            zoomOut: () => map.zoomOut(),
            canZoomArea: () => !map.isMaxZoom(),
            toggleZoomArea: () => this.zoomArea(!this.isZoomArea()),
            cancelZoomArea: () => this.zoomArea(false),
            isZoomArea: () => this.isZoomArea(),
            canFit: () => isInitialized(),
            fit: () => map.fitBounds(bounds),
            setZoom: zoom => map.setZoom(zoom),
            getZoom: () => map.getZoom(),
            getBounds: () => map.getBounds(),
            getScale: () => map.getMetersPerPixel(),

            setLayer: (...args) => {
                log.warn('should we call map.setLayer?')
                map.setLayer(...args)
            },
            getGoogle: (...args) => {
                log.warn('should we call map.getGoogle?')
                map.getGoogle(...args)
            },
            addToMap: (...args) => {
                log.warn('should we call map.addToMap?')
                map.addToMap(...args)
            },
            removeFromMap: (...args) => {
                log.warn('should we call map.removeToMap?')
                map.removeFromMap(...args)
            },
            fitBounds: (...args) => {
                log.warn('should we call map.fitBounds?')
                map.fitBounds(...args)
            }
        }
    }
}

export const Map = compose(
    _Map,
    connect(),
    withMapsContext(),
    // withRecipe(),
    withLayers(),
    withRecipe(mapRecipeToProps),
    withSubscriptions()
)

Map.propTypes = {
    children: PropTypes.any,
    className: PropTypes.string
}
