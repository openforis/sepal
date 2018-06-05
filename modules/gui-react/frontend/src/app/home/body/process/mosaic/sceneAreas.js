import {RecipeState} from 'app/home/body/process/mosaic/mosaicRecipe'
import PropTypes from 'prop-types'
import React from 'react'
import {connect} from 'store'


const mapStateToProps = (state, ownProps) => {
    const recipe = RecipeState(ownProps.recipeId)
    return {
        initialized: recipe('ui.initialized'),
        sceneSelectionOptions: recipe('sceneSelectionOptions'),
        source: Object.keys(recipe('sources'))[0]
    }
}

class SceneAreas extends React.Component {
    state = {}

    render() {
        const {initialized, sceneSelectionOptions: {type}} = this.props
        if (!initialized || type !== 'select')
            return null
        return (
            <div>
                Scene areas
            </div>
        )
    }

    componentDidUpdate() {
        // Set layer
    }
}

SceneAreas.propTypes = {
    recipeId: PropTypes.string
}


export default connect(mapStateToProps)(SceneAreas)


class SceneAreaLayer {
    constructor({aoi, source}) {

    }
}