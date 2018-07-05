import {RecipeActions, RecipeState} from 'app/home/body/process/mosaic/mosaicRecipe'
import backend from 'backend'
import {objectEquals} from 'collections'
import PropTypes from 'prop-types'
import React from 'react'
import Hammer from 'react-hammerjs'
import ReactResizeDetector from 'react-resize-detector'
import {map} from 'rxjs/operators'
import {dataSetById} from 'sources'
import {msg, Msg} from 'translate'
import {Field, form} from 'widget/form'
import Icon from 'widget/icon'
import {CenteredProgress} from 'widget/progress'
import PanelForm from './panels/panelForm'
import ScenePreview from './scenePreview'
import styles from './sceneSelection.module.css'

const fields = {
    selectedScenes: new Field()
}

const mapStateToProps = (state, ownProps) => {
    const {recipeId, sceneAreaId} = ownProps
    const recipeState = RecipeState(recipeId)
    const selectedScenes = recipeState(['scenes', sceneAreaId]) || []
    return {
        sources: recipeState('sources'),
        dates: recipeState('dates'),
        sceneSelectionOptions: recipeState('sceneSelectionOptions'),
        values: {selectedScenes: selectedScenes}
    }
}

class SceneSelection extends React.Component {
    constructor(props) {
        super(props)
        this.state = {
            scenes: []
        }
        this.recipe = new RecipeActions(props.recipeId)
    }

    render() {
        const {action, recipeId, form, sceneAreaId, inputs: {selectedScenes}} = this.props
        const {width} = this.state
        if (!sceneAreaId)
            return null
        const availableSceneComponents = this.state.scenes
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
            .map(scene =>
                <Scene
                    key={scene.id}
                    scene={scene}
                    selected={true}
                    onRemove={() => this.removeScene(scene)}
                    recipe={this.recipe}/>
            )
        return (
            <div className={styles.container}>
                <ScenePreview recipeId={recipeId}/>
                <form className={styles.panel}>
                    <PanelForm
                        recipeId={recipeId}
                        form={form}
                        onApply={(recipe, {selectedScenes}) => this.onApply(selectedScenes)}
                        onCancel={() => this.deselectSceneArea()}
                        icon='cog'
                        modalOnDirty={false}
                        title={msg('process.mosaic.panel.scenes.title')}>
                        <div className={styles.form}>
                            <div className={styles.availableScenes}>
                                <div className={styles.title}>Available scenes</div>
                                {action('LOAD_SCENES').dispatched
                                    ? (
                                        <div className={[styles.scrollable, styles.grid].join(' ')}>
                                            {availableSceneComponents}
                                        </div>

                                    )
                                    : (
                                        <CenteredProgress
                                            title={msg('process.mosaic.panel.sceneSelection.loadingScenes')}/>
                                    )
                                }
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
                        </div>
                    </PanelForm>
                </form>
            </div>
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
            backend.gee.scenesInSceneArea$({sceneAreaId, dates, sources, sceneSelectionOptions}).pipe(
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
        selectedScenes.set([...selectedScenes.value, scene])
    }

    removeScene(scene) {
        const {inputs: {selectedScenes}} = this.props
        selectedScenes.set(selectedScenes.value.filter(s => s.id !== scene.id))
    }

    setScenes(scenes) {
        this.setState(prevState => ({...prevState, scenes}))
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
                    {cloudCover}
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
        <Hammer onTap={() => onAdd(scene)}>
            <button className={styles.add} onClick={(e) => e.preventDefault()}>
                <Icon name='plus'/>
                <Msg id='button.add'/>
            </button>
        </Hammer>
        <Hammer onTap={() => recipe.setSceneToPreview(scene).dispatch()}>
            <button className={styles.preview} onClick={(e) => e.preventDefault()}>
                <Icon name='eye'/>
                <Msg id='process.mosaic.panel.sceneSelection.preview.label'/>
            </button>
        </Hammer>
    </div>

const SelectedSceneOverlay = ({scene, onRemove, recipe}) =>
    <div className={styles.sceneOverlay}>
        <Hammer onTap={() => onRemove(scene)}>
            <button className={styles.remove} onClick={(e) => e.preventDefault()}>
                <Icon name='times'/>
                <Msg id='button.remove'/>
            </button>
        </Hammer>
        <Hammer onTap={() => recipe.setSceneToPreview(scene).dispatch()}>
            <button className={styles.preview} onClick={(e) => e.preventDefault()}>
                <Icon name='eye'/>
                <Msg id='process.mosaic.panel.sceneSelection.preview.label'/>
            </button>
        </Hammer>
    </div>

SceneSelection.propTypes = {
    recipeId: PropTypes.string.isRequired,
    sceneAreaId: PropTypes.string.isRequired
}

export default form({fields, mapStateToProps})(SceneSelection)