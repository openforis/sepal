import {RecipeState} from 'app/home/body/process/mosaic/mosaicRecipe'
import PropTypes from 'prop-types'
import React from 'react'
import styles from './sceneSelection.module.css'
import {connect} from 'store'

const mapStateToProps = (state, ownProps) => {
    const recipe = RecipeState(ownProps.recipeId)
    return {
        sceneAreaId: recipe('ui.sceneSelection')
    }
}

class SceneSelection extends React.Component {
    render() {
        const {sceneAreaId} = this.props
        if (!sceneAreaId)
            return null
        return (
            <div className={styles.container}>
                <div className={styles.panel}>
                    Scene Selection: {sceneAreaId}
                </div>
            </div>
        )
    }
}

SceneSelection.propTypes = {
    recipeId: PropTypes.string.isRequired
}

export default connect(mapStateToProps)(SceneSelection)