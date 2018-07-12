import Auto from 'app/home/body/process/mosaic/panels/auto/auto'
import ClearSelectedScenes from 'app/home/body/process/mosaic/panels/clearSelectedScenes/clearSelectedScenes'
import Retrieve from 'app/home/body/process/mosaic/panels/retrieve/retrieve'
import _ from 'lodash'
import PropTypes from 'prop-types'
import React from 'react'
import {connect} from 'store'
import {PanelButton, Toolbar, ToolbarButton} from 'widget/toolbar'
import {RecipeActions, recipePath, RecipeState, SceneSelectionType} from '../mosaicRecipe'
import styles from './mosaicToolbar.module.css'
import {PANELS} from './panelConstants'

const mapStateToProps = (state, ownProps) => {
    const recipeState = RecipeState(ownProps.recipeId)
    const sceneAreas = recipeState('ui.sceneAreas')

    return {
        selectedPanel: recipeState('ui.selectedPanel'),
        modal: recipeState('ui.modal'),
        sceneAreasLoaded: sceneAreas && Object.keys(sceneAreas).length > 0,
        scenesSelected: !!_.flatten(Object.values(recipeState('scenes') || {})).length,
        initialized: recipeState('ui.initialized'),
        sceneSelectionType: (recipeState('sceneSelectionOptions') || {}).type,
    }
}

class MosaicToolbar extends React.Component {
    constructor(props) {
        super(props)
        this.recipe = RecipeActions(props.recipeId)
        this.statePath = recipePath(props.recipeId, 'ui')
    }

    render() {
        const {recipeId, selectedPanel, modal, sceneAreasLoaded, scenesSelected, initialized, sceneSelectionType} = this.props
        return (
            <React.Fragment>
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
                    <Panel
                        panel={PANELS.AREA_OF_INTEREST}
                        selectedPanel={selectedPanel}
                        recipe={this.recipe}
                        disabled={modal}/>
                    <Panel
                        panel={PANELS.DATES}
                        selectedPanel={selectedPanel}
                        recipe={this.recipe}
                        disabled={modal}/>
                    <Panel
                        panel={PANELS.SOURCES}
                        selectedPanel={selectedPanel}
                        recipe={this.recipe}
                        disabled={modal}/>
                    <Panel
                        panel={PANELS.SCENES}
                        selectedPanel={selectedPanel}
                        recipe={this.recipe}
                        disabled={modal}/>
                    <Panel
                        panel={PANELS.COMPOSITE}
                        selectedPanel={selectedPanel}
                        recipe={this.recipe}
                        disabled={modal}/>
                </Toolbar>
            </React.Fragment>
        )
    }
}

MosaicToolbar.propTypes = {
    recipeId: PropTypes.string,
    selectedPanel: PropTypes.string,
    modal: PropTypes.bool
}

const Panel = ({panel, icon, selectedPanel, recipe, disabled = false}) => {
    const selected = panel === selectedPanel
    return (
        <ToolbarButton
            disabled={disabled}
            selected={selected}
            onClick={() => recipe.selectPanel(selected ? null : panel).dispatch()}
            icon={icon}
            label={`process.mosaic.panel.${panel}.button`}
            tooltip={`process.mosaic.panel.${panel}`}/>
    )
}

Panel.propTypes = {
    panel: PropTypes.string,
    icon: PropTypes.string,
    selectedPanel: PropTypes.string,
    recipe: PropTypes.object,
    disabled: PropTypes.bool
}

export default connect(mapStateToProps)(MosaicToolbar)
