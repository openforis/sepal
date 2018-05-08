import PropTypes from 'prop-types'
import React from 'react'
import {connect} from 'store'
import {Msg} from 'translate'
import Icon from 'widget/icon'
import Tooltip from 'widget/tooltip'
import {RecipeActions, RecipeState} from '../mosaicRecipe'
import styles from './toolbar.module.css'

const mapStateToProps = (state, ownProps) => {
    const recipe = RecipeState(ownProps.id)
    return {
        selectedPanel: recipe('ui.selectedPanel'),
        modal: recipe('ui.modal')
    }
}

class Toolbar extends React.Component {
    constructor(props) {
        super(props)
        this.recipe = RecipeActions(props.id)
    }

    render() {
        const {className, selectedPanel, modal} = this.props
        return (
            <div className={className}>
                <div className={styles.toolbar}>
                    <div className={styles.actionButtons}>
                        <Panel panel={'auto'} icon={'magic'} selectedPanel={selectedPanel} recipe={this.recipe} disabled={modal}/>
                        <Panel panel={'preview'} icon={'eye'} selectedPanel={selectedPanel} recipe={this.recipe} disabled={modal}/>
                        <Panel panel={'retrieve'} icon={'cloud-download-alt'} selectedPanel={selectedPanel} recipe={this.recipe} disabled={modal}/>
                    </div>
                    <div className={styles.configurationButtons}>
                        <Panel panel={'areaOfInterest'} selectedPanel={selectedPanel} recipe={this.recipe} disabled={modal}/>
                        <Panel panel={'dates'} selectedPanel={selectedPanel} recipe={this.recipe} disabled={modal}/>
                        <Panel panel={'sources'} selectedPanel={selectedPanel} recipe={this.recipe} disabled={modal}/>
                        <Panel panel={'scenes'} selectedPanel={selectedPanel} recipe={this.recipe} disabled={modal}/>
                        <Panel panel={'composite'} selectedPanel={selectedPanel} recipe={this.recipe} disabled={modal}/>
                    </div>
                </div>
            </div>
        )
    }
}

Toolbar.propTypes = {
    className: PropTypes.string,
    id: PropTypes.string,
    selectedPanel: PropTypes.string,
    modal: PropTypes.bool
}

const Panel = ({panel, icon, selectedPanel, recipe, disabled = false}) => {
    const isSelected = panel === selectedPanel
    const renderLabel = (panel) => <Msg id={`process.mosaic.panel.${panel}.button`}/>
    const renderIcon = (icon) => <Icon name={icon}/>
    return (
        <Tooltip msg={`process.mosaic.panel.${panel}`} left disabled={isSelected || disabled}>
            <button className={isSelected ? styles.selected : null}
                onClick={() => recipe.selectPanel(isSelected ? null : panel)}
                disabled={disabled}>
                {icon ? renderIcon(icon) : renderLabel(panel)}
            </button>
        </Tooltip>
    )
}

Panel.propTypes = {
    panel: PropTypes.string,
    icon: PropTypes.string,
    selectedPanel: PropTypes.string,
    recipe: PropTypes.object,
    disabled: PropTypes.bool
}

export default connect(mapStateToProps)(Toolbar)
