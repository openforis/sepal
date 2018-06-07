import {RecipeState} from 'app/home/body/process/mosaic/mosaicRecipe'
import backend from 'backend'
import _ from 'lodash'
import PropTypes from 'prop-types'
import React from 'react'
import {map} from 'rxjs/operators'
import {connect} from 'store'
import styles from './sceneSelection.module.css'
import Icon from 'widget/icon'

const mapStateToProps = (state, ownProps) => {
    const recipe = RecipeState(ownProps.recipeId)
    return {
        sceneAreaId: recipe('ui.sceneSelection'),
        source: Object.keys(recipe('sources'))[0],
        dates: recipe('dates')
    }
}

class SceneSelection extends React.Component {
    state = {
        scenes: []
    }

    render() {
        const {sceneAreaId} = this.props
        if (!sceneAreaId)
            return null
        const scenes = this.state.scenes.map(scene => this.renderScene(scene))
        return (
            <div className={styles.container}>
                <div className={styles.panel}>
                    <div className={styles.availableScenes}>{scenes}</div>
                    <div className={styles.selectedScenes}>Selected scenes</div>
                </div>
            </div>
        )
    }

    renderScene({id, dataSet, date, daysFromTarget, cloudCover, browseUrl}) {
        return (
            <div key={id} className={styles.scene}>
                <img src={browseUrl}/>
                <div className={styles.details}>
                    <div className={styles.dataSet}>
                        <Icon name='rocket'/>
                        {dataSet}
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
            </div>
        )
    }

    componentDidUpdate(prevProps) {
        const {sceneAreaId, dates, source, asyncActionBuilder} = this.props
        const changed = !_.isEqual(
            {sceneAreaId, dates, source},
            {sceneAreaId: prevProps.sceneAreaId, dates: prevProps.dates, source: prevProps.source})
        if (sceneAreaId && changed) {
            this.setScenes([])
            asyncActionBuilder('LOAD_SCENES',
                backend.gee.scenesInSceneArea$({sceneAreaId, dates, source}).pipe(
                    map(scenes => this.setScenes(scenes))
                )
            ).dispatch()
        }
    }

    setScenes(scenes) {
        console.log('setScenes', scenes)
        this.setState(prevState => ({...prevState, scenes}))
    }
}

SceneSelection.propTypes = {
    recipeId: PropTypes.string.isRequired
}

export default connect(mapStateToProps)(SceneSelection)