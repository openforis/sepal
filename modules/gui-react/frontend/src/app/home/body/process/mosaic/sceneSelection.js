import {RecipeState, RecipeActions} from 'app/home/body/process/mosaic/mosaicRecipe'
import backend from 'backend'
import _ from 'lodash'
import PropTypes from 'prop-types'
import React from 'react'
import {map} from 'rxjs/operators'
import {connect} from 'store'
import styles from './sceneSelection.module.css'
import Icon from 'widget/icon'
import moment from 'moment'
import {dataSetById} from 'sources'
import ReactResizeDetector from 'react-resize-detector'

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
        const {sceneAreaId, selectedScenes} = this.props
        const {width} = this.state
        if (!sceneAreaId)
            return null
        const availableSceneComponents = this.state.scenes
            .filter(scene => !selectedScenes.find(selectedScene => selectedScene.id === scene.id))
            .map(scene => this.renderSceneInGrid(scene, this.availableSceneOverlay(scene)))
        const selectedInList = width > 250
        const selectedSceneComponents = selectedScenes
            .map(scene => this.renderSceneInGrid(scene, this.selectedSceneOverlay(scene)))
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
                        <div className={[styles.scrollable, selectedInList ? styles.list : styles.grid].join(' ')}>
                            {selectedSceneComponents}
                        </div>
                        <ReactResizeDetector
                            handleWidth
                            onResize={width => this.widthUpdated(width)}/>
                    </div>
                </div>
            </div>
        )
    }

    renderSceneInGrid(scene, overlay) {
        const {id, dataSet, date, daysFromTarget, cloudCover, browseUrl} = scene
        const thumbnailStyle = {
            backgroundImage: `url("${browseUrl}")`
        }
        return (
            <div key={id} className={styles.scene}>
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
                {overlay}
            </div>
        )
    }

    renderSceneInList(scene, overlay) {
        const {id, dataSet, date, daysFromTarget, cloudCover, browseUrl} = scene
        const thumbnailStyle = {
            backgroundImage: `url("${browseUrl}")`
        }
        return (
            <div key={id} className={[styles.scene, styles.details].join(' ')}>
                <div className={styles.thumbnail} style={thumbnailStyle}/>
                <div className={styles.dataSet}>
                    <Icon name='rocket'/>
                    {dataSetById[dataSet].shortName}
                </div>
                <div className={styles.cloudCover}>
                    <Icon name='cloud'/>
                    {cloudCover}
                </div>
                <div className={styles.date}>
                    <Icon name='calendar'/>
                    {moment(date, 'YYYY-MM-DD').year()}
                </div>
                <div className={styles.daysFromTarget}>
                    <Icon name='calendar-check'/>
                    {daysFromTarget}
                </div>
                {overlay}
            </div>
        )
    }

    availableSceneOverlay(scene) {
        return (
            <div className={styles.sceneOverlay}>
                <button className={styles.add} onClick={() => this.addScene(scene)}>
                    <Icon name='plus'/>
                    Add
                </button>
                <button className={styles.preview}>
                    <Icon name='eye'/>
                    Preview
                </button>
            </div>
        )
    }

    selectedSceneOverlay(scene) {
        return (
            <div className={styles.sceneOverlay}>
                <button className={styles.remove} onClick={() => this.addScene(scene)}>
                    <Icon name='times'/>
                    Remove
                </button>
                <button className={styles.preview}>
                    <Icon name='eye'/>
                    Preview
                </button>
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

    setScenes(scenes) {
        this.setState(prevState => ({...prevState, scenes}))
    }

    widthUpdated(width) {
        this.setState((prevState) => ({...prevState, width}))
    }
}

SceneSelection.propTypes = {
    recipeId: PropTypes.string.isRequired
}

export default connect(mapStateToProps)(SceneSelection)