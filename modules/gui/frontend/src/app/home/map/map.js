import {BehaviorSubject, ReplaySubject, Subject} from 'rxjs'
import {Content, SectionLayout} from 'widget/sectionLayout'
import {MapArea} from './mapArea'
import {MapAreaContext} from './mapAreaContext'
import {MapContext} from './mapContext'
import {SplitContent} from 'widget/splitContent'
import {compose} from 'compose'
import {connect} from 'store'
import {debounceTime, distinctUntilChanged, filter, finalize, first, switchMap} from 'rxjs/operators'
import {getLogger} from 'log'
import {getProcessTabsInfo} from '../body/process/process'
import {mapBoundsTag, mapTag} from 'tag'
import {recipePath} from '../body/process/recipe'
import {selectFrom} from 'stateUtils'
import {withMapsContext} from './maps'
import {withRecipe} from '../body/process/recipeContext'
import MapScale from './mapScale'
import MapToolbar from './mapToolbar'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'
import actionBuilder from '../../../action-builder'
import api from 'api'
import styles from './map.module.css'
import withSubscriptions from 'subscription'

const log = getLogger('map')

const mapRecipeToProps = recipe => ({
    layers: selectFrom(recipe, 'layers'),
    imageLayerSources: selectFrom(recipe, 'ui.imageLayerSources'),
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
        metersPerPixel: null,
        zoomArea: null,
        selectedZoomArea: null,
        linked: null
    }

    constructor() {
        super()
        this.toggleLinked = this.toggleLinked.bind(this)
        this.refCallback = this.refCallback.bind(this)
        this.mapDelegate = this.mapDelegate.bind(this)
        this.onMouseDown = this.onMouseDown.bind(this)
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
        const {map} = maps[area]
        return callback(map, area)
    }

    removeArea(area) {
        const {maps} = this.state
        const {map, listeners, subscriptions} = maps[area]
        const {google} = map.getGoogle()
        _.forEach(listeners, listener =>
            google.maps.event.removeListener(listener)
        )
        _.forEach(subscriptions, subscription =>
            subscription.unsubscribe()
        )
    }

    synchronizeOut(area, map) {
        const {center, zoom} = map.getView()
        this.allMaps(({map}) => map.setView({center, zoom}))
        this.updateScale(map.getMetersPerPixel())
        this.updateBounds$.next({center, zoom})
    }

    synchronizeIn({center, zoom}) {
        this.allMaps(({map}) => map.setView({center, zoom}))
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

    onMouseDown(area) {
        this.mouseDown$.next(area)
    }

    renderMap(source, layerConfig, area) {
        const {maps} = this.state
        const map = maps[area] && maps[area].map
        const updateLayerConfig = layerConfig => this.updateLayerConfig(layerConfig, area)
        return (
            <React.Fragment>
                <div
                    className={styles.map}
                    data-area={area}
                    ref={this.refCallback}
                    onMouseDown={() => this.mouseDown$.next(area)}
                />
                <MapAreaContext.Provider value={{area, updateLayerConfig}}>
                    <MapArea source={source} layerConfig={layerConfig} map={map}/>
                </MapAreaContext.Provider>
            </React.Fragment>
        )
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
            log.debug('Creating new area', area)
            const {mapsContext: {createSepalMap}} = this.props
            const map = createSepalMap(element)
            const {google, googleMap} = map.getGoogle()
            const listeners = [
                googleMap.addListener('center_changed', () => this.synchronizeOut(area, map)),
                googleMap.addListener('zoom_changed', () => this.synchronizeOut(area, map))
            ]

            const subscriptions = [
                this.mouseDown$.subscribe(mouseDownArea => {
                    const {zoomArea} = this.state
                    if (zoomArea) {
                        if (mouseDownArea == area) {
                            this.setState({selectedZoomArea: area})
                        } else {
                            map.cancelZoomArea()
                        }
                    }
                }),
                map.getZoomArea$().subscribe(() =>
                    this.zoomArea(false)
                )
            ]

            google.maps.event.addListenerOnce(googleMap, 'idle', () => {
                this.setState(({maps}) => ({maps: {...maps, [area]: {map, listeners, subscriptions}}}))
            })
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

    refCallback(element) {
        if (element) { // Hot-reload can cause it to be null
            const area = element.dataset.area
            this.createArea(area, element)
        }
    }

    render() {
        const {layers, imageLayerSources} = this.props
        const {googleMapsApiKey, norwayPlanetApiKey, metersPerPixel, linked, selectedZoomArea} = this.state

        const areas = _.map(layers.areas, (layer, area) => {
            const {sourceId, layerConfig} = layer.imageLayer
            const source = imageLayerSources.find(({id}) => id === sourceId)
            return ({
                placement: area,
                content: this.renderMap(source, layerConfig, area)
            })
        })

        const toggleLinked = this.toggleLinked
        // TODO: Maybe overkill. Requires proper cleanup of removed map areas too.
        //  Thinking is that the this.setState() is async, and we might not have got all at the same time
        return (
            <MapContext.Provider value={{
                map: this.mapDelegate(),
                googleMapsApiKey,
                norwayPlanetApiKey,
                toggleLinked,
                linked,
                metersPerPixel,
                areas
            }}>
                <SplitContent areas={areas} mode={layers.mode} maximize={layers.mode === 'stack' ? selectedZoomArea : null}>
                    <div className={styles.content}>
                        {this.isMapInitialized() ? this.renderRecipe() : null}
                    </div>
                </SplitContent>
            </MapContext.Provider>
        )
    }

    isMapInitialized() {
        const {layers} = this.props
        const {maps} = this.state
        return !_.isEmpty(maps) && _.isEqual(new Set(Object.keys(maps)), new Set(Object.keys(layers.areas)))
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

    updateScale(metersPerPixel) {
        this.setState({metersPerPixel})
    }

    updateLinked() {
        const {linked} = this.state
        this.linked$.next(linked)
    }

    componentDidMount() {
        const {stream, mapsContext: {createMapContext}, recipe, onEnable, onDisable} = this.props
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
        stream('LOAD_BOUNDS',
            this.mapInitialized$.pipe(
                filter(initialized => initialized),
                first(),
                switchMap(() => api.gee.recipeBounds$(recipe)),
            ),
            bounds => this.withFirstMap(map => bounds && map.fitBounds(bounds))
        )
    }

    componentDidUpdate() {
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
        const {maps: mapByArea} = this.state
        const maps = Object.values(mapByArea).map(({map}) => map)
        const map = maps[0]

        const isInizialized = () => map.isLayerInitialized('Aoi')

        return {
            canZoomIn: () => isInizialized() && !map.isMaxZoom(),
            zoomIn: () => map.zoomIn(),
            canZoomOut: () => isInizialized() && !map.isMinZoom(),
            zoomOut: () => map.zoomOut(),
            canZoomArea: () => isInizialized(),
            toggleZoomArea: () => this.zoomArea(!this.isZoomArea()),
            isZoomArea: () => this.isZoomArea(),
            canFit: () => isInizialized(),
            fit: () => map.fitLayer('Aoi'),
            getZoom: () => map.getZoom(),
            getBounds: () => map.getBounds(),
        }
    }
}

export const Map = compose(
    _Map,
    connect(),
    withMapsContext(),
    withRecipe(mapRecipeToProps),
    withSubscriptions()
)

Map.propTypes = {
    children: PropTypes.any,
    className: PropTypes.string
}
