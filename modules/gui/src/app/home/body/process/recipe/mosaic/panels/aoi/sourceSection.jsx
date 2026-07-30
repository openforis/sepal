import _ from 'lodash'
import PropTypes from 'prop-types'
import React from 'react'
import {Subject, takeUntil} from 'rxjs'

import api from '~/apiRegistry'
import {withRecipe} from '~/app/home/body/process/recipeContext'
import {compose} from '~/compose'
import {selectFrom} from '~/stateUtils'
import {msg} from '~/translate'
import {Form} from '~/widget/form'
import {Layout} from '~/widget/layout'
import {RecipeInput} from '~/widget/recipeInput'

import {PreviewMap} from './previewMap'

const mapRecipeToProps = recipe => ({
    overlay: selectFrom(recipe, 'layers.overlay'),
    featureLayerSources: selectFrom(recipe, 'ui.featureLayerSources'),
})

class _SourceSection extends React.Component {
    boundsChanged$ = new Subject()

    render() {
        const {inputs: {sourceType}} = this.props
        return (
            <Layout>
                {sourceType.value === 'RECIPE' ? this.renderRecipe() : this.renderAsset()}
                <PreviewMap/>
            </Layout>
        )
    }

    renderAsset() {
        const {inputs: {assetId}} = this.props
        return (
            <Form.AssetCombo
                label={msg('process.mosaic.panel.areaOfInterest.form.source.label')}
                autoFocus
                input={assetId}
                placeholder={msg('process.mosaic.panel.areaOfInterest.form.asset.asset.placeholder')}
                allowedTypes={['Image', 'ImageCollection']}
                labelButtons={[this.renderSourceType()]}
            />
        )
    }

    renderRecipe() {
        const {inputs: {recipeId}} = this.props
        return (
            <RecipeInput
                label={msg('process.mosaic.panel.areaOfInterest.form.source.label')}
                placeholder={msg('process.mosaic.panel.areaOfInterest.form.recipe.recipe.placeholder')}
                input={recipeId}
                filter={type => !type.noImageOutput}
                labelButtons={[this.renderSourceType()]}
                autoFocus
            />
        )
    }

    renderSourceType() {
        const {inputs: {sourceType}} = this.props
        return (
            <Form.Buttons
                key='sourceType'
                spacing='none'
                groupSpacing='none'
                size='x-small'
                shape='pill'
                input={sourceType}
                options={[
                    {value: 'ASSET', label: msg('process.mosaic.panel.areaOfInterest.form.source.type.ASSET')},
                    {value: 'RECIPE', label: msg('process.mosaic.panel.areaOfInterest.form.source.type.RECIPE')}
                ]}
                onChange={() => this.onSourceTypeChanged()}
            />
        )
    }

    onSourceTypeChanged() {
        const {inputs: {assetId, recipeId}} = this.props
        assetId.set(null)
        recipeId.set(null)
    }

    componentDidMount() {
        const {inputs: {sourceType}} = this.props
        sourceType.value || sourceType.set('ASSET')
        this.setOverlay()
    }

    componentDidUpdate(prevProps) {
        if (!prevProps || !_.isEqual(this.sourceSelection(prevProps), this.sourceSelection(this.props))) {
            this.setOverlay()
        }
    }

    sourceSelection(props) {
        const {inputs: {sourceType, assetId, recipeId}} = props
        return {
            sourceType: sourceType.value,
            assetId: assetId.value,
            recipeId: recipeId.value
        }
    }

    setOverlay() {
        const {stream, overlay: prevOverlay, featureLayerSources, recipeActionBuilder, inputs: {sourceType, assetId, recipeId}} = this.props
        const isRecipe = sourceType.value === 'RECIPE'
        const id = isRecipe ? recipeId.value : assetId.value
        this.boundsChanged$.next()
        if (!id) {
            // No source selected (e.g. after switching Asset|Recipe or clearing it): drop any stale overlay
            // and bounds instead of leaving the previous AOI on the map.
            if (prevOverlay) {
                recipeActionBuilder('CLEAR_MAP_OVERLAY')
                    .del('layers.overlay')
                    .del('ui.overlay.bounds')
                    .dispatch()
            }
            return
        }

        const aoi = {
            type: isRecipe ? 'RECIPE' : 'ASSET',
            id
        }
        const aoiLayerSource = featureLayerSources.find(({type}) => type === 'Aoi')
        const overlay = {
            featureLayers: [
                {
                    sourceId: aoiLayerSource.id,
                    layerConfig: {aoi}
                }
            ]
        }
        if (!_.isEqual(overlay, prevOverlay)) {
            recipeActionBuilder('DELETE_MAP_OVERLAY_BOUNDS')
                .del('ui.overlay.bounds')
                .dispatch()
            stream('LOAD_BOUNDS',
                api.gee.aoiBounds$(aoi).pipe(
                    takeUntil(this.boundsChanged$)
                ),
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
        this.boundsChanged$.next()
        this.boundsChanged$.complete()
        recipeActionBuilder('REMOVE_MAP_OVERLAY')
            .del('layers.overlay')
            .dispatch()
    }
}

export const SourceSection = compose(
    _SourceSection,
    withRecipe(mapRecipeToProps)
)

SourceSection.propTypes = {
    inputs: PropTypes.object.isRequired,
    recipeId: PropTypes.string.isRequired,
    layerIndex: PropTypes.number
}
