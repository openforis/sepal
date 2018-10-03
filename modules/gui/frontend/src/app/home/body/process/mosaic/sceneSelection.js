import {CenteredProgress} from 'widget/progress'
import {Field, form} from 'widget/form'
import {Msg, msg} from 'translate'
import {Panel, PanelHeader} from 'widget/panel'
import {RecipeActions, RecipeState, recipePath} from 'app/home/body/process/mosaic/mosaicRecipe'
import {dataSetById} from 'sources'
import {map} from 'rxjs/operators'
import {objectEquals} from 'collections'
import Icon from 'widget/icon'
import PanelButtons from 'widget/panelButtons'
import PropTypes from 'prop-types'
import React from 'react'
import ReactResizeDetector from 'react-resize-detector'
import ScenePreview from 'app/home/body/process/mosaic/scenePreview'
import api from 'api'
import styles from './sceneSelection.module.css'
import format from 'format'
import { Button } from '../../../../../widget/button';

const fields = {
    selectedScenes: new Field()
}

const mapStateToProps = (state, ownProps) => {
    const {recipeId, sceneAreaId} = ownProps
    const recipeState = RecipeState(recipeId)
    const selectedScenes = recipeState(['model.scenes', sceneAreaId]) || []
    return {
        sources: recipeState('model.sources'),
        dates: recipeState('model.dates'),
        sceneSelectionOptions: recipeState('model.sceneSelectionOptions'),
        values: {selectedScenes}
    }
}

class SceneSelection extends React.Component {
    constructor(props) {
        super(props)
        this.state = {
            scenes: []
        }
        this.recipe = RecipeActions(props.recipeId)
    }

    render() {
        const {action, recipeId, form} = this.props
        const loading = !action('LOAD_SCENES').dispatched
        return (
            <React.Fragment>
                <ScenePreview recipeId={recipeId}/>
                <Panel center className={styles.panel}>
                    <PanelHeader
                        icon='cog'
                        title={msg('process.mosaic.panel.auto.form.selectScenes')}/>

                    <div className={[styles.content, loading ? styles.loading : null].join(' ')}>
                        {loading
                            ?
                            <CenteredProgress title={msg('process.mosaic.panel.sceneSelection.loadingScenes')}/>
                            : this.renderScenes()}
                    </div>

                    <PanelButtons
                        form={form}
                        statePath={recipePath(recipeId, 'ui')}
                        modalOnDirty={false}
                        onApply={({selectedScenes}) => this.onApply(selectedScenes)}
                        onCancel={() => this.deselectSceneArea()}/>
                </Panel>
            </React.Fragment>
        )
    }

    renderScenes() {
        const {inputs: {selectedScenes}} = this.props
        const {width, scenes, scenesById} = this.state
        const availableSceneComponents = scenes
            .filter(scene => !selectedScenes.value.find(selectedScene => selectedScene.id === scene.id))
            .map(scene =>
                <Scene
                    key={scene.id}
                    scene={scene}
                    selected={false}
                    onAdd={() => this.addScene(scene)}
                    recipe={this.recipe}/>
            )
        const selectedSceneComponents = selectedScenes.value
            .map(scene => scenesById[scene.id])
            .filter(scene => scene)
            .map(scene =>
                <Scene
                    key={scene.id}
                    scene={scene}
                    selected={true}
                    onRemove={() => this.removeScene(scene)}
                    recipe={this.recipe}/>
            )
        return (
            <React.Fragment>
                <div className={styles.availableScenes}>
                    <div className={styles.title}>Available scenes</div>
                    <div className={[styles.scrollable, styles.grid].join(' ')}>
                        {availableSceneComponents}
                    </div>
                </div>
                <div className={styles.selectedScenes}>
                    <div className={styles.title}>Selected scenes</div>
                    <div className={[styles.scrollable, width > 250 ? styles.list : styles.grid].join(' ')}>
                        {selectedSceneComponents}
                    </div>
                    <ReactResizeDetector
                        handleWidth
                        onResize={width => this.widthUpdated(width)}/>
                </div>
            </React.Fragment>
        )
    }

    componentDidMount() {
        this.loadScenes()
    }

    componentDidUpdate(prevProps) {
        if (!objectEquals(this.props, prevProps, ['dates', 'sources', 'sceneSelectionOptions']))
            this.loadScenes()
    }

    loadScenes() {
        const {sceneAreaId, dates, sources, sceneSelectionOptions, asyncActionBuilder} = this.props
        this.setScenes([])
        asyncActionBuilder('LOAD_SCENES',
            api.gee.scenesInSceneArea$({sceneAreaId, dates, sources, sceneSelectionOptions}).pipe(
                map(scenes => this.setScenes(scenes))
            )
        ).dispatch()
    }

    onApply(selectedScenes) {
        const {sceneAreaId} = this.props
        this.recipe.setSelectedScenesInSceneArea(sceneAreaId, selectedScenes).dispatch()
        this.deselectSceneArea()
    }

    deselectSceneArea() {
        this.recipe.setSceneSelection(null).dispatch()
    }

    addScene(scene) {
        const {inputs: {selectedScenes}} = this.props
        selectedScenes.set([
            ...selectedScenes.value,
            {
                id: scene.id,
                date: scene.date,
                dataSet: scene.dataSet
            }
        ])
    }

    removeScene(sceneToRemove) {
        const {inputs: {selectedScenes}} = this.props
        selectedScenes.set(selectedScenes.value.filter(scene => scene.id !== sceneToRemove.id))
    }

    setScenes(scenes) {
        this.setState(prevState => {
            const scenesById = {}
            scenes.forEach(scene => scenesById[scene.id] = scene)
            return {...prevState, scenes, scenesById}
        })
    }

    widthUpdated(width) {
        this.setState((prevState) => ({...prevState, width}))
    }
}

const Scene = ({selected, scene, onAdd, onRemove, className, recipe}) => {
    const {dataSet, date, daysFromTarget, cloudCover, browseUrl} = scene
    const thumbnailStyle = {
        backgroundImage: `url("${browseUrl}")`
    }
    return (
        <div className={[styles.scene, className].join(' ')}>
            <div className={styles.thumbnail} style={thumbnailStyle}/>
            <div className={styles.details}>
                <div className={styles.dataSet}>
                    <Icon name='rocket'/>
                    {dataSetById[dataSet].shortName}
                </div>
                <div className={styles.date}>
                    <Icon name='calendar'/>
                    {date}
                </div>
                <div className={styles.daysFromTarget}>
                    <Icon name='calendar-check'/>
                    {daysFromTarget}
                </div>
                <div className={styles.cloudCover}>
                    <Icon name='cloud'/>
                    {format.integer(cloudCover)}
                </div>
            </div>
            {selected
                ? <SelectedSceneOverlay scene={scene} onRemove={onRemove} recipe={recipe}/>
                : <AvailableSceneOverlay scene={scene} onAdd={onAdd} recipe={recipe}/>
            }
        </div>
    )
}

const AvailableSceneOverlay = ({scene, onAdd, recipe}) =>
    <div className={styles.sceneOverlay}>
        <Button
            className={styles.add} 
            icon='plus'
            label={msg('button.add')}
            onClick={() => onAdd(scene)}/>
        <Button
            className={styles.preview} 
            icon='eye'
            label={msg('process.mosaic.panel.sceneSelection.preview.label')}
            onClick={() => recipe.setSceneToPreview(scene).dispatch()}/>
    </div>

const SelectedSceneOverlay = ({scene, onRemove, recipe}) =>
    <div className={styles.sceneOverlay}>
        <Button
            className={styles.remove} 
            icon='times'
            label={msg('button.remove')}
            onClick={() => onRemove(scene)}/>
        <Button
            className={styles.preview} 
            icon='eye'
            label={msg('process.mosaic.panel.sceneSelection.preview.label')}
            onClick={() => recipe.setSceneToPreview(scene).dispatch()}/>
    </div>

SceneSelection.propTypes = {
    recipeId: PropTypes.string.isRequired,
    sceneAreaId: PropTypes.string.isRequired
}

export default form({fields, mapStateToProps})(SceneSelection)
