import {RecipeActions} from 'app/home/body/process/mosaic/mosaicRecipe'
import {withRecipe} from 'app/home/body/process/recipeContext'
import {selectFrom} from 'collections'
import PropTypes from 'prop-types'
import React from 'react'
import {msg} from 'translate'
import {ToolbarButton} from 'widget/toolbar'

const mapRecipeToProps = recipe => {
    const sceneAreas = selectFrom(recipe, 'ui.sceneAreas')
    return {
        sceneAreasShown: selectFrom(recipe, 'ui.sceneAreasShown'),
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
                tooltip={msg(`process.mosaic.mapToolbar.sceneAreas.${sceneAreasShown ? 'hide' : 'show'}.tooltip`)}/>
        )
    }
}

ShowSceneAreaToggle.propTypes = {
    recipeId: PropTypes.string.isRequired
}

export default withRecipe(mapRecipeToProps)(ShowSceneAreaToggle)
