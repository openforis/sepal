import {RecipeActions, RecipeState} from 'app/home/body/process/mosaic/mosaicRecipe'
import React from 'react'
import Hammer from 'react-hammerjs'
import {dataSetById} from 'sources'
import {connect} from 'store'
import {msg} from 'translate'
import Icon from 'widget/icon'
import styles from './scenePreview.module.css'

const mapStateToProps = (state, ownProps) => {
    const recipe = RecipeState(ownProps.recipeId)
    return {
        scene: recipe('sceneToPreview')
    }
}

class ScenePreview extends React.Component {
    constructor(props) {
        super(props)
        this.recipe = RecipeActions(props.recipeId)
    }

    render() {
        const {scene} = this.props
        if (scene) {
            const {id, dataSet, date, daysFromTarget, cloudCover, browseUrl} = scene
            const daysFromTargetString = daysFromTarget < 0
                ? msg('process.mosaic.panel.sceneSelection.preview.beforeTarget', {daysFromTarget: -daysFromTarget})
                : msg('process.mosaic.panel.sceneSelection.preview.afterTarget', {daysFromTarget})
            return (
                <div className={styles.container}>
                    <Hammer onTap={() => this.closePreview()}>
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
                    </Hammer>
                </div>
            )
        } else
            return null
    }

    closePreview() {
        this.recipe.setSceneToPreview(null).dispatch()
    }
}

export default connect(mapStateToProps)(ScenePreview)

const LabelValue = ({name, value, icon}) =>
    <div className={styles[name]}>
        <label className={styles.label}>
            <Icon name={icon}/>
            {msg(['process.mosaic.panel.sceneSelection.preview', name])}
        </label>
        <div className={styles.value}>{value}</div>
    </div>