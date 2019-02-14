import Aoi from 'app/home/body/process/mosaic/panels/aoi/aoi'
import Auto from 'app/home/body/process/mosaic/panels/auto/auto'
import ClearSelectedScenes from 'app/home/body/process/mosaic/panels/clearSelectedScenes/clearSelectedScenes'
import Dates from 'app/home/body/process/mosaic/panels/dates/dates'
import Retrieve from 'app/home/body/process/mosaic/panels/retrieve/retrieve'
import Scenes from 'app/home/body/process/mosaic/panels/scenes/scenes'
import Sources from 'app/home/body/process/mosaic/panels/sources/sources'
import Composite from 'app/home/body/process/mosaic/panels/composite/composite'
import {withRecipe} from 'app/home/body/process/recipeContext'
import {selectFrom} from 'collections'
import _ from 'lodash'
import React from 'react'
import {msg} from 'translate'
import PanelWizard from 'widget/panelWizard'
import Toolbar, {ActivationButton, PanelButton} from 'widget/toolbar'
import {SceneSelectionType} from '../mosaicRecipe'
import styles from './mosaicToolbar.module.css'

const mapRecipeToProps = recipe => {
    const sceneAreas = selectFrom(recipe, 'ui.sceneAreas')

    return {
        recipeId: recipe.id,
        initialized: selectFrom(recipe, 'ui.initialized'),
        sceneSelectionType: (selectFrom(recipe, 'model.sceneSelectionOptions') || {}).type,
        sceneAreasLoaded: sceneAreas && Object.keys(sceneAreas).length > 0,
        scenesSelected: !!_.flatten(Object.values(selectFrom(recipe, 'model.scenes') || {})).length,
    }
}

class MosaicToolbar extends React.Component {
    render() {
        const {recipeId, initialized, sceneSelectionType, sceneAreasLoaded, scenesSelected} = this.props
        return (
            <PanelWizard
                panels={['areaOfInterest', 'dates', 'sources']}
                initialized={initialized}>

                <Auto/>
                <ClearSelectedScenes/>
                <Retrieve/>

                <Aoi/>
                <Dates/>
                <Sources/>
                <Scenes/>
                <Composite/>

                <Toolbar
                    vertical
                    placement='top-right'
                    panel
                    className={styles.top}>

                    <ActivationButton
                        id='auto'
                        icon='magic'
                        tooltip={msg('process.mosaic.panel.auto.tooltip')}
                        disabled={!sceneAreasLoaded}/>
                    <ActivationButton
                        id='clearSelectedScenes'
                        icon='trash'
                        tooltip={msg('process.mosaic.panel.clearSelectedScenes.tooltip')}
                        disabled={!scenesSelected}/>
                    <ActivationButton
                        id='retrieve'
                        icon='cloud-download-alt'
                        tooltip={msg('process.mosaic.panel.retrieve.tooltip')}
                        disabled={!initialized || (sceneSelectionType === SceneSelectionType.SELECT && !scenesSelected)}
                    />
                </Toolbar>
                <Toolbar
                    vertical
                    placement='bottom-right'
                    panel
                    className={styles.bottom}>
                    <ActivationButton
                        id='areaOfInterest'
                        label={msg('process.mosaic.panel.areaOfInterest.button')}
                        tooltip={msg('process.mosaic.panel.areaOfInterest.tooltip')}/>
                    <ActivationButton
                        id='dates'
                        label={msg('process.mosaic.panel.dates.button')}
                        tooltip={msg('process.mosaic.panel.dates.tooltip')}/>
                    <ActivationButton
                        id='sources'
                        label={msg('process.mosaic.panel.sources.button')}
                        tooltip={msg('process.mosaic.panel.sources.tooltip')}/>
                    <ActivationButton
                        id='scenes'
                        label={msg('process.mosaic.panel.scenes.button')}
                        tooltip={msg('process.mosaic.panel.scenes.tooltip')}/>
                    <ActivationButton
                        id='composite'
                        label={msg('process.mosaic.panel.composite.button')}
                        tooltip={msg('process.mosaic.panel.composite.tooltip')}/>
                </Toolbar>
            </PanelWizard>
        )
    }
}

export default withRecipe(mapRecipeToProps)(MosaicToolbar)
