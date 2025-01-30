import _ from 'lodash'
import PropTypes from 'prop-types'
import React from 'react'

import api from '~/apiRegistry'
import {withRecipe} from '~/app/home/body/process/recipeContext'
import {compose} from '~/compose'
import {selectFrom} from '~/stateUtils'
import {msg} from '~/translate'
import {Layout} from '~/widget/layout'
import {RecipeInput} from '~/widget/recipeInput'

import {PreviewMap} from './previewMap'

const mapRecipeToProps = recipe => {
    return {
        overlay: selectFrom(recipe, 'layers.overlay'),
        featureLayerSources: selectFrom(recipe, 'ui.featureLayerSources'),
    }
}

class _RecipeSection extends React.Component {
    render() {
        const {inputs: {recipeId}} = this.props
        return (
            <Layout>
                <RecipeInput
                    label={msg('process.mosaic.panel.areaOfInterest.form.recipe.recipe.label')}
                    placeholder={msg('process.mosaic.panel.areaOfInterest.form.recipe.recipe.placeholder')}
                    input={recipeId}
                    filter={type => !type.noImageOutput}
                    autoFocus
                />
                <PreviewMap/>
            </Layout>
        )
    }

    componentDidMount() {
        this.setOverlay()
    }
    
    componentDidUpdate(prevProps) {
        if (!prevProps || prevProps.inputs !== this.props.inputs) {
            this.setOverlay()
        }
    }

    setOverlay() {
        const {stream, inputs: {recipeId}} = this.props
        if (!recipeId.value) {
            return
        }

        const aoi = {
            type: 'RECIPE',
            id: recipeId.value,
        }
        const {overlay: prevOverlay, featureLayerSources, recipeActionBuilder} = this.props
        const aoiLayerSource = featureLayerSources.find(({type}) => type === 'Aoi')
        const overlay = {
            featureLayers: [
                {
                    sourceId: aoiLayerSource.id,
                    layerConfig: {aoi}
                }
            ]
        }
        if (!_.isEqual(overlay, prevOverlay) && !stream('LOAD_BOUNDS').active) {
            recipeActionBuilder('DELETE_MAP_OVERLAY_BOUNDS')
                .del('ui.overlay.bounds')
                .dispatch()
            stream('LOAD_BOUNDS',
                api.gee.aoiBounds$(aoi),
                bounds => {
                    recipeActionBuilder('SET_MAP_OVERLAY_BOUNDS')
                        .set('ui.overlay.bounds', bounds)
                        .dispatch()
                }
            )
            recipeActionBuilder('SET_MAP_OVERLAY')
                .set('layers.overlay', overlay)
                .dispatch()
        }
    }

    componentWillUnmount() {
        const {recipeActionBuilder} = this.props
        recipeActionBuilder('REMOVE_MAP_OVERLAY')
            .del('layers.overlay')
            .dispatch()
    }
}

export const RecipeSection = compose(
    _RecipeSection,
    withRecipe(mapRecipeToProps)
)

RecipeSection.propTypes = {
    inputs: PropTypes.object.isRequired,
    recipeId: PropTypes.string.isRequired,
    layerIndex: PropTypes.number
}
