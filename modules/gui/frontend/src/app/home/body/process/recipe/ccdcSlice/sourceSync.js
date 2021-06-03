import {Subject, of} from 'rxjs'
import {compose} from 'compose'
import {getAllVisualizations} from '../ccdc/ccdcRecipe'
import {getAvailableBands} from 'sources'
import {map, switchMap, takeUntil} from 'rxjs/operators'
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

const mapRecipeToProps = (recipe, ownProps) => {
    return {
        ...ownProps,
        source: selectFrom(recipe, 'model.source') || {}
    }
}

class _SourceSync extends React.Component {
    cancel$ = new Subject()

    render() {
        return null
    }

    componentDidMount() {
        this.initSource()
    }

    componentDidUpdate(prevProps) {
        const {source: prevSource} = prevProps
        const {source} = this.props
        if (source.id !== prevSource.id
            || selectFrom(source, 'classification.id') !== selectFrom(prevSource, 'classification.id')) {
            this.cancel$.next()
        }
        this.initSource(prevSource)
    }

    initSource(prevSource) {
        const {source} = this.props
        if (!source.id) {
            return
        }
        source.type === 'RECIPE_REF'
            ? this.initRecipe()
            : this.initAsset(prevSource)
    }

    initAsset(prevSource = {}) {
        const {stream, source = {}} = this.props
        if (source.id && source.id === prevSource.id || stream('LOAD').active) {
            return
        }
        stream('LOAD',
            api.gee.imageMetadata$({asset: source.id}).pipe(
                takeUntil(this.cancel$)
            ),
            metadata => this.updateAssetSourceDetails(source.id, metadata),
            error => Notifications.error({message: msg('process.ccdcSlice.source.asset.loadError'), error})
        )
    }

    initRecipe() {
        const {stream, source, loadedRecipes} = this.props
        const ccdcRecipe = loadedRecipes[source.id]
        if (ccdcRecipe) {
            const classificationId = selectFrom(ccdcRecipe, 'model.sources.classification')
            const classificationRecipe = classificationId && loadedRecipes[classificationId]
            if (classificationId && !classificationRecipe) {
                this.loadClassificationRecipe({ccdcRecipe, classificationId})
            } else {
                this.updateRecipeSource({ccdcRecipe, classificationRecipe})
            }
        } else if (!stream('LOAD').active) {
            this.loadCcdcRecipe(source.id)
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
                this.updateRecipeSource({ccdcRecipe, classificationRecipe})
            },
            error => Notifications.error({message: msg('process.ccdcSlice.source.recipe.loadError'), error})
        )
    }

    loadClassificationRecipe({ccdcRecipe, classificationId}) {
        const {stream, loadRecipe$} = this.props
        stream('LOAD',
            loadRecipe$(classificationId).pipe(
                takeUntil(this.cancel$)
            ),
            classificationRecipe => {
                this.updateRecipeSource({ccdcRecipe, classificationRecipe})
            },
            error => Notifications.error({message: msg('process.ccdcSlice.source.recipe.loadError'), error})
        )
    }

    updateAssetSourceDetails(id, metadata) {
        const {recipeActionBuilder} = this.props
        const sourceDetails = {
            type: 'ASSET',
            id,
            bands: metadata.bands,
            dateFormat: metadata.properties.dateFormat,
            startDate: metadata.properties.startDate,
            endDate: metadata.properties.endDate,
            visualizations: toVisualizations(metadata.properties, metadata.bands)
                .map(visualization => ({...visualization, id: guid()}))
        }
        recipeActionBuilder('UPDATE_SOURCE', {sourceDetails})
            .set('model.source', sourceDetails)
            .dispatch()
    }

    updateRecipeSource({ccdcRecipe, classificationRecipe}) {
        const {source, recipeActionBuilder} = this.props
        const nextSource = this.recipeSource({ccdcRecipe, classificationRecipe})
        if (!_.isEqual(source, nextSource)) {
            recipeActionBuilder('UPDATE_SOURCE', {source})
                .set('model.source', nextSource)
                .dispatch()
        }
    }

    recipeSource({ccdcRecipe, classificationRecipe}) {
        const corrections = ccdcRecipe.model.options.corrections
        const bands = getAvailableBands({
            sources: ccdcRecipe.model.sources.dataSets,
            corrections,
            timeScan: false,
            classification: classificationRecipe
                ? {
                    id: classificationRecipe.id,
                    classifierType: classificationRecipe.model.classifier.type,
                    classificationLegend: classificationRecipe.model.legend,
                    include: ['regression', 'probabilities']
                }
                : {}
        })
        return {
            type: 'RECIPE_REF',
            id: ccdcRecipe.id,
            bands,
            dateFormat: ccdcRecipe.model.ccdcOptions.dateFormat,
            startDate: ccdcRecipe.model.dates.startDate,
            endDate: ccdcRecipe.model.dates.endDate,
            visualizations: getAllVisualizations(ccdcRecipe)
        }
    }
}

export const SourceSync = compose(
    _SourceSync,
    withRecipe(mapRecipeToProps),
    recipeAccess()
)
