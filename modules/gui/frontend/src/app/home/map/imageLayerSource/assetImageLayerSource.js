import {compose} from 'compose'
import {connect} from 'store'
import {selectFrom} from 'stateUtils'
import {withRecipe} from '../../body/process/recipeContext'
import PropTypes from 'prop-types'
import React from 'react'
import api from 'api'

const mapStateToProps = (state, {source: {sourceConfig: {recipeId}}}) => ({
    recipe: selectFrom(state, ['process.loadedRecipes', recipeId])
})

class _AssetImageLayerSource extends React.Component {
    render() {
        return null
    }

    componentDidMount() {
        this.loadVisualizations()
    }

    loadVisualizations() {
        const {stream, source: {sourceConfig: {asset}}} = this.props
        stream('LOAD_RECIPE',
            api.gee.loadAssetVisualizations$({asset}),
            visualizations => this.updateVisualizations(visualizations)
            // TODO: Handle errors
        )
    }

    updateVisualizations(visualizations) {
        const {source, recipeActionBuilder} = this.props
        recipeActionBuilder('UPDATE_ASSET_VISUALIZATIONS', {visualizations})
            .set(['layers.additionalImageLayerSources', {id: source.id}], {...source, sourceConfig: {...source.sourceConfig, visualizations}})
            .dispatch()
    }
}

export const AssetImageLayerSource = compose(
    _AssetImageLayerSource,
    connect(mapStateToProps),
    withRecipe()
)

AssetImageLayerSource.propTypes = {
    source: PropTypes.object.isRequired
}
