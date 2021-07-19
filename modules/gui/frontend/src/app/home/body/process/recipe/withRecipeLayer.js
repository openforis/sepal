import {CursorValue} from 'app/home/map/cursorValue'
import {Subject} from 'rxjs'
import {compose} from 'compose'
import {connect} from 'store'
import {selectFrom} from 'stateUtils'
import {setActive, setComplete} from 'app/home/map/progress'
import {withRecipe} from '../recipeContext'
import EarthEnginePreviewLayer from 'app/home/map/layer/earthEnginePreviewLayer'
import React from 'react'
import _ from 'lodash'
import withSubscriptions from 'subscription'

export const withRecipeLayer = ({
    toDataTypes = (() => ({})),
    toRecipeIds = (recipe => [recipe.id])
}) => {
    const mapStateToProps = (state, {recipe}) => {
        const recipeIds = toRecipeIds(recipe)
        return {
            recipes: recipeIds
                .map(recipeId => selectFrom(state, ['process.loadedRecipes', recipeId]))
                .filter(recipe => recipe)
        }
    }
    return WrappedComponent => {
        class _HigherOrderComponent extends React.Component {
            progress$ = new Subject()
            cursorValue$ = new Subject()

            render() {
                const props = {
                    ..._.omit(this.props, 'recipes'),
                    layer: this.maybeCreateLayer()
                }
                return (
                    <CursorValue value$={this.cursorValue$}>
                        {React.createElement(WrappedComponent, props)}
                    </CursorValue>
                )
            }
            componentDidMount() {
                const {addSubscription} = this.props
                addSubscription(
                    this.progress$.subscribe(
                        ({complete}) => complete
                            ? this.setComplete('tiles')
                            : this.setActive('tiles')
                    )
                )
            }

            componentWillUnmount() {
                this.setComplete('initialize')
                this.setComplete('tiles')
                this.layer && this.layer.removeFromMap()
            }

            setActive(name) {
                const {recipeActionBuilder, componentId} = this.props
                setActive(`${name}-${componentId}`, recipeActionBuilder)
            }

            setComplete(name) {
                const {recipeActionBuilder, componentId} = this.props
                setComplete(`${name}-${componentId}`, recipeActionBuilder)
            }
            maybeCreateLayer() {
                const {recipe, layerConfig, map} = this.props
                return map && recipe.ui.initialized && layerConfig && layerConfig.visParams
                    ? this.createLayer()
                    : null
            }

            createLayer() {
                const {recipe, recipes, layerConfig, map, boundsChanged$, dragging$, cursor$} = this.props
                const dataTypes = toDataTypes(recipe)
                const {watchedProps: prevWatchedProps} = this.layer || {}
                const previewRequest = {
                    recipe: _.omit(recipe, ['ui', 'layers']),
                    ...layerConfig
                }
                const watchedProps = {recipes: recipes.map(r => _.omit(r, ['ui', 'layers'])), layerConfig}
                if (!_.isEqual(watchedProps, prevWatchedProps)) {
                    this.layer && this.layer.removeFromMap()
                    this.layer = new EarthEnginePreviewLayer({
                        previewRequest,
                        watchedProps,
                        dataTypes,
                        visParams: layerConfig.visParams,
                        map,
                        progress$: this.progress$,
                        cursorValue$: this.cursorValue$,
                        boundsChanged$,
                        dragging$,
                        cursor$,
                        onInitialize: () => this.setActive('initialize'),
                        onInitialized: () => this.setComplete('initialize'),
                        onError: () => this.setComplete('initialize')
                    })
                }
                return this.layer
            }
        }

        return compose(
            _HigherOrderComponent,
            connect(mapStateToProps),
            withRecipe(),

            withSubscriptions()
        )
    }
}

