import {Subject, takeUntil} from 'rxjs'
import {compose} from 'compose'
import {connect} from 'store'
import {getAllVisualizations} from 'app/home/body/process/recipe/visualizations'
import {msg} from 'translate'
import {recipeAccess} from '../../recipeAccess'
import {selectFrom} from 'stateUtils'
import {toAssetReference} from './panels/reference/assetSection'
import {withRecipe} from '../../recipeContext'
import Notifications from 'widget/notifications'
import React from 'react'
import _ from 'lodash'
import api from 'api'

const mapRecipeToProps = (recipe, ownProps) => ({
    ...ownProps,
    referenceSourceId: selectFrom(recipe, 'ui.reference.sourceId'),
    referenceSourceType: selectFrom(recipe, 'ui.reference.sourceType'),
    recipeId: recipe.id
})

const mapStateToProps = (state, ownProps) => {
    const {recipeId, referenceSourceId, referenceSourceType} = ownProps
    const reference = referenceSourceType === 'ASSET'
        ? {type: 'ASSET', id: referenceSourceId}
        : referenceSourceId
            ? selectFrom(state, ['process.loadedRecipes', referenceSourceId])
            : selectFrom(state, ['process.loadedRecipes', recipeId, 'model.reference'])
    return {reference}
}

class _ReferenceSync extends React.Component {
    cancel$ = new Subject()

    shouldComponentUpdate(nextProps) {
        const {reference} = this.props
        const {reference: nextReference} = nextProps
        return !_.isEqual(reference, nextReference)
    }

    render() {
        return null
    }

    componentDidMount() {
        const {reference} = this.props
        this.fetchRecipe(reference)
    }

    componentDidUpdate(prevProps) {
        const {reference} = this.props
        this.fetchRecipe(reference, prevProps.reference)
    }

    fetchRecipe(recipe, prevReference) {
        const {stream, loadSourceRecipe$, recipeActionBuilder} = this.props
        const type = recipe.type
        if (!type) {
            return
        }
        if (type === 'RECIPE_REF') {
            !stream('FETCH_REFERENCE').active && stream('FETCH_REFERENCE',
                loadSourceRecipe$(recipe.id),
                historicalRecipe => {
                    const {id, type} = historicalRecipe
                    recipeActionBuilder('SET_REFERENCE_SOURCE_ID', {id, type})
                        .set('ui.reference.sourceId', id)
                        .set('ui.reference.sourceType', type)
                        .dispatch()
                },
                error => Notifications.error({message: msg('process.baytsAlerts.reference.recipe.loadError'), error})
            )
        } else if (type === 'ASSET') {
            this.initAsset(prevReference)
        } else {
            this.updateRecipeReference({historicalRecipe: recipe})
        }
    }

    initAsset(prevReference = {}) {
        const {stream, reference = {}} = this.props
        if ((reference.id && reference.id === prevReference.id) || stream('LOAD').active) {
            return
        }
        stream('LOAD',
            api.gee.assetMetadata$({asset: reference.id}).pipe(
                takeUntil(this.cancel$)
            ),
            metadata => this.updateAssetReference(metadata, reference),
            error => Notifications.error({message: msg('process.baytsAlerts.reference.asset.loadError'), error})
        )
    }

    updateAssetReference(metadata, reference) {
        const {recipeActionBuilder} = this.props
        const assetDateFormat = metadata.properties.dateFormat
        const dateFormat = assetDateFormat === undefined ? reference.dateFormat : assetDateFormat
        const referenceDetails = {
            ...toAssetReference(metadata.bandNames, metadata.properties),
            dateFormat
        }
        const builder = recipeActionBuilder('UPDATE_REFERENCE', {referenceDetails})
            .assign('model.reference', referenceDetails)
        
        const assignOptions = builder => {
            const assetOptionsString = metadata?.properties?.recipe_options
            if (assetOptionsString) {
                const assetOptions = JSON.parse(assetOptionsString)
                return builder
                    .assign('model.options', assetOptions)
            } else {
                return builder
            }
        }

        assignOptions(builder).dispatch()
    }

    updateRecipeReference({historicalRecipe}) {
        const {reference, recipeActionBuilder} = this.props
        const nextReference = this.recipeReference({historicalRecipe})
        if (!_.isEqual(reference, nextReference)) {
            recipeActionBuilder('UPDATE_REFERENCE', {reference})
                .assign('model.options', historicalRecipe.model.options)
                .dispatch()
        }
    }

    recipeReference({historicalRecipe}) {
        const bands = [] // TODO: How to get the bands in a way that also works with a masking recipe?
        return {
            type: 'RECIPE_REF',
            id: historicalRecipe.id,
            bands,
            startDate: historicalRecipe.model.dates.startDate,
            endDate: historicalRecipe.model.dates.endDate,
            visualizations: getAllVisualizations(historicalRecipe)
        }
    }
}

export const ReferenceSync = compose(
    _ReferenceSync,
    connect(mapStateToProps),
    withRecipe(mapRecipeToProps),
    recipeAccess()
)
