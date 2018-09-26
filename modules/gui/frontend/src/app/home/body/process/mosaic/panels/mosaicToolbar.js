import {PanelButton, Toolbar} from 'widget/toolbar'
import {PanelWizard} from 'widget/panel'
import {RecipeState, SceneSelectionType, recipePath} from '../mosaicRecipe'
import {connect} from 'store'
import {msg} from 'translate'
import Aoi from 'app/home/body/process/mosaic/panels/aoi/aoi'
import Auto from 'app/home/body/process/mosaic/panels/auto/auto'
import ClearSelectedScenes from 'app/home/body/process/mosaic/panels/clearSelectedScenes/clearSelectedScenes'
import Composite from 'app/home/body/process/mosaic/panels/composite/composite'
import Dates from 'app/home/body/process/mosaic/panels/dates/dates'
import PropTypes from 'prop-types'
import React from 'react'
import Retrieve from 'app/home/body/process/mosaic/panels/retrieve/retrieve'
import Scenes from 'app/home/body/process/mosaic/panels/scenes/scenes'
import Sources from 'app/home/body/process/mosaic/panels/sources/sources'
import _ from 'lodash'
import styles from './mosaicToolbar.module.css'

const mapStateToProps = (state, ownProps) => {
    const recipeState = RecipeState(ownProps.recipeId)
    const sceneAreas = recipeState('ui.sceneAreas')

    return {
        initialized: recipeState('ui.initialized'),
        sceneSelectionType: (recipeState('model.sceneSelectionOptions') || {}).type,
        sceneAreasLoaded: sceneAreas && Object.keys(sceneAreas).length > 0,
        scenesSelected: !!_.flatten(Object.values(recipeState('model.scenes') || {})).length,
    }
}

class MosaicToolbar extends React.Component {
    constructor(props) {
        super(props)
        this.statePath = recipePath(props.recipeId, 'ui')
    }

    render() {
        const {recipeId, initialized, sceneSelectionType, sceneAreasLoaded, scenesSelected} = this.props
        return (
            <PanelWizard
                panels={['areaOfInterest', 'dates', 'sources']}
                statePath={this.statePath}>
                <Toolbar statePath={this.statePath} vertical top right className={styles.top}>
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
                <Toolbar statePath={this.statePath} vertical bottom right panel className={styles.bottom}>
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
    recipeId: PropTypes.string
}

export default connect(mapStateToProps)(MosaicToolbar)
