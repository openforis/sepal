import {Panel} from 'widget/panel/panel'
import {SuperButton} from 'widget/superButton'
import {activatable} from 'widget/activation/activatable'
import {activator} from 'widget/activation/activator'
import {compose} from 'compose'
import {msg} from 'translate'
import React from 'react'
import styles from './addImageLayerSource.module.css'

export class AddImageLayerSource extends React.Component {
    render() {
        return (
            <React.Fragment>
                <AddImageLayerSourcePanel/>
            </React.Fragment>
        )
    }
}

// TODO: Use messages - and come up with consistent labels/titles/descriptions

class _AddImageLayerSourcePanel extends React.Component {
    render() {
        const {activatable: {deactivate}} = this.props
        return (
            <Panel type='modal' className={styles.panel}>
                <Panel.Header title={msg('map.layout.addImageLayerSource.title')}/>
                <Panel.Content>
                    {this.renderOptions()}
                </Panel.Content>
                <Panel.Buttons onEscape={deactivate}>
                    <Panel.Buttons.Main>
                        <Panel.Buttons.Close onClick={deactivate}/>
                    </Panel.Buttons.Main>
                </Panel.Buttons>
            </Panel>
        )
    }

    renderOptions() {
        // TODO: Implement addPlanet()
        return (
            <React.Fragment>
                <SuperButton
                    title={msg('imageLayerSources.Recipe')}
                    description={msg('map.layout.addImageLayerSource.types.Recipe.description')}
                    onClick={() => this.selectRecipe()}/>
                <SuperButton
                    title={msg('imageLayerSources.Asset')}
                    description={msg('map.layout.addImageLayerSource.types.Asset.description')}
                    onClick={() => this.selectAsset()}/>
                <SuperButton
                    title={msg('imageLayerSources.Planet')}
                    description={msg('map.layout.addImageLayerSource.types.Planet.description')}
                    onClick={() => this.selectPlanet()}/>
            </React.Fragment>
        )
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
}

const policy = () => ({
    _: 'allow',
    mapLayout: 'allow',
    selectRecipe: 'allow-then-deactivate',
    selectAsset: 'allow-then-deactivate',
    selectPlanet: 'allow-then-deactivate'
})

const AddImageLayerSourcePanel = compose(
    _AddImageLayerSourcePanel,
    activatable({id: 'addImageLayerSource', policy}),
    activator('mapLayout', 'selectRecipe', 'selectAsset', 'selectPlanet')
)
