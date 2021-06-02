import {compose} from 'compose'
import {getAllVisualizations} from '../ccdc/ccdcRecipe'
import {getAvailableBands} from 'sources'
import {map, switchMap} from 'rxjs/operators'
import {msg} from 'translate'
import {of} from 'rxjs'
import {recipeAccess} from '../../recipeAccess'
import {selectFrom} from 'stateUtils'
import {toVisualizations} from 'app/home/map/imageLayerSource/assetVisualizationParser'
import {withRecipe} from '../../recipeContext'
import Notifications from 'widget/notifications'
import React from 'react'
import _ from 'lodash'
import api from 'api'
import guid from 'guid'

export const withSourceDetails = () =>
    WrappedComponent => {
        const mapRecipeToProps = (recipe, ownProps) => {
            return {
                ...ownProps,
                source_: selectFrom(recipe, 'model.source') || {},
                sourceDetails: selectFrom(recipe, 'ui.sourceDetails') || {},
            }
        }

        class HigherOrderComponent extends React.Component {
            render() {
                const {sourceDetails = {}} = this.props
                const props = sourceDetails.type === 'RECIPE_REF'
                    ? {...this.props, sourceDetails: this.recipeSourceDetails()}
                    : {...this.props}
                return React.createElement(WrappedComponent, props)
            }

            componentDidMount() {
                this.initSource()
            }

            componentDidUpdate(prevProps) {
                const {source_: prevSource} = prevProps
                const {source_: source, sourceDetails, stream} = this.props
                if (source.id && !stream('LOAD_SOURCE').active && (!sourceDetails.id || sourceDetails.id !== prevSource.id)) {
                    this.initSource()
                }
            }

            initSource() {
                const {source_: source} = this.props
                if (!source.id) {
                    return
                }
                source.type === 'RECIPE_REF'
                    ? this.loadRecipe()
                    : this.loadAsset()
            }

            loadAsset() {
                const {stream, source_: source = {}} = this.props
                stream('LOAD_SOURCE',
                    api.gee.imageMetadata$({asset: source.id}),
                    metadata => this.updateAssetSourceDetails(source.id, metadata),
                    error => Notifications.error({message: msg('process.ccdcSlice.source.asset.loadError'), error})
                )
            }

            loadRecipe() {
                const {stream, source_: source = {}, loadRecipe$} = this.props
                stream('LOAD_SOURCE',
                    loadRecipe$(source.id).pipe(
                        switchMap(loadedRecipe => loadedRecipe.model.sources.classification
                            ? loadRecipe$(loadedRecipe.model.sources.classification).pipe(
                                map(classification => ({loadedRecipe, classification}))
                            )
                            : of({loadedRecipe})
                        )
                    ),
                    ({loadedRecipe, classification}) => {
                        this.updateRecipeSourceDetails({loadedRecipe, classification})
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
                const dateFormat = metadata.properties.dateFormat
                const builder = recipeActionBuilder('UPDATE_RECIPE_SOURCE_DETAILS', {sourceDetails})
                    .set('ui.sourceDetails', sourceDetails)
                _.isNil(dateFormat)
                    ? builder.dispatch()
                    : builder.set('model.source.dateFormat', dateFormat).dispatch()
            }

            updateRecipeSourceDetails({loadedRecipe, classification = {}}) {
                const {recipeActionBuilder} = this.props
                const sourceDetails = {
                    type: 'RECIPE_REF',
                    id: loadedRecipe.id,
                    classificationId: classification.id,
                }
                const dateFormat = loadedRecipe.model.ccdcOptions.dateFormat
                recipeActionBuilder('UPDATE_RECIPE_SOURCE_DETAILS', {sourceDetails})
                    .set('ui.sourceDetails', sourceDetails)
                    .set('model.source.dateFormat', dateFormat)
                    .dispatch()
            }

            recipeSourceDetails() {
                const {sourceDetails, loadedRecipes} = this.props
                const loadedRecipe = loadedRecipes[sourceDetails.id]
                const classification = loadedRecipes[sourceDetails.classificationId]
                const corrections = loadedRecipe.model.options.corrections
                const bands = getAvailableBands({
                    sources: loadedRecipe.model.sources.dataSets,
                    corrections,
                    timeScan: false,
                    classification: classification
                        ? {
                            classifierType: classification.model.classifier.type,
                            classificationLegend: classification.model.legend,
                            include: ['regression', 'probabilities']
                        }
                        : {}
                })
                return {
                    type: 'RECIPE_REF',
                    id: loadedRecipe.id,
                    bands,
                    dateFormat: loadedRecipe.model.ccdcOptions.dateFormat,
                    startDate: loadedRecipe.model.dates.startDate,
                    endDate: loadedRecipe.model.dates.endDate,
                    visualizations: getAllVisualizations(loadedRecipe)
                }
            }
        }

        return compose(
            HigherOrderComponent,
            withRecipe(mapRecipeToProps),
            recipeAccess()
        )
    }
