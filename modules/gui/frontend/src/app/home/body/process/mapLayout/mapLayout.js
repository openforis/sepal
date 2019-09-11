import {AddLayer} from './addLayer'
import {Areas} from './areas'
import {Layers} from './layers'
import {Panel} from 'widget/panel/panel'
import {SelectRecipe} from './selectRecipe'
import {Subject} from 'rxjs'
import {Toolbar} from 'widget/toolbar/toolbar'
import {activatable} from 'widget/activation/activatable'
import {activator} from 'widget/activation/activator'
import {compose} from 'compose'
import {msg} from 'translate'
import {withRecipe} from 'app/home/body/process/recipeContext'
import React from 'react'
import styles from './mapLayout.module.css'

const mapRecipeToProps = recipe => {
    return {
        recipeId: recipe.id
    }
}

export class MapLayout extends React.Component {
    render() {
        return (
            <React.Fragment>
                <MapLayoutPanel/>
                <AddLayer/>
                <SelectRecipe/>
            </React.Fragment>
        )
    }
}

class _MapLayoutPanel extends React.Component {
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
        const {activator: {activatables: {addLayer}}} = this.props
        addLayer.activate()
    }
}

const policy = () => ({
    _: 'allow'
})

const MapLayoutPanel = compose(
    _MapLayoutPanel,
    withRecipe(mapRecipeToProps),
    activatable({id: 'mapLayout', policy}),
    activator('addLayer')
)

MapLayout.propTypes = {}

export class MapLayoutButton extends React.Component {
    render() {
        return (
            <Toolbar.ActivationButton
                id='mapLayout'
                icon='layer-group'
                tooltip={msg('process.mosaic.mapToolbar.layers.tooltip')}
                disabled={false}
            />
        )
    }
}
