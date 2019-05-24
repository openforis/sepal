import {Button} from 'widget/button'
import {MapLayer, googleMap, sepalMap} from 'app/home/map/map'
import {RecipeActions, SceneSelectionType, getSource} from 'app/home/body/process/mosaic/mosaicRecipe'
import {Subject, of} from 'rxjs'
import {activator} from 'widget/activation/activator'
import {enabled} from 'widget/enableWhen'
import {msg} from 'translate'
import {objectEquals} from 'collections'
import {select} from 'store'
import {selectFrom} from 'stateUtils'
import {takeUntil} from 'rxjs/operators'
import {withRecipe} from 'app/home/body/process/recipeContext'
import MapStatus from 'widget/mapStatus'
import Notifications from 'widget/notifications'
import PropTypes from 'prop-types'
import React from 'react'
import SceneAreaMarker from './sceneAreaMarker'
import api from 'api'
import styles from './sceneAreas.module.css'

const mapRecipeToProps = recipe => {
    const sceneSelectionType = selectFrom(recipe, 'model.sceneSelectionOptions.type')
    const manualSelection = sceneSelectionType === SceneSelectionType.SELECT
    return {
        recipeId: recipe.id,
        initialized: selectFrom(recipe, 'ui.initialized'),
        sceneAreasShown: selectFrom(recipe, 'ui.sceneAreasShown'),
        sceneAreas: selectFrom(recipe, 'ui.sceneAreas'),
        aoi: selectFrom(recipe, 'model.aoi'),
        source: getSource(recipe),
        selectedScenes: selectFrom(recipe, ['model.scenes']) || [],
        loading: selectFrom(recipe, 'ui.autoSelectingScenes'),
        zoom: select('map.zoom') || googleMap.getZoom(),
        manualSelection
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
        const {sceneAreasShown, stream} = this.props
        return (
            <React.Fragment>
                {stream('LOAD_SCENE_AREAS').completed && sceneAreasShown && this.state.show ? this.renderSceneAreas() : null}
                {stream('LOAD_SCENE_AREAS').dispatching && <MapStatus message={msg('process.mosaic.sceneAreas.loading')}/>}
            </React.Fragment>
        )
    }

    renderSceneAreaMarker(sceneArea) {
        const {recipeId, activator: {activatables: {sceneSelection}}, selectedScenes, zoom, loading} = this.props
        const selectedSceneCount = (selectedScenes[sceneArea.id] || []).length
        return (
            <SceneAreaMarker
                key={sceneArea.id}
                recipeId={recipeId}
                sceneAreaId={sceneArea.id}
                center={sceneArea.center}
                polygon={sceneArea.polygon}
                selectedSceneCount={selectedSceneCount}
                zoom={zoom}
                loading={loading}
                sceneSelection={sceneSelection}
            />
        )
    }

    renderSceneAreas() {
        const sceneAreas = this.props.sceneAreas
        if (sceneAreas)
            return (
                <MapLayer className={styles.sceneAreas}>
                    {sceneAreas.map(sceneArea => this.renderSceneAreaMarker(sceneArea))}
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
        this.props.stream('LOAD_SCENE_AREAS',
            api.gee.sceneAreas$({aoi, source}).pipe(
                takeUntil(this.loadSceneArea$)
            ),
            sceneAreas => this.recipeActions.setSceneAreas(sceneAreas).dispatch(),
            e => Notifications.error({
                title: msg('gee.error.title'),
                message: msg('process.mosaic.sceneAreas.error'),
                error: e.response ? msg(e.response.code, e.response.data) : null,
                timeout: 0,
                content: dismiss =>
                    <Button
                        look='transparent'
                        shape='pill'
                        icon='sync'
                        label={msg('button.retry')}
                        onClick={() => {
                            dismiss()
                            this.reload()
                        }}
                    />
            })

        )
    }
}

SceneAreas.propTypes = {
    recipeId: PropTypes.string
}

export default (
    withRecipe(mapRecipeToProps)(
        activator('sceneSelection')(
            enabled({when: ({manualSelection}) => manualSelection})(
                SceneAreas
            )
        )
    )
)

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
            this.component.setState({show: true})
    }

    removeFromMap() {
        if (this.component.state.show && !this.component.props.componentWillUnmount$.isStopped)
            this.component.setState({show: false})
    }

    hide() {
        this.removeFromMap()
    }

    initialize$() {
        return of(this)
    }
}
