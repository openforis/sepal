import {RecipeState, recipePath} from './classificationRecipe'
import {connect} from 'store'
import ClassificationPreview from './classificationPreview'
import ClassificationToolbar from './classificationToolbar'
import MapToolbar from 'app/home/map/mapToolbar'
import PropTypes from 'prop-types'
import React from 'react'

const mapStateToProps = (state, ownProps) => {
    const recipeState = RecipeState(ownProps.recipeId)
    return {
        initialized: recipeState('ui.initialized')
    }
}

class Classification extends React.Component {
    render() {
        const {recipeId, initialized} = this.props
        return (
            <React.Fragment>
                <MapToolbar
                    statePath={recipePath(recipeId, 'ui')}
                    mapContext={recipeId}
                    labelLayerIndex={1}/>
                <ClassificationToolbar recipeId={recipeId}/>

                {initialized
                    ? <ClassificationPreview recipeId={recipeId}/>
                    : null}
            </React.Fragment>
        )
    }
}

Classification.propTypes = {
    recipeId: PropTypes.string
}

export default connect(mapStateToProps)(Classification)
