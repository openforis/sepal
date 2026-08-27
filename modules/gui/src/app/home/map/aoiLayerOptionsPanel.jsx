import React from 'react'

import {recipeActionBuilder} from '~/app/home/body/process/recipe'
import {withRecipe} from '~/app/home/body/process/recipeContext'
import {compose} from '~/compose'
import {selectFrom} from '~/stateUtils'
import {msg} from '~/translate'
import {withActivatable} from '~/widget/activation/activatable'
import {ColorElement} from '~/widget/colorElement'
import {Layout} from '~/widget/layout'
import {Panel} from '~/widget/panel/panel'
import {Slider} from '~/widget/slider'
import {Widget} from '~/widget/widget'

import {resolveAoiStyle, withUpdatedAoiRenderSettings} from './aoiLayer'
import styles from './aoiLayerOptionsPanel.module.css'

const mapRecipeToProps = (recipe, {area}) => {
    const featureLayers = selectFrom(recipe, ['layers.areas', area, 'featureLayers']) || []
    const featureLayer = featureLayers.find(({sourceId}) => sourceId === 'aoi')
    return {
        recipeId: selectFrom(recipe, 'id'),
        layerConfig: featureLayer && featureLayer.layerConfig
    }
}

// The aoi's own options. Deliberately not the asset panel: an aoi has one geometry and no properties, so
// colour modes, per-value colours, point size and property filters have nothing to act on. Whole-layer
// opacity is absent too - that lives on the row scrubber.
class _AoiLayerOptionsPanel extends React.Component {
    constructor(props) {
        super(props)
        const {color, width, fillOpacity} = resolveAoiStyle(props.layerConfig)
        this.state = {color, width, fillOpacity}
        this.apply = this.apply.bind(this)
    }

    render() {
        const {activatable: {deactivate}} = this.props
        return (
            <Panel className={styles.panel} placement='modal' onBackdropClick={deactivate}>
                <Panel.Header
                    icon='palette'
                    title={msg('featureLayerSources.Aoi.type')}
                />
                <Panel.Content>
                    <Layout type='vertical'>
                        {this.renderColor()}
                        {this.renderWidth()}
                        {this.renderFillOpacity()}
                    </Layout>
                </Panel.Content>
                <Panel.Buttons>
                    <Panel.Buttons.Main>
                        <Panel.Buttons.Cancel keybinding='Escape' onClick={deactivate}/>
                        <Panel.Buttons.Apply keybinding='Enter' onClick={this.apply}/>
                    </Panel.Buttons.Main>
                </Panel.Buttons>
            </Panel>
        )
    }

    renderColor() {
        const {color} = this.state
        return (
            <Widget label={msg('map.featureLayerStyle.color')}>
                <ColorElement color={color} onChange={color => this.setState({color})}/>
            </Widget>
        )
    }

    renderWidth() {
        const {width} = this.state
        return (
            <Slider
                label={msg('map.featureLayerStyle.width')}
                value={width}
                minValue={1}
                maxValue={10}
                decimals={0}
                ticks={[1, 3, 5, 7, 10]}
                info={value => msg('map.featureLayerStyle.pixelValue', {value})}
                onChange={width => this.setState({width})}
            />
        )
    }

    // Percent-facing control over a 0..1 style value.
    renderFillOpacity() {
        const {fillOpacity} = this.state
        return (
            <Slider
                label={msg('map.featureLayerStyle.fillOpacity')}
                value={Math.round(fillOpacity * 100)}
                minValue={0}
                maxValue={100}
                ticks={[0, 25, 50, 75, 100]}
                info={value => msg('map.featureLayerStyle.percentValue', {value})}
                onChange={value => this.setState({fillOpacity: value / 100})}
            />
        )
    }

    apply() {
        const {recipeId, area, layerConfig, activatable: {deactivate}} = this.props
        const {color, width, fillOpacity} = this.state
        recipeActionBuilder(recipeId)('SET_AOI_LAYER_OPTIONS', {area})
            .set(
                ['layers.areas', area, 'featureLayers', {sourceId: 'aoi'}, 'layerConfig.style'],
                withUpdatedAoiRenderSettings(layerConfig, {color, width, fillOpacity})
            )
            .dispatch()
        deactivate()
    }
}

const policy = () => ({_: 'allow'})

export const AoiLayerOptionsPanel = compose(
    _AoiLayerOptionsPanel,
    withRecipe(mapRecipeToProps),
    withActivatable({
        id: ({area}) => `aoiLayerOptions-${area}`,
        policy,
        alwaysAllow: true
    })
)
