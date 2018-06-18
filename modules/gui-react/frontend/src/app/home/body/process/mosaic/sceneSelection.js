import {RecipeActions, RecipeState} from 'app/home/body/process/mosaic/mosaicRecipe'
import backend from 'backend'
import _ from 'lodash'
import PropTypes from 'prop-types'
import React from 'react'
import ReactResizeDetector from 'react-resize-detector'
import {map} from 'rxjs/operators'
import {dataSetById} from 'sources'
import {msg, Msg} from 'translate'
import {Constraints, form} from 'widget/form'
import Icon from 'widget/icon'
import PanelForm from './panels/panelForm'
import styles from './sceneSelection.module.css'

const inputs = {
    selectedScenes: new Constraints()
}

const mapStateToProps = (state, ownProps) => {
    const {recipeId, sceneAreaId} = ownProps
    const recipe = RecipeState(recipeId)
    const selectedScenes = recipe(['scenes', sceneAreaId]) || []
    return {
        sources: recipe('sources'),
        dates: recipe('dates'),
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
        const {recipeId, form, sceneAreaId, inputs: {selectedScenes}} = this.props
        const {width} = this.state
        if (!sceneAreaId)
            return null
        const availableSceneComponents = this.state.scenes
            .filter(scene => !selectedScenes.value.find(selectedScene => selectedScene.id === scene.id))
            .map(scene =>
                <Scene key={scene.id} scene={scene} selected={false} onAdd={() => this.addScene(scene)}/>
            )
        const selectedSceneComponents = selectedScenes.value
            .map(scene =>
                <Scene key={scene.id} scene={scene} selected={true} onRemove={() => this.removeScene(scene)}/>
            )
        return (
            <div className={styles.container}>
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
        const {dates, sources} = this.props
        const changed = !_.isEqual(
            {dates, sources},
            {dates: prevProps.dates, sources: prevProps.sources})
        if (changed)
            this.loadScenes()
    }

    loadScenes() {
        const {sceneAreaId, dates, sources, asyncActionBuilder} = this.props
        console.log('loadScenes')
        this.setScenes([])
        asyncActionBuilder('LOAD_SCENES',
            backend.gee.scenesInSceneArea$({sceneAreaId, dates, sources}).pipe(
                map(scenes => this.setScenes(scenes))
            )
        ).dispatch()
    }

    onApply(selectedScenes) {
        const {sceneAreaId} = this.props
        this.recipe.setSelectedScenes(sceneAreaId, selectedScenes).dispatch()
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

const Scene = ({selected, scene, onAdd, onRemove}) => {
    const {dataSet, date, daysFromTarget, cloudCover, browseUrl} = scene
    const thumbnailStyle = {
        backgroundImage: `url("${browseUrl}")`
    }
    return (
        <div className={styles.scene}>
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
                ? <SelectedSceneOverlay scene={scene} onRemove={onRemove}/>
                : <AvailableSceneOverlay scene={scene} onAdd={onAdd}/>
            }
        </div>
    )
}

const AvailableSceneOverlay = ({scene, onAdd}) =>
    <div className={styles.sceneOverlay}>
        <button className={styles.add} onClick={() => onAdd(scene)}>
            <Icon name='plus'/>
            <Msg id='button.add'/>
        </button>
        <button className={styles.preview}>
            <Icon name='eye'/>
            <Msg id='process.mosaic.panel.sceneSelection.preview'/>
        </button>
    </div>

const SelectedSceneOverlay = ({scene, onRemove}) =>
    <div className={styles.sceneOverlay}>
        <button className={styles.remove} onClick={() => onRemove(scene)}>
            <Icon name='times'/>
            <Msg id='button.remove'/>
        </button>
        <button className={styles.preview}>
            <Icon name='eye'/>
            <Msg id='process.mosaic.panel.sceneSelection.preview'/>
        </button>
    </div>

SceneSelection.propTypes = {
    recipeId: PropTypes.string.isRequired,
    sceneAreaId: PropTypes.string.isRequired
}

export default form(inputs, mapStateToProps)(SceneSelection)