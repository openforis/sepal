import {Aoi} from 'app/home/body/process/recipe/mosaic/panels/aoi/aoi'
import {AutoSelectScenes} from 'app/home/body/process/recipe/opticalMosaic/panels/autoSelectScenes/autoSelectScenes'
import {ClearSelectedScenes} from 'app/home/body/process/recipe/opticalMosaic/panels/clearSelectedScenes/clearSelectedScenes'
import {CompositeOptions} from 'app/home/body/process/recipe/opticalMosaic/panels/compositeOptions/compositeOptions'
import {Dates} from 'app/home/body/process/recipe/opticalMosaic/panels/dates/dates'
import {PanelWizard} from 'widget/panelWizard'
import {Retrieve} from 'app/home/body/process/recipe/opticalMosaic/panels/retrieve/retrieve'
import {RetrieveButton} from '../../retrieveButton'
import {SceneSelectionOptions} from 'app/home/body/process/recipe/opticalMosaic/panels/sceneSelectionOptions/sceneSelectionOptions'
import {SceneSelectionType} from 'app/home/body/process/recipe/opticalMosaic/opticalMosaicRecipe'
import {Sources} from 'app/home/body/process/recipe/opticalMosaic/panels/sources/sources'
import {Toolbar} from 'widget/toolbar/toolbar'
import {compose} from 'compose'
import {msg} from 'translate'
import {selectFrom} from 'stateUtils'
import {setInitialized} from '../../../recipe'
import {withRecipe} from 'app/home/body/process/recipeContext'
import React from 'react'
import _ from 'lodash'
import styles from './opticalMosaicToolbar.module.css'

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

class _MosaicToolbar extends React.Component {
    render() {
        const {recipeId, initialized, sceneSelectionType, sceneAreasLoaded, scenesSelected} = this.props
        const selectScenes = sceneSelectionType === SceneSelectionType.SELECT
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

                    <Toolbar.ActivationButton
                        id='autoSelectScenes'
                        icon='wand-sparkles'
                        tooltip={msg('process.mosaic.panel.autoSelectScenes.tooltip')}
                        disabled={!sceneAreasLoaded || !selectScenes}/>
                    <Toolbar.ActivationButton
                        id='clearSelectedScenes'
                        icon='trash'
                        tooltip={msg('process.mosaic.panel.clearSelectedScenes.tooltip')}
                        disabled={!scenesSelected}/>
                    <RetrieveButton disabled={selectScenes && !scenesSelected}/>
                </Toolbar>
                <Toolbar
                    vertical
                    placement='bottom-right'
                    panel
                    className={styles.bottom}>
                    <Toolbar.ActivationButton
                        id='aoi'
                        label={msg('process.mosaic.panel.areaOfInterest.button')}
                        tooltip={msg('process.mosaic.panel.areaOfInterest.tooltip')}
                        disabled={!initialized}/>
                    <Toolbar.ActivationButton
                        id='dates'
                        label={msg('process.mosaic.panel.dates.button')}
                        tooltip={msg('process.mosaic.panel.dates.tooltip')}
                        disabled={!initialized}/>
                    <Toolbar.ActivationButton
                        id='sources'
                        label={msg('process.mosaic.panel.sources.button')}
                        tooltip={msg('process.mosaic.panel.sources.tooltip')}
                        disabled={!initialized}/>
                    <Toolbar.ActivationButton
                        id='sceneSelectionOptions'
                        label={msg('process.mosaic.panel.scenes.button')}
                        tooltip={msg('process.mosaic.panel.scenes.tooltip')}/>
                    <Toolbar.ActivationButton
                        id='compositeOptions'
                        label={msg('process.mosaic.panel.composite.button')}
                        tooltip={msg('process.mosaic.panel.composite.tooltip')}/>
                </Toolbar>
            </PanelWizard>
        )
    }
}

export const MosaicToolbar = compose(
    _MosaicToolbar,
    withRecipe(mapRecipeToProps)
)
