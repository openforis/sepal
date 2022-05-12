import {Subject, map, of, switchMap, takeUntil} from 'rxjs'
import {compose} from 'compose'
import {getAllVisualizations} from '../ccdc/ccdcRecipe'
import {getAvailableBands} from 'sources'
import {msg} from 'translate'
import {recipeAccess} from '../../recipeAccess'
import {selectFrom} from 'stateUtils'
import {toVisualizations} from 'app/home/map/imageLayerSource/assetVisualizationParser'
import {withRecipe} from '../../recipeContext'
import Notifications from 'widget/notifications'
import React from 'react'
import _ from 'lodash'
import api from 'api'
import guid from 'guid'

const baseBandPattern = /(.*)_(coefs|intercept|slope|phase_\d|amplitude_\d|rmse|magnitude)$/

const mapRecipeToProps = (recipe, ownProps) => {
    return {
        ...ownProps,
        reference: selectFrom(recipe, 'model.reference') || {}
    }
}

class _ReferenceSync extends React.Component {
    cancel$ = new Subject()

    render() {
        return null
    }

    componentDidMount() {
        this.initReference()
    }

    componentDidUpdate(prevProps) {
        const {reference: prevReference} = prevProps
        const {reference} = this.props
        if (reference.id !== prevReference.id
            || selectFrom(reference, 'classification.id') !== selectFrom(prevReference, 'classification.id')) {
            this.cancel$.next()
        }
        this.initReference(prevReference)
    }

    initReference(prevReference) {
        const {reference} = this.props
        if (!reference.id) {
            return
        }
        reference.type === 'RECIPE_REF'
            ? this.initRecipe()
            : this.initAsset(prevReference)
    }

    initAsset(prevReference = {}) {
        const {stream, reference = {}} = this.props
        if (reference.id && reference.id === prevReference.id || stream('LOAD').active) {
            return
        }
        stream('LOAD',
            api.gee.imageMetadata$({asset: reference.id}).pipe(
                takeUntil(this.cancel$)
            ),
            metadata => this.updateAssetReference(reference.id, metadata, reference),
            error => Notifications.error({message: msg('process.changeAlerts.reference.asset.loadError'), error})
        )
    }

    initRecipe() {
        const {stream, reference, loadedRecipes} = this.props
        const ccdcRecipe = loadedRecipes[reference.id]
        if (ccdcRecipe) {
            const classificationId = selectFrom(ccdcRecipe, 'model.sources.classification')
            const classificationRecipe = classificationId && loadedRecipes[classificationId]
            if (classificationId && !classificationRecipe) {
                this.loadClassificationRecipe({ccdcRecipe, classificationId})
            } else {
                this.updateRecipeReference({ccdcRecipe, classificationRecipe})
            }
        } else if (!stream('LOAD').active) {
            this.loadCcdcRecipe(reference.id)
        }
    }

    loadCcdcRecipe(recipeId) {
        const {stream, loadRecipe$} = this.props
        stream('LOAD',
            loadRecipe$(recipeId).pipe(
                switchMap(ccdcRecipe => ccdcRecipe.model.sources.classification
                    ? loadRecipe$(ccdcRecipe.model.sources.classification).pipe(
                        map(classificationRecipe => ({ccdcRecipe, classificationRecipe}))
                    )
                    : of({ccdcRecipe})
                ),
                takeUntil(this.cancel$)
            ),
            ({ccdcRecipe, classificationRecipe}) => {
                this.updateRecipeReference({ccdcRecipe, classificationRecipe})
            },
            error => Notifications.error({message: msg('process.changeAlerts.reference.recipe.loadError'), error})
        )
    }

    loadClassificationRecipe({ccdcRecipe, classificationId}) {
        const {stream, loadRecipe$} = this.props
        if (!stream('LOAD').active) {
            stream('LOAD',
                loadRecipe$(classificationId).pipe(
                    takeUntil(this.cancel$)
                ),
                classificationRecipe => {
                    this.updateRecipeReference({ccdcRecipe, classificationRecipe})
                },
                error => Notifications.error({message: msg('process.changeAlerts.reference.recipe.loadError'), error})
            )
        }
    }

    updateAssetReference(id, metadata, reference) {
        const {recipeActionBuilder} = this.props
        const bands = metadata.bands
        const bandAndType = _.chain(bands)
            .map(referenceBand => referenceBand.match(baseBandPattern))
            .filter(match => match)
            .map(([_, name, bandType]) => bandType === 'coefs'
                ? ['value', 'intercept', 'slope', 'phase_1', 'amplitude_1', 'phase_2', 'amplitude_2', 'phase_3', 'amplitude_3']
                    .map(bandType => ({name, bandType}))
                : [{name, bandType}]
            )
            .flatten()
            .value()
        const bandByName = _.groupBy(bandAndType, ({name}) => name)
        const baseBands = _.chain(bandAndType)
            .map(({name}) => name)
            .uniq()
            .map(name => ({name, bandTypes: bandByName[name].map(({bandType}) => bandType)}))
            .value()
        const segmentBands = bands
            .filter(name => ['tStart', 'tEnd', 'tBreak', 'numObs', 'changeProb'].includes(name))
            .map(name => ({name}))
        const assetDateFormat = metadata.properties.dateFormat
        const dateFormat = assetDateFormat === undefined ? reference.dateFormat : assetDateFormat
        const referenceDetails = {
            type: 'ASSET',
            id,
            bands,
            baseBands,
            segmentBands,
            dateFormat,
            startDate: metadata.properties.startDate,
            endDate: metadata.properties.endDate,
            visualizations: toVisualizations(metadata.properties, bands)
                .map(visualization => ({...visualization, id: guid()}))
        }
        recipeActionBuilder('UPDATE_REFERENCE', {referenceDetails})
            .set('model.reference', referenceDetails)
            .dispatch()
    }

    updateRecipeReference({ccdcRecipe, classificationRecipe}) {
        const {reference, recipeActionBuilder} = this.props
        const nextReference = this.recipeReference({ccdcRecipe, classificationRecipe})
        if (!_.isEqual(reference, nextReference)) {
            recipeActionBuilder('UPDATE_REFERENCE', {reference})
                .set('model.reference', nextReference)
                .dispatch()
        }
    }

    recipeReference({ccdcRecipe, classificationRecipe}) {
        const corrections = ccdcRecipe.model.options.corrections
        const baseBands = getAvailableBands({
            dataSets: Object.values(ccdcRecipe.model.sources.dataSets).flat(),
            corrections,
            classification: classificationRecipe
                ? {
                    id: classificationRecipe.id,
                    classifierType: classificationRecipe.model.classifier.type,
                    classificationLegend: classificationRecipe.model.legend,
                    include: ['regression', 'probabilities']
                }
                : {}
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
    withRecipe(mapRecipeToProps),
    recipeAccess()
)
