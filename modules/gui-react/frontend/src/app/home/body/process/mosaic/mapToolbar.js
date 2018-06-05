import PropTypes from 'prop-types'
import React from 'react'
import {connect} from 'store'
import {sepalMap} from '../../../map/map'
import styles from './mapToolbar.module.css'
import {RecipeActions, RecipeState} from './mosaicRecipe'
import {Toolbar, ToolbarButton} from 'widget/toolbar'

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
                <Toolbar className={styles.mapToolbar} horizontal>
                    <ToolbarButton 
                        disabled={sepalMap.isMaxZoom()}
                        onClick={sepalMap.zoomIn.bind(sepalMap)}
                        icon={'plus'}
                        tooltip={'process.mosaic.mapToolbar.zoomIn'}/>
                    <ToolbarButton
                        disabled={sepalMap.isMinZoom()}
                        onClick={sepalMap.zoomOut.bind(sepalMap)}
                        icon={'minus'}
                        tooltip={'process.mosaic.mapToolbar.zoomOut'}/>
                    <ToolbarButton
                        onClick={() => this.recipe.setLabelsShown(!labelsShown).dispatch()}
                        icon={'map-marker-alt'}
                        tooltip={`process.mosaic.mapToolbar.labels.${labelsShown ? 'hide' : 'show'}`}/>
                    <ToolbarButton
                        onClick={() => this.recipe.setGridShown(!gridShown).dispatch()}
                        icon={'th'}
                        tooltip={`process.mosaic.mapToolbar.grid.${gridShown ? 'hide' : 'show'}`}/>
                    <ToolbarButton
                        onClick={() => sepalMap.getContext(recipeId).fitLayer('aoi')}
                        icon={'bullseye'}
                        tooltip={'process.mosaic.mapToolbar.centerMap'}/>
                </Toolbar>
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

// class Button extends React.Component {
//     render() {
//         const {msg, disabled, onClick, icon} = this.props
//         return (
//             <Tooltip msg={msg} top disabled={disabled}>
//                 <button onClick={onClick} disabled={disabled}>
//                     <Icon name={icon}/>
//                 </button>
//             </Tooltip>
//         )
//     }
// }

// Button.propTypes = {
//     msg: PropTypes.string,
//     disabled: PropTypes.any,
//     onClick: PropTypes.func,
//     icon: PropTypes.string
// }

export default connect(mapStateToProps)(MapToolbar)
