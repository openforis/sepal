import {RecipeState} from 'app/home/body/process/mosaic/mosaicRecipe'
import React from 'react'
import {dataSetById} from 'sources'
import {connect} from 'store'
import {msg} from 'translate'
import Icon from 'widget/icon'
import styles from './scenePreview.module.css'

const mapStateToProps = (state, ownProps) => {
    const {recipeId} = ownProps
    const recipe = RecipeState(recipeId)
    return {
        scene: recipe('sceneToPreview')
    }
}

class ScenePreview extends React.Component {
    render() {
        const {scene} = this.props
        console.log('scene', scene)
        if (scene) {
            const {id, dataSet, date, daysFromTarget, cloudCover, browseUrl} = scene
            const daysFromTargetString = daysFromTarget < 0
                ? msg('process.mosaic.panel.sceneSelection.preview.beforeTarget', {daysFromTarget: -daysFromTarget})
                : msg('process.mosaic.panel.sceneSelection.preview.afterTarget', {daysFromTarget})
            return (
                <div className={styles.container}>
                    <div className={styles.panel}>
                        <div className={styles.id}>{id}</div>
                        <div className={styles.thumbnail}><img src={browseUrl}/></div>
                        <div className={styles.details}>
                            <LabelValue name='dataSet' value={dataSetById[dataSet].name} icon='rocket'/>
                            <LabelValue name='date' value={date} icon='calendar'/>
                            <LabelValue name='daysFromTarget' value={daysFromTargetString}
                                        icon='calendar-check'/>
                            <LabelValue name='cloudCover' value={cloudCover + '%'} icon='cloud'/>
                        </div>
                    </div>
                </div>
            )
        } else
            return null
    }
}

const LabelValue = ({name, value, icon}) =>
    <div className={styles[name]}>
        <label className={styles.label}>
            <Icon name={icon}/>
            {msg(['process.mosaic.panel.sceneSelection.preview', name])}
        </label>
        <div className={styles.value}>{value}</div>
    </div>

export default connect(mapStateToProps)(ScenePreview)