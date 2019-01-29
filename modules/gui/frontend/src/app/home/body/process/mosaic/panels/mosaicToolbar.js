import {RecipeState, SceneSelectionType} from '../mosaicRecipe'
import {connect} from 'store'
import {msg} from 'translate'
import {withRecipePath} from 'app/home/body/process/recipe'
import Aoi from 'app/home/body/process/mosaic/panels/aoi/aoi'
import Auto from 'app/home/body/process/mosaic/panels/auto/auto'
import ClearSelectedScenes from 'app/home/body/process/mosaic/panels/clearSelectedScenes/clearSelectedScenes'
import Composite from 'app/home/body/process/mosaic/panels/composite/composite'
import Dates from 'app/home/body/process/mosaic/panels/dates/dates'
import PanelWizard from 'widget/panelWizard'
import PropTypes from 'prop-types'
import React from 'react'
import Retrieve from 'app/home/body/process/mosaic/panels/retrieve/retrieve'
import Scenes from 'app/home/body/process/mosaic/panels/scenes/scenes'
import Sources from 'app/home/body/process/mosaic/panels/sources/sources'
import Toolbar, {PanelButton} from 'widget/toolbar'
import _ from 'lodash'
import styles from './mosaicToolbar.module.css'

const mapStateToProps = (state, ownProps) => {
    const {recipeId} = ownProps
    const recipeState = RecipeState(recipeId)
    const sceneAreas = recipeState('ui.sceneAreas')

    return {
        initialized: recipeState('ui.initialized'),
        sceneSelectionType: (recipeState('model.sceneSelectionOptions') || {}).type,
        sceneAreasLoaded: sceneAreas && Object.keys(sceneAreas).length > 0,
        scenesSelected: !!_.flatten(Object.values(recipeState('model.scenes') || {})).length,
    }
}

class MosaicToolbar extends React.Component {
    render() {
        const {recipeId, recipePath, initialized, sceneSelectionType, sceneAreasLoaded, scenesSelected} = this.props
        const statePath = recipePath + '.ui'
        return (
            <PanelWizard
                panels={['areaOfInterest', 'dates', 'sources']}
                statePath={statePath}>
                <Toolbar statePath={statePath} vertical top right panel className={styles.top}>
                    <PanelButton
                        name='auto'
                        icon='magic'
                        tooltip={msg('process.mosaic.panel.auto.tooltip')}
                        disabled={!sceneAreasLoaded}>
                        <Auto recipeId={recipeId}/>
                    </PanelButton>
                    <PanelButton
                        name='clearSelectedScenes'
                        icon='trash'
                        tooltip={msg('process.mosaic.panel.clearSelectedScenes.tooltip')}
                        disabled={!scenesSelected}>
                        <ClearSelectedScenes recipeId={recipeId}/>
                    </PanelButton>
                    <PanelButton
                        name='retrieve'
                        icon='cloud-download-alt'
                        tooltip={msg('process.mosaic.panel.retrieve.tooltip')}
                        disabled={!initialized || (sceneSelectionType === SceneSelectionType.SELECT && !scenesSelected)}>
                        <Retrieve recipeId={recipeId}/>
                    </PanelButton>
                </Toolbar>
                <Toolbar statePath={statePath} vertical bottom right panel className={styles.bottom}>
                    <PanelButton
                        name='areaOfInterest'
                        label={msg('process.mosaic.panel.areaOfInterest.button')}
                        tooltip={msg('process.mosaic.panel.areaOfInterest.tooltip')}>
                        <Aoi recipeId={recipeId}/>
                    </PanelButton>
                    <PanelButton
                        name='dates'
                        label={msg('process.mosaic.panel.dates.button')}
                        tooltip={msg('process.mosaic.panel.dates.tooltip')}>
                        <Dates recipeId={recipeId}/>
                    </PanelButton>
                    <PanelButton
                        name='sources'
                        label={msg('process.mosaic.panel.sources.button')}
                        tooltip={msg('process.mosaic.panel.sources.tooltip')}>
                        <Sources recipeId={recipeId}/>
                    </PanelButton>
                    <PanelButton
                        name='scenes'
                        label={msg('process.mosaic.panel.scenes.button')}
                        tooltip={msg('process.mosaic.panel.scenes.tooltip')}>
                        <Scenes recipeId={recipeId}/>
                    </PanelButton>
                    <PanelButton
                        name='composite'
                        label={msg('process.mosaic.panel.composite.button')}
                        tooltip={msg('process.mosaic.panel.composite.tooltip')}>
                        <Composite recipeId={recipeId}/>
                    </PanelButton>
                </Toolbar>
            </PanelWizard>
        )
    }
}

MosaicToolbar.propTypes = {
    recipeId: PropTypes.string.isRequired
}

export default withRecipePath()(
    connect(mapStateToProps)(MosaicToolbar)
)
