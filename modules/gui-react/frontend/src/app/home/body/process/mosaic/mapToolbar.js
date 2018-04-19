import React from 'react'
import Icon from 'widget/icon'
import styles from './mapToolbar.module.css'
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

class MapToolbar extends React.Component {
    constructor(props) {
        super(props)
        this.recipe = RecipeActions(props.id)
    }
    render() {
        const {className, labelsShown, gridShown} = this.props
        return (
            <div className={className}>
                <div className={styles.toolbar}>
                    <Tooltip msg={'process.mosaic.mapToolbar.zoomIn'} top>
                        <button>
                            <Icon name={'plus'}/>
                        </button>
                    </Tooltip>
                    <Tooltip msg={'process.mosaic.mapToolbar.zoomOut'} top>
                        <button>
                            <Icon name={'minus'}/>
                        </button>
                    </Tooltip>
                    <Tooltip msg={`process.mosaic.mapToolbar.labels.${labelsShown ? 'hide' : 'show'}`} top>
                        <button onClick={() => this.recipe.setLabelsShown(!labelsShown)}>
                            <Icon name={'map-marker-alt'}/>
                        </button>
                    </Tooltip>
                    <Tooltip msg={`process.mosaic.mapToolbar.grid.${gridShown ? 'hide' : 'show'}`} top>
                        <button onClick={() => this.recipe.setGridShown(!gridShown)}>
                            <Icon name={'th'}/>
                        </button>
                    </Tooltip>
                    <Tooltip msg={'process.mosaic.mapToolbar.centerMap'} top>
                        <button>
                            <Icon name={'bullseye'}/>
                        </button>
                    </Tooltip>
                </div>
            </div>
        )
    }
}

MapToolbar.propTypes = {
    className: PropTypes.string,
    id: PropTypes.string,
    labelsShown: PropTypes.bool,
    gridShown: PropTypes.bool
}

export default connect(mapStateToProps)(MapToolbar)
