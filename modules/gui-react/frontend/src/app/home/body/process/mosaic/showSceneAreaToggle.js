import {RecipeActions, RecipeState} from 'app/home/body/process/mosaic/mosaicRecipe'
import PropTypes from 'prop-types'
import React from 'react'
import {connect} from 'store'
import {ToolbarButton} from 'widget/toolbar'

const mapStateToProps = (state, ownProps) => {
    const recipeState = RecipeState(ownProps.recipeId)
    const sceneAreas = recipeState('ui.sceneAreas')
    return {
        sceneAreasShown: recipeState('ui.sceneAreasShown'),
        sceneAreasLoaded: sceneAreas && Object.keys(sceneAreas).length > 0
    }
}

class ShowSceneAreaToggle extends React.Component {
    constructor(props) {
        super(props)
        this.recipeActions = RecipeActions(props.recipeId)
    }

    render() {
        const {sceneAreasShown, sceneAreasLoaded} = this.props
        return (
            <ToolbarButton
                selected={sceneAreasShown}
                disabled={!sceneAreasLoaded}
                onClick={() => this.recipeActions.setSceneAreasShown(!sceneAreasShown).dispatch()}
                icon={'th'}
                tooltip={`process.mosaic.mapToolbar.sceneAreas.${sceneAreasShown ? 'hide' : 'show'}`}/>
        )
    }
}

ShowSceneAreaToggle.propTypes = {
    recipeId: PropTypes.string.isRequired
}

export default connect(mapStateToProps)(ShowSceneAreaToggle)
