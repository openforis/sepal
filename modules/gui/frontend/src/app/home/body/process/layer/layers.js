import {Padding} from 'widget/padding'
import {Panel} from 'widget/panel/panel'
import {SuperButton} from 'widget/superButton'
import {Toolbar} from 'widget/toolbar/toolbar'
import {activatable} from 'widget/activation/activatable'
import {compose} from 'compose'
import {msg} from 'translate'
import LayerDrop from './layerDrop'
// import PropTypes from 'prop-types'
import React from 'react'
// import _ from 'lodash'
import {Scrollable, ScrollableContainer} from 'widget/scrollable'
import styles from './layers.module.css'

export class _Layers extends React.Component {
    state = {
        areas: {
            center: 0
        },
        dragging: false,
        draggingPosition: {
            x: undefined,
            y: undefined
        },
        draggingValue: null
    }

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
        const {areas, dragging, draggingPosition, draggingValue} = this.state
        return (
            <LayerDrop
                className={styles.dropTarget}
                areas={areas}
                cursor={draggingPosition}
                value={draggingValue}
                dragging={dragging}
                onUpdate={nextAreas => {
                    this.setState({nextAreas})
                }}>
                {({value}) =>
                    <div className={styles.area}>
                        {value}
                    </div>
                }
            </LayerDrop>
        )
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
                    </Padding>
                </Scrollable>
            </ScrollableContainer>
        )
    }

    renderLayer(layer) {
        return (
            <SuperButton
                className={styles.layerButton}
                title='title'
                description='description'
                dragTooltip={msg('drag to drop area to show layer')}
                removeMessage={msg('please confirm removal of this layer')}
                removeTooltip={msg('remove this layer')}
                onDragStart={() => this.onDragStart(layer)}
                onDrag={cursor => this.onDrag(cursor)}
                onDragEnd={() => this.onDragEnd()}
                onRemove={() => null}
            />
        )
    }

    onDragStart(layer) {
        this.setState({
            dragging: true,
            draggingValue: layer
        })
    }

    onDrag(draggingPosition) {
        this.setState({draggingPosition})
    }

    onDragEnd() {
        this.setState(({nextAreas}) => ({
            dragging: false,
            areas: nextAreas
        }))
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
