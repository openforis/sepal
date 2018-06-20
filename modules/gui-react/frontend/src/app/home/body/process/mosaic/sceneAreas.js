import {RecipeState} from 'app/home/body/process/mosaic/mosaicRecipe'
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
import {SceneSelectionType} from './mosaicRecipe'
import SceneAreaMarker from './sceneAreaMarker'
import styles from './sceneAreas.module.css'


const mapStateToProps = (state, ownProps) => {
    const recipe = RecipeState(ownProps.recipeId)
    return {
        initialized: recipe('ui.initialized'),
        sceneAreasShown: recipe('ui.sceneAreasShown'),
        aoi: recipe('aoi'),
        source: Object.keys(recipe('sources'))[0],
        sceneSelectionOptions: recipe('sceneSelectionOptions')
    }
}

class SceneAreas extends React.Component {
    state = {
        show: true
    }
    loadSceneArea$ = new Subject()

    render() {
        const {sceneAreasShown, action} = this.props
        if (this.renderable() && sceneAreasShown && this.state.show)
            return (
                <div>
                    {action('LOAD_SCENE_AREAS').dispatched
                        ? this.renderSceneAreas()
                        : <MapStatus message={msg('process.mosaic.sceneAreas.loading')}/>}
                </div>
            )
        else
            return null
    }

    renderSceneAreas() {
        const sceneAreas = this.state.sceneAreas
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
        const loadSceneAreas = this.renderable()
            && !objectEquals(this.props, prevProps, ['aoi', 'source'])
        if (loadSceneAreas)
            this.loadSceneAreas(aoi, source)
        setSceneAreaLayer({recipeId, component: this})
    }

    renderable() {
        const {aoi, source, sceneSelectionOptions: {type}} = this.props
        return aoi
            && source
            && type === SceneSelectionType.SELECT
    }

    loadSceneAreas(aoi, source) {
        this.loadSceneArea$.next()
        this.props.asyncActionBuilder('LOAD_SCENE_AREAS',
            backend.gee.sceneAreas$({aoi, source})
                .pipe(
                    map((e) => {
                        return this.setState((prevState) =>
                            ({...prevState, sceneAreas: this.toSceneAreas(e.response)})
                        )
                    }),
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
    const layer = component.renderable()
        ? new SceneAreaLayer(component)
        : null
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
