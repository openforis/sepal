import {CursorValueContext} from '../cursorValue'
import {MapAreaLayout} from '../mapAreaLayout'
import {Subject} from 'rxjs'
import {VisualizationSelector} from './visualizationSelector'
import {compose} from 'compose'
import {msg} from 'translate'
import {selectFrom} from 'stateUtils'
import {withMapArea} from '../mapAreaContext'
import {withRecipe} from 'app/home/body/process/recipeContext'
import {withSubscriptions} from 'subscription'
import {withTab} from 'widget/tabs/tabContext'
import EarthEngineImageLayer from '../layer/earthEngineImageLayer'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'

const mapRecipeToProps = (recipe, ownProps) => {
    const {source} = ownProps
    return {
        userDefinedVisualizations: selectFrom(recipe, ['layers.userDefinedVisualizations', source.id]) || []
    }
}

class _AssetImageLayer extends React.Component {
    cursorValue$ = new Subject()

    render() {
        const {map} = this.props
        return (
            <CursorValueContext cursorValue$={this.cursorValue$}>
                <MapAreaLayout
                    layer={this.maybeCreateLayer()}
                    form={this.renderImageLayerForm()}
                    map={map}
                />
            </CursorValueContext>
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
        this.selectFirstVisualization()
    }

    selectFirstVisualization() {
        const {source, userDefinedVisualizations, layerConfig: {visParams} = {}, mapArea: {updateLayerConfig}} = this.props
        const allVisualizations = [...userDefinedVisualizations, ...(selectFrom(source, 'sourceConfig.visualizations') || [])]
        if (allVisualizations.length && (!visParams || !allVisualizations.find(({id}) => id === visParams.id))) {
            const firstVisParams = allVisualizations[0]
            updateLayerConfig({visParams: firstVisParams})
            return firstVisParams
        } else {
            return visParams
        }
    }

    maybeCreateLayer() {
        const {layerConfig, map} = this.props
        return map && layerConfig && layerConfig.visParams
            ? this.createLayer()
            : null
    }

    createLayer() {
        const {layerConfig, map, source, boundsChanged$, dragging$, cursor$, tab: {busy$}} = this.props
        const asset = selectFrom(source, 'sourceConfig.asset')
        const dataTypes = selectFrom(source, 'sourceConfig.metadata.dataTypes') || {}
        const {watchedProps: prevPreviewRequest} = this.layer || {}
        const previewRequest = {
            recipe: {
                type: 'ASSET',
                id: asset
            },
            ...layerConfig
        }
        if (!_.isEqual(previewRequest, prevPreviewRequest)) {
            this.layer && this.layer.removeFromMap()
            this.layer = new EarthEngineImageLayer({
                previewRequest,
                visParams: layerConfig.visParams,
                dataTypes,
                map,
                cursorValue$: this.cursorValue$,
                busy$,
                boundsChanged$,
                dragging$,
                cursor$
            })
        }
        return this.layer
    }
}

export const AssetImageLayer = compose(
    _AssetImageLayer,
    withSubscriptions(),
    withRecipe(mapRecipeToProps),
    withMapArea(),
    withTab()
)

AssetImageLayer.propTypes = {
    source: PropTypes.any.isRequired,
    boundsChanged$: PropTypes.any,
    cursor$: PropTypes.any,
    dragging$: PropTypes.any,
    layerConfig: PropTypes.object,
    map: PropTypes.object
}
