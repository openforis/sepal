import {LayerDrop} from './layerDrop'
import {Panel} from 'widget/panel/panel'
import {Scrollable, ScrollableContainer} from 'widget/scrollable'
import {Subject} from 'rxjs'
import {SuperButton} from 'widget/superButton'
import {Toolbar} from 'widget/toolbar/toolbar'
import {activatable} from 'widget/activation/activatable'
import {compose} from 'compose'
import {msg} from 'translate'
import {recipeActionBuilder} from '../recipe'
import {removeArea} from './layerAreas'
import {withRecipe} from 'app/home/body/process/recipeContext'
// import PropTypes from 'prop-types'
import {v4 as uuid} from 'uuid'
import React from 'react'
import _ from 'lodash'
import styles from './layers.module.css'

const mapRecipeToProps = recipe => {
    const map = recipe.map || {}
    return {
        recipeId: recipe.id,
        layers: map.layers || [],
        areas: map.areas || {}
    }
}

export class _Layers extends React.Component {
    drag$ = new Subject()

    render() {
        const {activatable: {deactivate}} = this.props
        const close = deactivate
        return (
            <Panel
                className={styles.panel}
                type='modal'>
                <Panel.Header
                    icon='layer-group'
                    title={msg('process.mosaic.panel.layers.title')}/>
                <Panel.Content
                    scrollable={false}
                    className={styles.panelContent}>
                    {this.renderContent()}
                </Panel.Content>
                <Panel.Buttons onEnter={close} onEscape={close}>
                    <Panel.Buttons.Main>
                        <Panel.Buttons.Close onClick={close}/>
                    </Panel.Buttons.Main>
                    <Panel.Buttons.Extra>
                        <Panel.Buttons.Add onClick={() => this.addLayer()}/>
                    </Panel.Buttons.Extra>
                </Panel.Buttons>
            </Panel>
        )
    }

    renderContent() {
        return (
            <div className={styles.content}>
                {this.renderAreas()}
                {this.renderLayers()}
            </div>
        )
    }

    renderAreas() {
        const {areas} = this.props
        return (
            <LayerDrop
                areas={areas}
                drag$={this.drag$}
                onUpdate={areas => this.updateAreas(areas)}>
                {({area, value}) => this.renderArea(area, value)}
            </LayerDrop>
        )
    }

    renderArea(area, layerId) {
        return (
            <SuperButton
                title={`Layer ${layerId}`}
                dragTooltip={msg('drag to drop area to show layer')}
                removeMessage={msg('please confirm removal of this layer')}
                removeTooltip={msg('remove this layer')}
                drag$={this.drag$}
                dragValue={layerId}
                onRemove={() => this.removeArea(area)}
            />
        )
    }

    renderLayers() {
        const {layers} = this.props
        return (
            <ScrollableContainer>
                <Scrollable className={styles.layers}>
                    {layers.map(layer => this.renderLayer(layer.id))}
                </Scrollable>
            </ScrollableContainer>
        )
    }

    renderLayer(layerId) {
        return (
            <SuperButton
                key={layerId}
                title={`Layer ${layerId}`}
                description='description'
                dragTooltip={msg('drag to drop area to show layer')}
                removeMessage={msg('please confirm removal of this layer')}
                removeTooltip={msg('remove this layer')}
                drag$={this.drag$}
                dragValue={layerId}
                onRemove={() => this.removeLayer(layerId)}
            />
        )
    }

    componentDidMount() {
        const {areas, layers} = this.props
        this.actionBuilder('SAVE_AREAS_AND_LAYERS')
            .set('map.areas', areas)
            .set('map.layers', layers)
            .dispatch()
    }

    updateAreas(areas) {
        this.actionBuilder('UPDATE_AREAS')
            .set('map.areas', areas)
            .dispatch()
    }

    removeArea(area) {
        const {areas} = this.props
        this.actionBuilder('REMOVE_AREA')
            .set('map.areas', removeArea({areas, area}))
            .dispatch()
    }

    addLayer() {
        this.actionBuilder('REMOVE_LAYER')
            .push('map.layers', {id: uuid().substr(-10)})
            .dispatch()
    }

    removeLayer(layerId) {
        const {areas} = this.props
        const removeAreaByLayer = (areas, layerId) => {
            const area = _.chain(areas)
                .pickBy(areaLayerId => areaLayerId === layerId)
                .keys()
                .first()
                .value()
            return area
                ? removeAreaByLayer(removeArea({areas, area}), layerId)
                : areas
        }
        this.actionBuilder('REMOVE_LAYER')
            .del(['map.layers', {id: layerId}])
            .set('map.areas', removeAreaByLayer(areas, layerId))
            .dispatch()
    }

    actionBuilder(type, props) {
        const {recipeId} = this.props
        return recipeActionBuilder(recipeId)(type, props)
    }
}

const policy = () => ({
    _: 'allow'
})

export const Layers = compose(
    _Layers,
    withRecipe(mapRecipeToProps),
    activatable({id: 'layers', policy})
)

Layers.propTypes = {

}

export class LayersButton extends React.Component {
    render() {
        return (
            <Toolbar.ActivationButton
                id='layers'
                icon='layer-group'
                tooltip={msg('process.mosaic.mapToolbar.layers.tooltip')}
                disabled={false}
            />
        )
    }
}
