import PropTypes from 'prop-types'
import React from 'react'
import {connect} from 'store'
import Icon from 'widget/icon'
import Tooltip from 'widget/tooltip'
import {sepalMap} from '../../../map/map'
import styles from './mapToolbar.module.css'
import {RecipeActions, RecipeState} from './mosaicRecipe'

const mapStateToProps = (state, ownProps) => {
    const recipe = RecipeState(ownProps.recipeId)
    return {
        labelsShown: recipe('ui.labelsShown'),
        gridShown: recipe('ui.gridShown'),
        zoomLevel: sepalMap.getZoom()
    }
}

class MapToolbar extends React.Component {
    constructor(props) {
        super(props)
        this.recipe = RecipeActions(props.recipeId)
    }

    render() {
        const {recipeId, className, labelsShown, gridShown} = this.props
        return (
            <div className={className}>
                <div className={styles.toolbar}>
                    <Tooltip msg={'process.mosaic.mapToolbar.zoomIn'} top disabled={sepalMap.isMaxZoom()}>
                        <button onClick={sepalMap.zoomIn.bind(sepalMap)} disabled={sepalMap.isMaxZoom()}>
                            <Icon name={'plus'}/>
                        </button>
                    </Tooltip>
                    <Tooltip msg={'process.mosaic.mapToolbar.zoomOut'} top disabled={sepalMap.isMinZoom()}>
                        <button onClick={sepalMap.zoomOut.bind(sepalMap)} disabled={sepalMap.isMinZoom()}>
                            <Icon name={'minus'}/>
                        </button>
                    </Tooltip>
                    <Tooltip msg={`process.mosaic.mapToolbar.labels.${labelsShown ? 'hide' : 'show'}`} top>
                        <button onClick={() => this.recipe.setLabelsShown(!labelsShown).dispatch()}>
                            <Icon name={'map-marker-alt'}/>
                        </button>
                    </Tooltip>
                    <Tooltip msg={`process.mosaic.mapToolbar.grid.${gridShown ? 'hide' : 'show'}`} top>
                        <button onClick={() => this.recipe.setGridShown(!gridShown).dispatch()}>
                            <Icon name={'th'}/>
                        </button>
                    </Tooltip>
                    <Tooltip msg={'process.mosaic.mapToolbar.centerMap'} top>
                        <button onClick={() => sepalMap.getContext(recipeId).fitLayer('aoi')}>
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
    recipeId: PropTypes.string,
    labelsShown: PropTypes.bool,
    gridShown: PropTypes.bool
}

export default connect(mapStateToProps)(MapToolbar)
