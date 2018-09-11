import {connect} from 'store'
import {recipePath} from './classificationRecipe'
import ClassificationPreview from './classificationPreview'
import ClassificationToolbar from './classificationToolbar'
import MapToolbar from 'app/home/map/mapToolbar'
import PropTypes from 'prop-types'
import React from 'react'

const mapStateToProps = () => {
    return {}
}

class Classification extends React.Component {
    render() {
        const {recipeId} = this.props
        return (
            <React.Fragment>
                <MapToolbar
                    statePath={recipePath(recipeId, 'ui')}
                    mapContext={recipeId}
                    labelLayerIndex={1}/>
                <ClassificationToolbar recipeId={recipeId}/>
                <ClassificationPreview recipeId={recipeId}/>
            </React.Fragment>
        )
    }
}

Classification.propTypes = {
    recipeId: PropTypes.string
}

export default connect(mapStateToProps)(Classification)
