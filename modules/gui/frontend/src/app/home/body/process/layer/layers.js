import {LayerDrop} from './layerDrop'
import {Padding} from 'widget/padding'
import {Panel} from 'widget/panel/panel'
import {SuperButton} from 'widget/superButton'
import {Toolbar} from 'widget/toolbar/toolbar'
import {activatable} from 'widget/activation/activatable'
import {compose} from 'compose'
import {msg} from 'translate'
// import PropTypes from 'prop-types'
import {Scrollable, ScrollableContainer} from 'widget/scrollable'
import {Subject} from 'rxjs'
import {removeArea} from './layerAreas'
import React from 'react'
import styles from './layers.module.css'

export class _Layers extends React.Component {
    state = {
        areas: {
            center: 0
        }
    }

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
                    noVerticalPadding
                    className={styles.panelContent}>
                    {this.renderContent()}
                </Panel.Content>
                <Panel.Buttons onEnter={close} onEscape={close}>
                    <Panel.Buttons.Main>
                        <Panel.Buttons.Close onClick={close}/>
                    </Panel.Buttons.Main>
                </Panel.Buttons>
            </Panel>
        )
    }

    renderContent() {
        return (
            <div className={styles.content}>
                {this.renderDropTarget()}
                {this.renderLayers()}
            </div>
        )
    }

    renderDropTarget() {
        const {areas} = this.state
        return (
            <LayerDrop
                className={styles.dropTarget}
                areas={areas}
                drag$={this.drag$}
                onUpdate={areas => this.setState({areas})}>
                {({area, value}) => this.renderAreaInfo(area, value)}
            </LayerDrop>
        )
    }

    renderAreaInfo(area, value) {
        return (
            <SuperButton
                className={styles.layerButton}
                title={`Layer ${value}`}
                dragTooltip={msg('drag to drop area to show layer')}
                removeMessage={msg('please confirm removal of this layer')}
                removeTooltip={msg('remove this layer')}
                drag$={this.drag$}
                dragValue={value}
                onRemove={() => this.removeArea(area)}
            />
        )
    }

    removeArea(area) {
        const {areas} = this.state
        this.setState({areas: removeArea({areas, area})})
    }

    renderLayers() {
        return (
            <ScrollableContainer>
                <Scrollable className={styles.layers}>
                    <Padding noHorizontal>
                        {this.renderLayer(1)}
                        {this.renderLayer(2)}
                        {this.renderLayer(3)}
                        {this.renderLayer(4)}
                        {this.renderLayer(5)}
                        {this.renderLayer(6)}
                    </Padding>
                </Scrollable>
            </ScrollableContainer>
        )
    }

    renderLayer(layer) {
        return (
            <SuperButton
                className={styles.layerButton}
                title={`Layer ${layer}`}
                description='description'
                dragTooltip={msg('drag to drop area to show layer')}
                removeMessage={msg('please confirm removal of this layer')}
                removeTooltip={msg('remove this layer')}
                drag$={this.drag$}
                dragValue={layer}
                onRemove={() => null}
            />
        )
    }
}

const policy = () => ({
    _: 'allow'
})

export const Layers = compose(
    _Layers,
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
