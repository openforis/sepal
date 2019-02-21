import Aoi from 'app/home/body/process/mosaic/panels/aoi/aoi'
import AutoSelectScenes from 'app/home/body/process/mosaic/panels/autoSelectScenes/autoSelectScenes'
import ClearSelectedScenes from 'app/home/body/process/mosaic/panels/clearSelectedScenes/clearSelectedScenes'
import CompositeOptions from 'app/home/body/process/mosaic/panels/compositeOptions/compositeOptions'
import Dates from 'app/home/body/process/mosaic/panels/dates/dates'
import Retrieve from 'app/home/body/process/mosaic/panels/retrieve/retrieve'
import SceneSelectionOptions from 'app/home/body/process/mosaic/panels/sceneSelectionOptions/sceneSelectionOptions'
import Sources from 'app/home/body/process/mosaic/panels/sources/sources'
import {withRecipe} from 'app/home/body/process/recipeContext'
import {selectFrom} from 'collections'
import _ from 'lodash'
import React from 'react'
import {msg} from 'translate'
import PanelWizard from 'widget/panelWizard'
import Toolbar, {ActivationButton} from 'widget/toolbar'
import {setInitialized} from '../../recipe'
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
                panels={['aoi', 'dates', 'sources']}
                initialized={initialized}
                onDone={() => setInitialized(recipeId)}>

                <AutoSelectScenes/>
                <ClearSelectedScenes/>
                <Retrieve/>

                <Aoi/>
                <Dates/>
                <Sources/>
                <SceneSelectionOptions/>
                <CompositeOptions/>

                <Toolbar
                    vertical
                    placement='top-right'
                    panel
                    className={styles.top}>

                    <ActivationButton
                        id='autoSelectScenes'
                        icon='magic'
                        tooltip={msg('process.mosaic.panel.autoSelectScenes.tooltip')}
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
                        id='aoi'
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
                        id='sceneSelectionOptions'
                        label={msg('process.mosaic.panel.scenes.button')}
                        tooltip={msg('process.mosaic.panel.scenes.tooltip')}/>
                    <ActivationButton
                        id='compositeOptions'
                        label={msg('process.mosaic.panel.composite.button')}
                        tooltip={msg('process.mosaic.panel.composite.tooltip')}/>
                </Toolbar>
            </PanelWizard>
        )
    }
}

export default withRecipe(mapRecipeToProps)(MosaicToolbar)
