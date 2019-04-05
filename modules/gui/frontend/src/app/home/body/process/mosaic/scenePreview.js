import {Panel, PanelButtons, PanelContent, PanelHeader} from 'widget/panel'
import {RecipeActions} from 'app/home/body/process/mosaic/mosaicRecipe'
import {dataSetById} from 'sources'
import {msg} from 'translate'
import {selectFrom} from 'stateUtils'
import {withRecipe} from 'app/home/body/process/recipeContext'
import Hammer from 'react-hammerjs'
import Icon from 'widget/icon'
import React from 'react'
import daysBetween from './daysBetween'
import styles from './scenePreview.module.css'

const mapRecipeToProps = recipe => ({
    recipeId: recipe.id,
    scene: selectFrom(recipe, 'ui.sceneToPreview')
})

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
            const close = () => this.closePreview()
            return (
                <Panel
                    className={styles.panel}
                    type='modal'>
                    <PanelHeader
                        icon='image'
                        title={'Scene preview'}
                        label={id}/>
                    <PanelContent>
                        <Hammer onTap={() => this.closePreview()}>
                            <div
                                className={styles.thumbnail}
                                style={{'backgroundImage': `url(${browseUrl})`}}>
                                <img src={browseUrl} alt={id}/>
                            </div>
                        </Hammer>
                        <div className={styles.details}>
                            <LabelValue name='dataSet' value={dataSetById[dataSet].name} icon='satellite-dish'/>
                            <LabelValue name='date' value={date} icon='calendar'/>
                            <LabelValue name='daysFromTarget' value={daysFromTargetString} icon='calendar-check'/>
                            <LabelValue name='cloudCover' value={cloudCover + '%'} icon='cloud'/>
                        </div>
                    </PanelContent>
                    <PanelButtons onEnter={close} onEscape={close}>
                        <PanelButtons.Main>
                            <PanelButtons.Close onClick={close}/>
                        </PanelButtons.Main>
                    </PanelButtons>
                </Panel>
            )
        } else
            return null
    }

    closePreview() {
        this.recipeActions.setSceneToPreview(null).dispatch()
    }
}

export default withRecipe(mapRecipeToProps)(ScenePreview)

const LabelValue = ({name, value, icon}) =>
    <div className={styles[name]}>
        <label className={styles.label}>
            <Icon name={icon}/>
            {msg(['process.mosaic.panel.sceneSelection.preview', name])}
        </label>
        <div className={styles.value}>{value}</div>
    </div>
