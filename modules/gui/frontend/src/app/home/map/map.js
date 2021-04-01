import {MapArea} from './mapArea'
import {MapControls} from './mapControls'
import {MapInfo} from './mapInfo'
import {ReplaySubject} from 'rxjs'
import {SplitContent} from 'widget/splitContent'
import {Subject} from 'rxjs'
import {compose} from 'compose'
import {connect} from 'store'
import {debounceTime, distinctUntilChanged, finalize} from 'rxjs/operators'
import {getLogger} from 'log'
import {getProcessTabsInfo} from '../body/process/process'
import {mapBoundsTag, mapTag} from 'tag'
import {selectFrom} from '../../../stateUtils'
import {withContext} from 'context'
import {withMapsContext} from './maps'
import {withRecipe} from '../body/process/recipeContext'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'
import styles from './map.module.css'
import withSubscriptions from 'subscription'
const log = getLogger('map')

const MapContext = React.createContext()
const {Provider} = MapContext

export const withMap = withContext(MapContext)

const emptyLayer = {
    'left': {
        imageLayer: null,
        featureLayers: []
    },
    'top-right': {
        imageLayer: null,
        featureLayers: []
    },
    'bottom-right': {
        imageLayer: null,
        featureLayers: []
    }
}

const mapRecipeToProps = recipe => ({
    layers: selectFrom(recipe, 'layers') || emptyLayer
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

    renderMap(area) {
        return (
            <MapArea area={area} refCallback={element => this.createArea(area, element)}/>
        )
    }

    renderMapOverlay(area) {
        return (
            <div className={styles.mapOverlay}>
                <MapInfo/>
                <MapControls area={area}/>
            </div>
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
        const {layers, children} = this.props
        const {maps, googleMapsApiKey, norwayPlanetApiKey, metersPerPixel, linked, zoomArea} = this.state

        const areas = _.map(Object.keys(layers), area => ({
            placement: area,
            content: this.renderMap(area),
            view: this.renderMapOverlay(area)
        }))

        const map = Object.keys(maps).length ? Object.values(maps)[0].map : null

        const toggleLinked = this.toggleLinked

        return (
            <Provider value={{map, googleMapsApiKey, norwayPlanetApiKey, toggleLinked, linked, metersPerPixel, zoomArea, areas}}>
                <SplitContent areas={areas}/>
                {/* <SplitContent areaMap={areaMap}/> */}
                <div className={styles.content}>
                    {map ? children : null}
                </div>
            </Provider>
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
}

export const Map = compose(
    _Map,
    connect(),
    withMapsContext(),
    withRecipe(mapRecipeToProps),
    withSubscriptions()
)

Map.propTypes = {
    children: PropTypes.object,
    className: PropTypes.string
}
