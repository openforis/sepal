import {RecipeActions, RecipeState} from 'app/home/body/process/mosaic/mosaicRecipe'
import backend from 'backend'
import _ from 'lodash'
import moment from 'moment'
import PropTypes from 'prop-types'
import React from 'react'
import ReactResizeDetector from 'react-resize-detector'
import {map} from 'rxjs/operators'
import {dataSetById} from 'sources'
import {connect} from 'store'
import {Msg} from 'translate'
import Icon from 'widget/icon'
import styles from './sceneSelection.module.css'

const mapStateToProps = (state, ownProps) => {
    const recipe = RecipeState(ownProps.recipeId)
    const sceneAreaId = recipe('ui.sceneSelection')
    const scenes = recipe('scenes')
    return {
        sceneAreaId: sceneAreaId,
        sources: recipe('sources'),
        dates: recipe('dates'),
        selectedScenes: (sceneAreaId && scenes && scenes[sceneAreaId]) || []
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
        console.log('render')
        const {sceneAreaId, selectedScenes} = this.props
        const {width} = this.state
        if (!sceneAreaId)
            return null
        const availableSceneComponents = this.state.scenes
            .filter(scene => !selectedScenes.find(selectedScene => selectedScene.id === scene.id))
            .map(scene =>
                <Scene key={scene.id} scene={scene} selected={false} onAdd={() => this.addScene(scene)}/>
            )
        const selectedSceneComponents = selectedScenes
            .map(scene =>
                <Scene key={scene.id} scene={scene} selected={true} onRemove={() => this.removeScene(scene)}/>
            )
        return (
            <div className={styles.container}>
                <div className={styles.panel}>
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
                        {/*<ReactResizeDetector*/}
                            {/*handleWidth*/}
                            {/*onResize={width => this.widthUpdated(width)}/>*/}
                    </div>
                </div>
            </div>
        )
    }

    componentDidUpdate(prevProps) {
        const {sceneAreaId, dates, sources, asyncActionBuilder} = this.props
        const changed = !_.isEqual(
            {sceneAreaId, dates, sources},
            {sceneAreaId: prevProps.sceneAreaId, dates: prevProps.dates, sources: prevProps.sources})
        if (sceneAreaId && changed) {
            this.setScenes([])
            asyncActionBuilder('LOAD_SCENES',
                backend.gee.scenesInSceneArea$({sceneAreaId, dates, sources}).pipe(
                    map(scenes => this.setScenes(scenes))
                )
            ).dispatch()
        }
    }

    addScene(scene) {
        this.recipe.addScene(scene).dispatch()
    }

    removeScene(scene) {
        this.recipe.removeScene(scene).dispatch()
    }

    setScenes(scenes) {
        this.setState(prevState => ({...prevState, scenes}))
    }

    widthUpdated(width) {
        this.setState((prevState) => ({...prevState, width}))
    }
}

const Scene = ({selected, scene, onAdd, onRemove}) => {
    const {id, dataSet, date, daysFromTarget, cloudCover, browseUrl} = scene
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
    recipeId: PropTypes.string.isRequired
}

export default connect(mapStateToProps)(SceneSelection)