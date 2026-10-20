import _ from 'lodash'
import PropTypes from 'prop-types'
import React from 'react'
import {Subject, takeUntil} from 'rxjs'

import api from '~/apiRegistry'
import {withRecipe} from '~/app/home/body/process/recipeContext'
import {isImageSource} from '~/app/home/body/process/recipeTypeRegistry'
import {SourceKind} from '~/app/home/body/process/sourceTypeButtons'
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
                <SourceKind input={sourceType} defaultKind='ASSET' onChange={() => this.onSourceTypeChanged()}>
                    {({recipe, labelButtons}) => recipe ? this.renderRecipe(labelButtons) : this.renderAsset(labelButtons)}
                </SourceKind>
                <PreviewMap/>
            </Layout>
        )
    }

    renderAsset(labelButtons) {
        const {inputs: {assetId}} = this.props
        return (
            <Form.AssetCombo
                label={msg('process.mosaic.panel.areaOfInterest.form.source.label')}
                autoFocus
                input={assetId}
                placeholder={msg('process.mosaic.panel.areaOfInterest.form.asset.asset.placeholder')}
                allowedTypes={['Image', 'ImageCollection']}
                labelButtons={labelButtons}
            />
        )
    }

    renderRecipe(labelButtons) {
        const {inputs: {recipeId}} = this.props
        return (
            <RecipeInput
                label={msg('process.mosaic.panel.areaOfInterest.form.source.label')}
                placeholder={msg('process.mosaic.panel.areaOfInterest.form.recipe.recipe.placeholder')}
                input={recipeId}
                filter={isImageSource}
                labelButtons={labelButtons}
                autoFocus
            />
        )
    }

    onSourceTypeChanged() {
        const {inputs: {assetId, recipeId}} = this.props
        assetId.set(null)
        recipeId.set(null)
    }

    componentDidMount() {
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
        const {stream, overlay: prevOverlay, featureLayerSources, recipeActionBuilder, recipeId: ownRecipeId, inputs: {sourceType, assetId, recipeId}} = this.props
        const isRecipe = sourceType.value === 'RECIPE'
        const id = isRecipe ? recipeId.value : assetId.value
        this.boundsChanged$.next()
        // The overlay reads the source itself, so the selector refusing to load one it will not offer is not
        // enough: a recipe saved with itself as its own area of interest would still be resolved from here.
        if (!id || (isRecipe && id === ownRecipeId)) {
            // Nothing usable selected (e.g. after switching Asset|Recipe or clearing it): drop any stale
            // overlay and bounds instead of leaving the previous AOI on the map.
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
