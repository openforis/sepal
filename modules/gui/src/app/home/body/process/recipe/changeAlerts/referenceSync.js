import {Subject, takeUntil} from 'rxjs'
import {compose} from 'compose'
import {connect} from 'store'
import {getAllVisualizations} from '../ccdc/ccdcRecipe'
import {getAvailableBands} from 'sources'
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
                ccdcRecipe => {
                    const {id, type} = ccdcRecipe
                    recipeActionBuilder('SET_REFERENCE_SOURCE_ID', {id, type})
                        .set('ui.reference.sourceId', id)
                        .set('ui.reference.sourceType', type)
                        .dispatch()
                },
                error => Notifications.error({message: msg('process.changeAlerts.reference.recipe.loadError'), error})
            )
        } else if (type === 'ASSET') {
            this.initAsset(prevReference)
        } else {
            this.updateRecipeReference({ccdcRecipe: recipe})
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
            error => Notifications.error({message: msg('process.changeAlerts.reference.asset.loadError'), error})
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
        const assignSources = builder => {
            const assetSourcesString = metadata?.properties?.recipe_sources
            if (assetSourcesString) {
                return builder
                    .assign('model.sources', JSON.parse(assetSourcesString))
            } else {
                return builder
            }
        }

        assignSources(assignOptions(builder)).dispatch()
    }

    updateRecipeReference({ccdcRecipe}) {
        const {reference, recipeActionBuilder} = this.props
        const nextReference = this.recipeReference({ccdcRecipe})
        if (!_.isEqual(reference, nextReference)) {
            recipeActionBuilder('UPDATE_REFERENCE', {reference})
                .assign('model.sources', ccdcRecipe.model.sources)
                .assign('model.options', ccdcRecipe.model.options)
                .set('model.reference', nextReference)
                .dispatch()
        }
    }

    recipeReference({ccdcRecipe}) {
        const corrections = ccdcRecipe.model.options.corrections
        const baseBands = getAvailableBands({
            dataSets: Object.values(ccdcRecipe.model.sources.dataSets).flat(),
            corrections
        }).map(name => ({
            name,
            bandTypes: ['value', 'rmse', 'magnitude', 'intercept', 'slope',
                'phase_1', 'amplitude_1', 'phase_2', 'amplitude_2', 'phase_3', 'amplitude_3']
        }))
        const segmentBands = [{name: 'tStart'}, {name: 'tEnd'}, {name: 'tBreak'}, {name: 'numObs'}, {name: 'changeProb'}]
        const bands = [
            ...baseBands.map(({name, bandTypes}) => bandTypes.map(bandType => `${name}_${bandType === 'value' ? 'coefs' : bandType}`)),
            segmentBands.map(({name}) => name)
        ].flat()
        return {
            type: 'RECIPE_REF',
            id: ccdcRecipe.id,
            bands,
            baseBands,
            segmentBands,
            dateFormat: ccdcRecipe.model.ccdcOptions.dateFormat,
            startDate: ccdcRecipe.model.dates.startDate,
            endDate: ccdcRecipe.model.dates.endDate,
            visualizations: getAllVisualizations(ccdcRecipe)
        }
    }
}

export const ReferenceSync = compose(
    _ReferenceSync,
    connect(mapStateToProps),
    withRecipe(mapRecipeToProps),
    recipeAccess()
)
