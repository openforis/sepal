import {Areas} from './areas'
import {Layers} from './layers'
import {Panel} from 'widget/panel/panel'
import {Subject} from 'rxjs'
import {Toolbar} from 'widget/toolbar/toolbar'
import {activatable} from 'widget/activation/activatable'
import {compose} from 'compose'
import {msg} from 'translate'
import {v4 as uuid} from 'uuid'
import {withRecipe} from 'app/home/body/process/recipeContext'
import React from 'react'
import _ from 'lodash'
import styles from './mapLayout.module.css'

const mapRecipeToProps = recipe => {
    return {
        recipeId: recipe.id
    }
}

export class _MapLayout extends React.Component {
    layerDrag$ = new Subject()

    render() {
        const {activatable: {deactivate}} = this.props
        const close = deactivate
        return (
            <Panel
                className={styles.panel}
                type='modal'>
                <Panel.Header
                    icon='layer-group'
                    title={msg('map.layout.title')}/>
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
                <Areas layerDrag$={this.layerDrag$}/>
                <Layers drag$={this.layerDrag$}/>
            </div>
        )
    }

    addLayer() {
        const {recipeActionBuilder} = this.props
        recipeActionBuilder('ADD_LAYER')
            .push('map.layers', {id: uuid().substr(-10)})
            .dispatch()
    }
}

const policy = () => ({
    _: 'allow'
})

export const MapLayout = compose(
    _MapLayout,
    withRecipe(mapRecipeToProps),
    activatable({id: 'layers', policy})
)

MapLayout.propTypes = {}

export class MapLayoutButton extends React.Component {
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
