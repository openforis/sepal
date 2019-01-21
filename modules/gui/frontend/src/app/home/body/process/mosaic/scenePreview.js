import {RecipeActions, RecipeState} from 'app/home/body/process/mosaic/mosaicRecipe'
import {connect} from 'store'
import {dataSetById} from 'sources'
import {msg} from 'translate'
import Hammer from 'react-hammerjs'
import Icon from 'widget/icon'
import Panel, {PanelContent, PanelHeader} from 'widget/panel'
import PanelButtons from 'widget/panelButtons'
import Portal from 'widget/portal'
import React from 'react'
import daysBetween from './daysBetween'
import styles from './scenePreview.module.css'

const mapStateToProps = (state, ownProps) => {
    const recipeState = RecipeState(ownProps.recipeId)
    return {
        scene: recipeState('ui.sceneToPreview')
    }
}

class ScenePreview extends React.Component {
    constructor(props) {
        super(props)
        this.recipeActions = RecipeActions(props.recipeId)
    }

    render() {
        const {targetDate, scene} = this.props
        if (scene) {
            const {id, dataSet, date, cloudCover, browseUrl} = scene
            const daysFromTarget = daysBetween(targetDate, date)
            const daysFromTargetString = daysFromTarget === 0
                ? msg('process.mosaic.panel.sceneSelection.preview.onTarget')
                : daysFromTarget < 0
                    ? msg('process.mosaic.panel.sceneSelection.preview.beforeTarget', {daysFromTarget: -daysFromTarget})
                    : msg('process.mosaic.panel.sceneSelection.preview.afterTarget', {daysFromTarget})
            return (
                <Portal>
                    <Panel
                        className={styles.panel}
                        statePath='userReport'
                        center
                        modal
                        onCancel={() => this.closePreview()}>
                        <PanelHeader
                            icon='image'
                            title={'Scene preview'}
                            label={id}/>
                        <PanelContent>
                            <Hammer onTap={() => this.closePreview()}>
                                <div
                                    className={styles.thumbnail}
                                    style={{'backgroundImage': `url(${browseUrl})`}}>
                                    <img src={browseUrl}/>
                                </div>
                            </Hammer>
                            <div className={styles.details}>
                                <LabelValue name='dataSet' value={dataSetById[dataSet].name} icon='satellite-dish'/>
                                <LabelValue name='date' value={date} icon='calendar'/>
                                <LabelValue name='daysFromTarget' value={daysFromTargetString} icon='calendar-check'/>
                                <LabelValue name='cloudCover' value={cloudCover + '%'} icon='cloud'/>
                            </div>
                        </PanelContent>
                        <PanelButtons/>
                    </Panel>
                </Portal>
            )
        } else
            return null
    }

    closePreview() {
        this.recipeActions.setSceneToPreview(null).dispatch()
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
