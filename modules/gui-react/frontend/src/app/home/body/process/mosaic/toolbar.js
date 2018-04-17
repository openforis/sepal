import React from 'react'
import Icon from 'widget/icon'
import styles from './toolbar.module.css'
import PropTypes from 'prop-types'
import Tooltip from 'widget/tooltip'
import {connect} from 'store'
import {RecipeState, RecipeActions} from './mosaicRecipe'

const mapStateToProps = (state, ownProps) => {
    const recipe = RecipeState(ownProps.id)
    return {
        labelsShown: recipe('labelsShown'),
        gridShown: recipe('gridShown')
    }
}

class MosaicToolbar extends React.Component {
    constructor(props) {
        super(props)
        this.recipe = RecipeActions(props.id)
    }
    render() {
        const {className, labelsShown, gridShown} = this.props
        return (
            <div className={className}>
                <div className={styles.toolbar}>
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
                    <Tooltip msg={'process.mosaic.toolbar.zoomIn'} left>
                        <button>
                            <Icon name={'plus'}/>
                        </button>
                    </Tooltip>
                    <Tooltip msg={'process.mosaic.toolbar.zoomOut'} left>
                        <button>
                            <Icon name={'minus'}/>
                        </button>
                    </Tooltip>
                    <Tooltip msg={`process.mosaic.toolbar.labels.${labelsShown ? 'hide' : 'show'}`} left>
                        <button onClick={() => this.recipe.setLabelsShown(!labelsShown)}>
                            <Icon name={'map-marker-alt'}/>
                        </button>
                    </Tooltip>
                    <Tooltip msg={`process.mosaic.toolbar.grid.${gridShown ? 'hide' : 'show'}`} left>
                        <button onClick={() => this.recipe.setGridShown(!gridShown)}>
                            <Icon name={'th'}/>
                        </button>
                    </Tooltip>
                    <Tooltip msg={'process.mosaic.toolbar.centerMap'} left>
                        <button>
                            <Icon name={'bullseye'}/>
                        </button>
                    </Tooltip>
                    <Tooltip msg={'process.mosaic.toolbar.where'} left>
                        <button>
                            <Icon name={'globe'}/>
                        </button>
                    </Tooltip>
                    <Tooltip msg={'process.mosaic.toolbar.when'} left>
                        <button>
                            <Icon name={'calendar-alt'}/>
                        </button>
                    </Tooltip>
                    <Tooltip msg={'process.mosaic.toolbar.sensors'} left>
                        <button>
                            <Icon name={'bars'}/>
                        </button>
                    </Tooltip>
                    <Tooltip msg={'process.mosaic.toolbar.scenes'} left>
                        <button>
                            <Icon name={'bars'}/>
                        </button>
                    </Tooltip>
                    <Tooltip msg={'process.mosaic.toolbar.composite'} left>
                        <button>
                            <Icon name={'bars'}/>
                        </button>
                    </Tooltip>
                </div>
            </div>
        )
    }
}

MosaicToolbar.propTypes = {
    className: PropTypes.string,
    id: PropTypes.string,
    labelsShown: PropTypes.bool,
    gridShown: PropTypes.bool
}

export default connect(mapStateToProps)(MosaicToolbar)
