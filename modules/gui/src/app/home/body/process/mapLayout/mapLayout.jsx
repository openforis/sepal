import React from 'react'
import {Subject} from 'rxjs'

import {withRecipe} from '~/app/home/body/process/recipeContext'
import {compose} from '~/compose'
import {selectFrom} from '~/stateUtils'
import {msg} from '~/translate'
import {withActivatable} from '~/widget/activation/activatable'
import {withActivators} from '~/widget/activation/activator'
import {Buttons} from '~/widget/buttons'
import {ButtonSelect} from '~/widget/buttonSelect'
import {Layout} from '~/widget/layout'
import {Message} from '~/widget/message'
import {Padding} from '~/widget/padding'
import {Panel} from '~/widget/panel/panel'
import {Toolbar} from '~/widget/toolbar/toolbar'
import {isChromiumBasedBrowser, isHighDensityDisplay} from '~/widget/userAgent'

import {Areas} from './areas'
import {ImageLayerSources} from './imageLayerSources'
import styles from './mapLayout.module.css'
import {SelectAsset} from './selectAsset'
import {SelectPlanet} from './selectPlanet'
import {SelectRecipe} from './selectRecipe'

export class MapLayout extends React.Component {
    render() {
        return (
            <React.Fragment>
                <MapLayoutPanel/>
                <SelectRecipe/>
                <SelectAsset/>
                <SelectPlanet/>
            </React.Fragment>
        )
    }
}

const mapRecipeToProps = recipe => ({
    recipe,
    mode: selectFrom(recipe, 'layers.mode')
})

class _MapLayoutPanel extends React.Component {
    sourceDrag$ = new Subject()

    constructor(props) {
        super(props)
        this.setMode = this.setMode.bind(this)
    }

    render() {
        const {activatable: {deactivate}} = this.props
        const close = deactivate
        const options = [{
            value: 'recipe',
            label: msg('map.layout.addImageLayerSource.types.Recipe.description'),
            onSelect: () => this.selectRecipe()
        }, {
            value: 'asset',
            label: msg('map.layout.addImageLayerSource.types.Asset.description'),
            onSelect: () => this.selectAsset()
        }, {
            value: 'planet',
            label: msg('map.layout.addImageLayerSource.types.Planet.description'),
            onSelect: () => this.selectPlanet()
        }]
        return (
            <Panel
                className={styles.panel}
                type='modal'>
                <Panel.Header
                    icon='layer-group'
                    title={msg('map.layout.title')}
                    label={this.renderModeButtons()}
                />
                <Panel.Content
                    scrollable={false}
                    noVerticalPadding
                    className={styles.panelContent}>
                    {this.renderContent()}
                </Panel.Content>
                <Panel.Buttons>
                    <Panel.Buttons.Main>
                        <Panel.Buttons.Close
                            keybinding={['Enter', 'Escape']}
                            onClick={close}
                        />
                    </Panel.Buttons.Main>
                    <Panel.Buttons.Extra>
                        <ButtonSelect
                            label={msg('button.add')}
                            // tooltip={msg('process.classification.panel.inputImagery.derivedBands.tooltip')}
                            look='add'
                            icon='plus'
                            placement='above'
                            tooltipPlacement='bottom'
                            options={options}
                        />
                    </Panel.Buttons.Extra>
                </Panel.Buttons>
            </Panel>
        )
    }

    renderModeButtons() {
        const {mode} = this.props
        return (
            <Buttons
                selected={mode}
                options={[
                    {value: 'grid', icon: 'table-cells-large', label: msg('map.layout.mode.grid.label')},
                    {value: 'stack', icon: 'layer-group', label: msg('map.layout.mode.stack.label')}
                ]}
                onChange={this.setMode}
            />
        )
    }

    renderWarning() {
        return (
            <Padding>
                <Message
                    type='warning'
                    icon='comment'
                    iconSize='2x'
                    text={msg('chromeOnHighResDisplayWarning')}
                />
            </Padding>
        )
    }

    renderContent() {
        return (
            <Layout type='vertical' spacing='none'>
                {isChromiumBasedBrowser() && isHighDensityDisplay() ? this.renderWarning() : null}
                <div className={styles.content}>
                    <Areas sourceDrag$={this.sourceDrag$}/>
                    <ImageLayerSources drag$={this.sourceDrag$}/>
                </div>
            </Layout>
        )
    }

    setMode(mode) {
        const {recipeActionBuilder} = this.props
        recipeActionBuilder('SET_SPLIT_MODE')
            .set('layers.mode', mode)
            .dispatch()
    }

    selectRecipe() {
        const {activator: {activatables: {selectRecipe}}} = this.props
        selectRecipe.activate()
    }

    selectAsset() {
        const {activator: {activatables: {selectAsset}}} = this.props
        selectAsset.activate()
    }

    selectPlanet() {
        const {activator: {activatables: {selectPlanet}}} = this.props
        selectPlanet.activate()
    }

    addImageLayerSource() {
        const {activator: {activatables: {addImageLayerSource}}} = this.props
        addImageLayerSource.activate()
    }
}

const policy = () => ({
    _: 'allow'
})

export const MapLayoutPanel = compose(
    _MapLayoutPanel,
    withRecipe(mapRecipeToProps),
    withActivatable({
        id: 'mapLayout',
        policy,
        alwaysAllow: true
    }),
    withActivators('selectRecipe', 'selectAsset', 'selectPlanet')
)

export const MapLayoutButton = () =>
    <Toolbar.ActivationButton
        id='mapLayout'
        icon='layer-group'
        tooltip={msg('process.mosaic.mapToolbar.layers.tooltip')}/>
