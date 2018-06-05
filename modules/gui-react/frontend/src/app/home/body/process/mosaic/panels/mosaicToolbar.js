import PropTypes from 'prop-types'
import React from 'react'
import {connect} from 'store'
import {RecipeActions, RecipeState} from '../mosaicRecipe'
import {PANELS} from './panelConstants'
import styles from './mosaicToolbar.module.css'
import {Toolbar, ToolbarButton} from 'widget/toolbar'

const mapStateToProps = (state, ownProps) => {
    const recipe = RecipeState(ownProps.recipeId)
    return {
        selectedPanel: recipe('ui.selectedPanel'),
        modal: recipe('ui.modal')
    }
}

class MosaicToolbar extends React.Component {
    constructor(props) {
        super(props)
        this.recipe = RecipeActions(props.recipeId)
    }

    render() {
        const {className, selectedPanel, modal} = this.props
        return (
            <div className={className}>
                <div className={styles.toolbarGroup}>
                    <Toolbar className={styles.mosaicToolbar} vertical>
                        <Panel panel={PANELS.AUTO} icon={'magic'} selectedPanel={selectedPanel} recipe={this.recipe} disabled={modal}/>
                        <Panel panel={PANELS.PREVIEW} icon={'eye'} selectedPanel={selectedPanel} recipe={this.recipe} disabled={modal}/>
                        <Panel panel={PANELS.RETRIEVE} icon={'cloud-download-alt'} selectedPanel={selectedPanel} recipe={this.recipe} disabled={modal}/>
                    </Toolbar>
                    <Toolbar className={styles.mosaicToolbar} vertical>
                        <Panel panel={PANELS.AREA_OF_INTEREST} selectedPanel={selectedPanel} recipe={this.recipe} disabled={modal}/>
                        <Panel panel={PANELS.DATES} selectedPanel={selectedPanel} recipe={this.recipe} disabled={modal}/>
                        <Panel panel={PANELS.SOURCES} selectedPanel={selectedPanel} recipe={this.recipe} disabled={modal}/>
                        <Panel panel={PANELS.SCENES} selectedPanel={selectedPanel} recipe={this.recipe} disabled={modal}/>
                        <Panel panel={PANELS.COMPOSITE} selectedPanel={selectedPanel} recipe={this.recipe} disabled={modal}/>
                    </Toolbar>
                </div>
            </div>
        )
    }
}

MosaicToolbar.propTypes = {
    className: PropTypes.string,
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
