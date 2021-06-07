import {CursorValue} from '../cursorValue'
import {MapAreaLayout} from '../mapAreaLayout'
import {Subject} from 'rxjs'
import {VisualizationSelector} from './visualizationSelector'
import {compose} from 'compose'
import {msg} from 'translate'
import {selectFrom} from 'stateUtils'
import {setActive, setComplete} from '../progress'
import {withMapAreaContext} from '../mapAreaContext'
import {withRecipe} from 'app/home/body/process/recipeContext'
import EarthEngineLayer from '../earthEngineLayer'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'
import withSubscriptions from 'subscription'

const mapRecipeToProps = (recipe, ownProps) => {
    const {source} = ownProps
    return {
        userDefinedVisualizations: selectFrom(recipe, ['layers.userDefinedVisualizations', source.id]) || []
    }
}

class _AssetImageLayer extends React.Component {
    progress$ = new Subject()
    cursorValue$ = new Subject()

    render() {
        const {map} = this.props
        return (
            <CursorValue value$={this.cursorValue$}>
                <MapAreaLayout
                    layer={this.maybeCreateLayer()}
                    form={this.renderImageLayerForm()}
                    map={map}
                />
            </CursorValue>
        )
    }

    renderImageLayerForm() {
        const {source, layerConfig = {}} = this.props
        const recipe = {
            type: 'ASSET',
            id: source.sourceConfig.asset
        }
        const visParamsToOption = visParams => ({
            value: visParams.id,
            label: visParams.bands.join(', '),
            visParams
        })
        const visualizations = source.sourceConfig.visualizations || []
        const options = [{
            label: msg('map.layout.addImageLayerSource.types.Asset.presets'),
            options: visualizations.map(visParamsToOption)
        }]
        return (
            <VisualizationSelector
                source={source}
                recipe={recipe}
                presetOptions={options}
                selectedVisParams={layerConfig.visParams}
            />
        )
    }

    componentDidMount() {
        const {addSubscription} = this.props
        addSubscription(this.progress$.subscribe(
            ({complete}) => complete
                ? this.setComplete('tiles')
                : this.setActive('tiles')
        ))
    }

    componentWillUnmount() {
        this.setComplete('initialize')
        this.setComplete('tiles')
        this.layer && this.layer.close()
    }

    selectFirstVisualization() {
        const {source, userDefinedVisualizations, layerConfig: {visParams} = {}, mapAreaContext: {updateLayerConfig}} = this.props
        const allVisualizations = [...userDefinedVisualizations, ...(selectFrom(source, 'sourceConfig.visualizations') || [])]
        if (allVisualizations.length && (!visParams || !allVisualizations.find(({id}) => id === visParams.id))) {
            const firstVisParams = allVisualizations[0]
            updateLayerConfig({visParams: firstVisParams})
            return firstVisParams
        } else {
            return visParams
        }
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
        const {layerConfig, map} = this.props
        return map && layerConfig && layerConfig.visParams
            ? this.createLayer()
            : null
    }

    createLayer() {
        const {layerConfig, map, source, boundsChanged$, dragging$, cursor$} = this.props
        const asset = selectFrom(source, 'sourceConfig.asset')
        const dataTypes = selectFrom(source, 'sourceConfig.metadata.dataTypes') || {}
        const {props: prevPreviewRequest} = this.layer || {}
        const previewRequest = {
            recipe: {
                type: 'ASSET',
                id: asset
            },
            ...layerConfig
        }
        if (!_.isEqual(previewRequest, prevPreviewRequest)) {
            this.layer && this.layer.close()
            this.layer = EarthEngineLayer.create({
                previewRequest,
                visParams: layerConfig.visParams,
                dataTypes,
                map,
                cursorValue$: this.cursorValue$,
                progress$: this.progress$,
                boundsChanged$,
                dragging$,
                cursor$,
                onInitialize: () => this.setActive('initialize'),
                onInitialized: () => this.setComplete('initialize')
            })
        }
        return this.layer
    }
}

export const AssetImageLayer = compose(
    _AssetImageLayer,
    withSubscriptions(),
    withRecipe(mapRecipeToProps),
    withMapAreaContext()
)

AssetImageLayer.propTypes = {
    source: PropTypes.any.isRequired,
    layerConfig: PropTypes.object,
    map: PropTypes.object
}
