import {RecipeActions, RecipeState} from 'app/home/body/process/mosaic/mosaicRecipe'
import {google, MapLayer, sepalMap} from 'app/home/map/map'
import backend from 'backend'
import {objectEquals} from 'collections'
import PropTypes from 'prop-types'
import React from 'react'
import {of, Subject} from 'rxjs'
import {map, takeUntil} from 'rxjs/operators'
import {connect} from 'store'
import {msg} from 'translate'
import MapStatus from 'widget/mapStatus'
import SceneAreaMarker from './sceneAreaMarker'
import styles from './sceneAreas.module.css'

const mapStateToProps = (state, ownProps) => {
    const recipeState = RecipeState(ownProps.recipeId)
    return {
        initialized: recipeState('ui.initialized'),
        sceneAreasShown: recipeState('ui.sceneAreasShown'),
        sceneAreas: recipeState('ui.sceneAreas'),
        aoi: recipeState('aoi'),
        source: Object.keys(recipeState('sources'))[0]
    }
}

class SceneAreas extends React.Component {
    constructor(props) {
        super(props)
        const {aoi, source} = props
        this.recipeActions = new RecipeActions(props.recipeId)
        this.state = {
            show: true
        }
        this.loadSceneArea$ = new Subject()
        this.loadSceneAreas(aoi, source)
    }

    render() {
        const {sceneAreasShown, action} = this.props
        return (
            <React.Fragment>
                {action('LOAD_SCENE_AREAS').dispatched
                    ? sceneAreasShown && this.state.show ? this.renderSceneAreas() : null
                    : <MapStatus message={msg('process.mosaic.sceneAreas.loading')}/>}
            </React.Fragment>
        )
    }

    renderSceneAreas() {
        const sceneAreas = this.props.sceneAreas
        if (sceneAreas)
            return (
                <MapLayer className={styles.sceneAreas}>
                    {sceneAreas.map(sceneArea =>
                        <SceneAreaMarker
                            key={sceneArea.id}
                            recipeId={this.props.recipeId}
                            sceneAreaId={sceneArea.id}
                            center={sceneArea.center}
                            polygon={sceneArea.polygon}/>
                    )}
                </MapLayer>
            )
        else
            return null
    }

    componentDidUpdate(prevProps) {
        const {recipeId, aoi, source} = this.props
        const loadSceneAreas = !objectEquals(this.props, prevProps, ['aoi', 'source'])
        if (loadSceneAreas)
            this.loadSceneAreas(aoi, source)
        setSceneAreaLayer({recipeId, component: this})
    }

    loadSceneAreas(aoi, source) {
        this.loadSceneArea$.next()
        this.recipeActions.setSceneAreas(null).dispatch()
        this.recipeActions.setSelectedScenes(null).dispatch()
        this.props.asyncActionBuilder('LOAD_SCENE_AREAS',
            backend.gee.sceneAreas$({aoi, source}).pipe(
                map(e =>
                    this.recipeActions.setSceneAreas(
                        this.toSceneAreas(e.response)
                    )
                ),
                takeUntil(this.loadSceneArea$)
            ))
            .dispatch()
    }

    toSceneAreas(json) {
        return json.map(({polygon, sceneAreaId}) => {
            const gPolygon = new google.maps.Polygon({
                paths: polygon.map(([lat, lng]) =>
                    new google.maps.LatLng(lat, lng)),
                fillColor: '#000000',
                fillOpacity: 0.4,
                strokeColor: '#636363',
                strokeOpacity: 0.6,
                strokeWeight: 1
            })
            const bounds = new google.maps.LatLngBounds()
            gPolygon.getPaths().getArray().forEach((path) =>
                path.getArray().forEach((latLng) =>
                    bounds.extend(latLng)
                ))
            return {
                id: sceneAreaId,
                center: bounds.getCenter(),
                polygon: gPolygon,
            }
        })
    }
}

SceneAreas.propTypes = {
    recipeId: PropTypes.string
}

export default connect(mapStateToProps)(SceneAreas)

const setSceneAreaLayer = ({recipeId, component}) => {
    const layer = new SceneAreaLayer(component)
    sepalMap.getContext(recipeId).setLayer({
        id: 'sceneAreas',
        layer,
        destroy$: component.componentWillUnmount$
    })
}

class SceneAreaLayer {
    constructor(component) {
        this.component = component
    }

    equals(o) {
        return o && this.component === o.component
    }

    addToMap() {
        if (!this.component.state.show)
            this.component.setState(prevState => ({...prevState, show: true}))
    }

    removeFromMap() {
        if (this.component.state.show)
            this.component.setState(prevState => ({...prevState, show: false}))
    }

    hide() {
        this.removeFromMap()
    }

    initialize$() {
        return of(this)
    }
}
