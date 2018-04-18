import React from 'react'
import Icon from 'widget/icon'
import styles from './mosaicToolbar.module.css'
import PropTypes from 'prop-types'
import Tooltip from 'widget/tooltip'
import {connect} from 'store'
import {RecipeState, RecipeActions} from './mosaicRecipe'
import {Msg} from 'translate'

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
                        <PanelButton panel={'AOI'} selectedPanel={selectedPanel} recipe={this.recipe}/>
                        <PanelButton panel={'DAT'} selectedPanel={selectedPanel} recipe={this.recipe}/>
                        <PanelButton panel={'SAT'} selectedPanel={selectedPanel} recipe={this.recipe}/>
                        <PanelButton panel={'SCN'} selectedPanel={selectedPanel} recipe={this.recipe}/>
                        <PanelButton panel={'CMP'} selectedPanel={selectedPanel} recipe={this.recipe}/>
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

const PanelButton = ({panel, selectedPanel, recipe}) =>
    <Tooltip msg={`process.mosaic.panel.${panel}`} left>
        <button className={selectedPanel === panel && styles.selected}
            onClick={() => recipe.selectPanel(panel)}>
            <Msg id={`process.mosaic.panel.${panel}.button`}/>
        </button>
    </Tooltip>

PanelButton.propTypes = {
    panel: PropTypes.string,
    selectedPanel: PropTypes.string,
    recipe: PropTypes.object
}

export default connect(mapStateToProps)(MosaicToolbar)
