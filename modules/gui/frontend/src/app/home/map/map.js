import {Content, SectionLayout} from '../../../widget/sectionLayout'
import {MapArea} from './mapArea'
import {MapAreaContext} from './mapAreaContext'
import {MapContext} from './mapContext'
import {ReplaySubject, Subject} from 'rxjs'
import {SplitContent} from 'widget/splitContent'
import {compose} from 'compose'
import {connect} from 'store'
import {debounceTime, distinctUntilChanged, finalize} from 'rxjs/operators'
import {getLogger} from 'log'
import {getProcessTabsInfo} from '../body/process/process'
import {mapBoundsTag, mapTag} from 'tag'
import {selectFrom} from '../../../stateUtils'
import {withMapsContext} from './maps'
import {withRecipe} from '../body/process/recipeContext'
import MapScale from './mapScale'
import MapToolbar from './mapToolbar'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'
import styles from './map.module.css'
import withSubscriptions from 'subscription'

const log = getLogger('map')

const mapRecipeToProps = recipe => ({
    layers: selectFrom(recipe, 'layers'),
    imageLayerSources: selectFrom(recipe, 'ui.imageLayerSources')
})

class _Map extends React.Component {
    updateBounds$ = new Subject()
    linked$ = new ReplaySubject()

    state = {
        maps: {},
        areas: null,
        selectedArea: null,
        mapId: null,
        googleMapsApiKey: null,
        norwayPlanetApiKey: null,
        metersPerPixel: null,
        zoomArea: null,
        linked: null
    }

    constructor() {
        super()
        this.toggleLinked = this.toggleLinked.bind(this)
    }

    allMaps(callback) {
        const {maps} = this.state
        _.forEach(maps, ({map, listeners, subscriptions}, area) => {
            callback({area, map, listeners, subscriptions})
        })
    }

    // aMap(callback) {
    //     const {maps} = this
    //     const area = _.head(_.keys(maps))
    //     const map = maps[area]
    //     callback(map, area)
    // }

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
        this.allMaps(({map, area: currentArea}) => {
            if (currentArea !== area) {
                map.setView({center, zoom})
            }
        })
        this.updateScale(map.getMetersPerPixel())
        this.updateBounds$.next({center, zoom})
    }

    synchronizeIn({center, zoom}) {
        this.allMaps(({map}) => map.setView({center, zoom}))
    }

    setVisibility(visible) {
        this.allMaps(({map}) => map.setVisibility(visible))
    }

    renderMap(source, layerConfig, area) {
        const {maps} = this.state
        const map = maps[area] && maps[area].map
        const refCallback = element => this.createArea(area, element)
        return (
            <MapAreaContext.Provider value={{area, map, refCallback}}>
                <MapArea source={source} layerConfig={layerConfig} map={map}/>
            </MapAreaContext.Provider>
        )
    }

    createArea(area, element) {
        const {maps} = this.state
        if (!maps[area]) {
            log.debug('Creating new area', area)
            const {mapsContext: {createSepalMap}} = this.props
            const map = createSepalMap(element)
            const {googleMap} = map.getGoogle()

            const zoomArea$ = map.getZoomArea$()

            const listeners = [
                googleMap.addListener('center_changed', () => this.synchronizeOut(area, map)),
                googleMap.addListener('zoom_changed', () => this.synchronizeOut(area, map))
            ]

            const subscriptions = [
                zoomArea$.subscribe(zoomArea => this.setState({zoomArea}))
            ]

            maps[area] = {map, listeners, subscriptions}
            this.setState({maps})
        }
    }

    setSelected(selectedArea) {
        log.debug('selected area:', selectedArea)
        this.setState({selectedArea})
    }

    setLinked(linked) {
        this.setState({linked}, () => this.linked$.next(linked))
    }

    toggleLinked() {
        const {linked: wasLinked} = this.state
        const linked = !wasLinked
        this.setLinked(linked)
    }

    render() {
        const {layers, imageLayerSources, children} = this.props
        const {maps, googleMapsApiKey, norwayPlanetApiKey, metersPerPixel, linked, zoomArea} = this.state
        const areas = _.map(Object.keys(layers), area => {
            const {sourceId, layerConfig} = layers[area].imageLayer
            const source = imageLayerSources.find(({id}) => id === sourceId)

            return ({
                placement: area,
                content: this.renderMap(source, layerConfig, area)
            })
        })

        const toggleLinked = this.toggleLinked
        return (
            <MapContext.Provider value={{
                map: this.mapDelegate(),
                googleMapsApiKey,
                norwayPlanetApiKey,
                toggleLinked,
                linked,
                metersPerPixel,
                zoomArea,
                areas
            }}>
                <SplitContent areas={areas} mode='stack'/>
                <div className={styles.content}>
                    {_.isEmpty(maps) ? null : this.renderRecipe()}
                </div>
            </MapContext.Provider>
        )
    }

    renderRecipe() {
        const {className, recipeContext: {statePath}, children} = this.props
        return (
            <SectionLayout>
                <Content>
                    <div className={className}>
                        <MapToolbar statePath={[statePath, 'ui']} labelLayerIndex={3}/>
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
        const maps = Object.values(mapByArea)
            .map(({map}) => map)

        const map = maps[0]

        return {
            isMinZoom() {
                return map.isMinZoom()
            },
            isMaxZoom() {
                return map.isMaxZoom()
            },
            zoomIn() {
                return map.zoomIn()
            },
            zoomOut() {
                return map.zoomOut()
            },
            zoomArea() {
                // TODO: Different for non-grid layouts
                return map.zoomArea()
            },
            cancelZoomArea() {
                // TODO: Different for non-grid layouts
                return map.cancelZoomArea()
            },
            canFit() {
                return map.isLayerInitialized('Aoi')
            },
            fit() {
                return map.fitLayer('Aoi')
            }
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
