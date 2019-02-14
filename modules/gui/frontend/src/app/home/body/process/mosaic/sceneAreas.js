import api from 'api'
import {getSource, RecipeActions} from 'app/home/body/process/mosaic/mosaicRecipe'
import {withRecipe} from 'app/home/body/process/recipeContext'
import {MapLayer, sepalMap} from 'app/home/map/map'
import {objectEquals, selectFrom} from 'collections'
import PropTypes from 'prop-types'
import React from 'react'
import {of, Subject} from 'rxjs'
import {map, takeUntil} from 'rxjs/operators'
import {msg} from 'translate'
import MapStatus from 'widget/mapStatus'
import SceneAreaMarker from './sceneAreaMarker'
import styles from './sceneAreas.module.css'

const mapRecipeToProps = recipe => {
    return {
        recipeId: recipe.id,
        initialized: selectFrom(recipe, 'ui.initialized'),
        sceneAreasShown: selectFrom(recipe, 'ui.sceneAreasShown'),
        sceneAreas: selectFrom(recipe, 'ui.sceneAreas'),
        aoi: selectFrom(recipe, 'model.aoi'),
        source: getSource(recipe)
    }
}

class SceneAreas extends React.Component {
    constructor(props) {
        super(props)
        const {aoi, source} = props
        this.recipeActions = RecipeActions(props.recipeId)
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
        this.props.asyncActionBuilder('LOAD_SCENE_AREAS',
            api.gee.sceneAreas$({aoi, source}).pipe(
                map(sceneAreas =>
                    this.recipeActions.setSceneAreas(sceneAreas)
                ),
                takeUntil(this.loadSceneArea$)
            ))
            .dispatch()
    }
}

SceneAreas.propTypes = {
    recipeId: PropTypes.string
}

export default withRecipe(mapRecipeToProps)(SceneAreas)

const setSceneAreaLayer = ({recipeId, component}) => {
    const layer = new SceneAreaLayer(component)
    sepalMap.getContext(recipeId).setLayer({
        id: 'sceneAreas',
        layer,
        destroy$: component.props.componentWillUnmount$
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
        if (!this.component.state.show && !this.component.props.componentWillUnmount$.isStopped)
            this.component.setState(prevState => ({...prevState, show: true}))
    }

    removeFromMap() {
        if (this.component.state.show && !this.component.props.componentWillUnmount$.isStopped)
            this.component.setState(prevState => ({...prevState, show: false}))
    }

    hide() {
        this.removeFromMap()
    }

    initialize$() {
        return of(this)
    }
}
