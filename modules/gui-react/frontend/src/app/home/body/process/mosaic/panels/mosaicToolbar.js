import Aoi from 'app/home/body/process/mosaic/panels/aoi/aoi'
import Auto from 'app/home/body/process/mosaic/panels/auto/auto'
import ClearSelectedScenes from 'app/home/body/process/mosaic/panels/clearSelectedScenes/clearSelectedScenes'
import Composite from 'app/home/body/process/mosaic/panels/composite/composite'
import Dates from 'app/home/body/process/mosaic/panels/dates/dates'
import Retrieve from 'app/home/body/process/mosaic/panels/retrieve/retrieve'
import Scenes from 'app/home/body/process/mosaic/panels/scenes/scenes'
import Sources from 'app/home/body/process/mosaic/panels/sources/sources'
import _ from 'lodash'
import PropTypes from 'prop-types'
import React from 'react'
import {connect} from 'store'
import {PanelWizard} from 'widget/panel'
import {PanelButton, Toolbar} from 'widget/toolbar'
import {recipePath, RecipeState, SceneSelectionType} from '../mosaicRecipe'
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
                        tooltip='process.mosaic.panel.auto'
                        disabled={!sceneAreasLoaded}>
                        <Auto recipeId={recipeId}/>
                    </PanelButton>
                    <PanelButton
                        name='clearSelectedScenes'
                        icon='trash'
                        tooltip='process.mosaic.panel.clearSelectedScenes'
                        disabled={!scenesSelected}>
                        <ClearSelectedScenes recipeId={recipeId}/>
                    </PanelButton>
                    <PanelButton
                        name='retrieve'
                        icon='cloud-download-alt'
                        tooltip='process.mosaic.panel.retrieve'
                        disabled={!initialized || (sceneSelectionType === SceneSelectionType.SELECT && !scenesSelected)}>
                        <Retrieve recipeId={recipeId}/>
                    </PanelButton>
                </Toolbar>
                <Toolbar statePath={this.statePath} vertical bottom right panel className={styles.bottom}>
                    <PanelButton
                        name='areaOfInterest'
                        label='process.mosaic.panel.areaOfInterest.button'
                        tooltip='process.mosaic.panel.areaOfInterest'>
                        <Aoi recipeId={recipeId}/>
                    </PanelButton>
                    <PanelButton
                        name='dates'
                        label='process.mosaic.panel.dates.button'
                        tooltip='process.mosaic.panel.dates'>
                        <Dates recipeId={recipeId}/>
                    </PanelButton>
                    <PanelButton
                        name='sources'
                        label='process.mosaic.panel.sources.button'
                        tooltip='process.mosaic.panel.sources'>
                        <Sources recipeId={recipeId}/>
                    </PanelButton>
                    <PanelButton
                        name='scenes'
                        label='process.mosaic.panel.scenes.button'
                        tooltip='process.mosaic.panel.scenes'>
                        <Scenes recipeId={recipeId}/>
                    </PanelButton>
                    <PanelButton
                        name='composite'
                        label='process.mosaic.panel.composite.button'
                        tooltip='process.mosaic.panel.composite'>
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
