import {Notifications} from 'widget/notifications'
import {Subject, map, of, switchMap, takeUntil} from 'rxjs'
import {compose} from 'compose'
import {getAllVisualizations} from '../ccdc/ccdcRecipe'
import {getAvailableBands} from 'sources'
import {msg} from 'translate'
import {recipeAccess} from '../../recipeAccess'
import {selectFrom} from 'stateUtils'
import {toVisualizations} from 'app/home/map/imageLayerSource/assetVisualizationParser'
import {withRecipe} from '../../recipeContext'
import React from 'react'
import _ from 'lodash'
import api from 'apiRegistry'
import guid from 'guid'

const baseBandPattern = /(.*)_(coefs|intercept|slope|phase_\d|amplitude_\d|rmse|magnitude)$/

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
            api.gee.assetMetadata$({asset: source.id}).pipe(
                takeUntil(this.cancel$)
            ),
            metadata => this.updateAssetSource(source.id, metadata),
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
                switchMap(ccdcRecipe => {
                    return ccdcRecipe.model.sources?.classification
                        ? loadRecipe$(ccdcRecipe.model.sources.classification).pipe(
                            map(classificationRecipe => ({ccdcRecipe, classificationRecipe}))
                        )
                        : of({ccdcRecipe})
                }
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
        if (!stream('LOAD').active) {
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
    }

    toAssetSource(id, metadata) {
        const bands = metadata.bandNames
        const bandAndType = _.chain(bands)
            .map(sourceBand => sourceBand.match(baseBandPattern))
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
        const dateFormat = metadata.properties.dateFormat
        return {
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
    }
    
    updateAssetSource(id, metadata) {
        const {recipeActionBuilder} = this.props
        const sourceDetails = this.toAssetSource(id, metadata)
        recipeActionBuilder('UPDATE_SOURCE', {sourceDetails})
            .set('model.source', sourceDetails)
            .dispatch()
    }

    updateRecipeSource({ccdcRecipe, classificationRecipe}) {
        const {source, recipeActionBuilder} = this.props
        const nextSource = ccdcRecipe.type === 'ASSET_MOSAIC'
            ? this.assetRecipeSource(ccdcRecipe)
            : this.ccdcRecipeSource({ccdcRecipe, classificationRecipe})
        if (!_.isEqual(source, nextSource)) {
            recipeActionBuilder('UPDATE_SOURCE', {source})
                .set('model.source', nextSource)
                .dispatch()
        }
    }

    assetRecipeSource(recipe) {
        const metadata = recipe.model.assetDetails.metadata
        return {
            ...this.toAssetSource(metadata.assetId, metadata),
            ...metadata.properties,
            targetType: 'ASSET_MOSAIC',
            type: 'RECIPE_REF',
            id: recipe.id,
        }
    }

    ccdcRecipeSource({ccdcRecipe, classificationRecipe}) {
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

export const SourceSync = compose(
    _SourceSync,
    withRecipe(mapRecipeToProps),
    recipeAccess()
)
