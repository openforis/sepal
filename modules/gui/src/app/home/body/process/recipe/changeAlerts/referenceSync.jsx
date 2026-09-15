import _ from 'lodash'
import React from 'react'
import {Subject, takeUntil} from 'rxjs'

import api from '~/apiRegistry'
import {compose} from '~/compose'
import {connect} from '~/connect'
import {selectFrom} from '~/stateUtils'
import {msg} from '~/translate'
import {Notifications} from '~/widget/notifications'

import {recipeAccess} from '../../recipeAccess'
import {withRecipe} from '../../recipeContext'

// Change Alerts' own monitoring configuration, kept in step with the producer it was seeded from.
//
// The segment description is not written here: it is the source's, and the shared evidence lifecycle holds
// the current one. What this owns is `model.sources` and `model.options` - the collection Change Alerts
// monitors against and the corrections it applies - which are seeded from the producer and editable
// afterwards, and which follow the producer while it changes under the same id.
//
// Which producer that is is resolved once per selection and remembered in `ui`, so the producer's record can
// be watched. The selected reference is never replaced by it.

const mapRecipeToProps = (recipe, ownProps) => ({
    ...ownProps,
    reference: selectFrom(recipe, 'model.reference'),
    producerId: selectFrom(recipe, 'ui.reference.sourceId'),
    producerType: selectFrom(recipe, 'ui.reference.sourceType'),
    recipeId: recipe.id
})

const mapStateToProps = (state, {producerId, producerType}) => ({
    producer: producerType === 'ASSET'
        ? {type: 'ASSET', id: producerId}
        : producerId
            ? selectFrom(state, ['process.loadedRecipes', producerId])
            : null
})

class _ReferenceSync extends React.Component {
    cancel$ = new Subject()

    shouldComponentUpdate(nextProps) {
        const {reference, producer} = this.props
        return !_.isEqual(reference, nextProps.reference) || !_.isEqual(producer, nextProps.producer)
    }

    render() {
        return null
    }

    componentDidMount() {
        this.resolveProducer()
        this.applyConfiguration()
    }

    componentDidUpdate(prevProps) {
        this.resolveProducer(prevProps.reference)
        this.applyConfiguration(prevProps)
    }

    componentWillUnmount() {
        this.cancel$.next()
    }

    // Which recipe or asset the selection stands for. A wrapper leads to whatever it wraps; the selection
    // itself is left alone.
    resolveProducer(prevReference = {}) {
        const {reference = {}, stream, loadSourceRecipe$, recipeActionBuilder} = this.props
        if (reference.type !== 'RECIPE_REF' || reference.id === prevReference.id) {
            return
        }
        if (stream('RESOLVE_PRODUCER').active) {
            return
        }
        stream('RESOLVE_PRODUCER',
            loadSourceRecipe$(reference.id).pipe(takeUntil(this.cancel$)),
            ({id, type}) => recipeActionBuilder('SET_REFERENCE_SOURCE_ID', {id, type})
                .set('ui.reference.sourceId', id)
                .set('ui.reference.sourceType', type)
                .dispatch(),
            error => Notifications.error({message: msg('process.changeAlerts.reference.recipe.loadError'), error})
        )
    }

    // A directly selected asset is its own producer, and is read when the SELECTION changes - a correction
    // to the date representation of the asset already selected is the user's answer, not a reason to ask
    // the asset again. A recipe selection waits for the producer it resolved to, and follows that record
    // while it changes.
    applyConfiguration({reference: prevReference = {}, producer: prevProducer} = {}) {
        const {reference = {}, producer} = this.props
        if (reference.type === 'ASSET') {
            if (reference.id !== prevReference.id) {
                this.fromAsset(reference.id, {configureReference: true})
            }
        } else if (producer && !_.isEqual(producer, prevProducer)) {
            producer.type === 'ASSET'
                ? this.fromAsset(producer.id, {configureReference: false})
                : this.fromRecipe(producer)
        }
    }

    fromRecipe(producer) {
        const {recipeActionBuilder} = this.props
        if (!producer.model?.sources) {
            return
        }
        recipeActionBuilder('UPDATE_MONITORING_CONFIGURATION', {id: producer.id})
            .assign('model.sources', producer.model.sources)
            .assign('model.options', producer.model.options)
            .dispatch()
    }

    // A segments asset carries the configuration it was exported with. Whether it was selected directly or
    // reached through a wrapper, it is what the monitoring collection is seeded from.
    fromAsset(assetId, {configureReference}) {
        const {stream} = this.props
        if (!assetId || stream('LOAD_ASSET').active) {
            return
        }
        stream('LOAD_ASSET',
            api.gee.assetMetadata$({asset: assetId}).pipe(takeUntil(this.cancel$)),
            metadata => this.fromAssetMetadata(metadata, {configureReference}),
            error => Notifications.error({message: msg('process.changeAlerts.reference.asset.loadError'), error})
        )
    }

    fromAssetMetadata(metadata, {configureReference}) {
        const {reference = {}, recipeActionBuilder} = this.props
        const builder = recipeActionBuilder('UPDATE_MONITORING_CONFIGURATION', {})
        // A directly selected asset's date representation is the user's, prefilled from the asset.
        const withReference = configureReference
            ? builder.set('model.reference.dateFormat',
                metadata.properties.dateFormat === undefined
                    ? reference.dateFormat
                    : metadata.properties.dateFormat)
            : builder
        const options = parsed(metadata?.properties?.recipe_options)
        const sources = parsed(metadata?.properties?.recipe_sources)
        const withOptions = options ? withReference.assign('model.options', options) : withReference
        const withSources = sources ? withOptions.assign('model.sources', sources) : withOptions
        withSources.dispatch()
    }
}

const parsed = value => value ? JSON.parse(value) : null

export const ReferenceSync = compose(
    _ReferenceSync,
    connect(mapStateToProps),
    withRecipe(mapRecipeToProps),
    recipeAccess()
)
