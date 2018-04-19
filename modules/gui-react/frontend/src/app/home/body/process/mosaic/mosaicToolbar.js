import PropTypes from 'prop-types'
import React from 'react'
import {connect} from 'store'
import {Msg} from 'translate'
import Icon from 'widget/icon'
import Tooltip from 'widget/tooltip'
import {RecipeActions, RecipeState} from './mosaicRecipe'
import styles from './mosaicToolbar.module.css'

const mapStateToProps = (state, ownProps) => {
    const recipe = RecipeState(ownProps.id)
    return {
        selectedPanel: recipe('selectedPanel')
    }
}

class MosaicToolbar extends React.Component {
    constructor(props) {
        super(props)
        this.recipe = RecipeActions(props.id)
    }

    render() {
        const {className, selectedPanel} = this.props
        return (
            <div className={className}>
                <div className={styles.toolbar}>
                    <div className={styles.action}>
                        <Tooltip msg={'process.mosaic.toolbar.auto'} left>
                            <button>
                                <Icon name={'magic'}/>
                            </button>
                        </Tooltip>
                        <Tooltip msg={'process.mosaic.toolbar.preview'} left>
                            <button>
                                <Icon name={'eye'}/>
                            </button>
                        </Tooltip>
                        <Tooltip msg={'process.mosaic.toolbar.retrieve'} left>
                            <button>
                                <Icon name={'cloud-download-alt'}/>
                            </button>
                        </Tooltip>
                    </div>
                    <div className={styles.configuration}>
                        <PanelButton panel={'areaOfInterest'} selectedPanel={selectedPanel} recipe={this.recipe}/>
                        <PanelButton panel={'dates'} selectedPanel={selectedPanel} recipe={this.recipe}/>
                        <PanelButton panel={'sensors'} selectedPanel={selectedPanel} recipe={this.recipe}/>
                        <PanelButton panel={'scenes'} selectedPanel={selectedPanel} recipe={this.recipe}/>
                        <PanelButton panel={'composite'} selectedPanel={selectedPanel} recipe={this.recipe}/>
                    </div>
                </div>
            </div>
        )
    }
}

MosaicToolbar.propTypes = {
    className: PropTypes.string,
    id: PropTypes.string,
    selectedPanel: PropTypes.string
}

const PanelButton = ({panel, selectedPanel, recipe}) => {
    const isSelected = panel === selectedPanel
    const button = (
        <button className={isSelected ? styles.selected : null}
                onClick={() => recipe.selectPanel(isSelected ? null : panel)}>
            <Msg id={`process.mosaic.panel.${panel}.button`}/>
        </button>
    )

    return isSelected
        ? button
        : <Tooltip msg={`process.mosaic.panel.${panel}`} left>
            {button}
        </Tooltip>
}

PanelButton.propTypes = {
    panel: PropTypes.string,
    selectedPanel: PropTypes.string,
    recipe: PropTypes.object
}

export default connect(mapStateToProps)(MosaicToolbar)
