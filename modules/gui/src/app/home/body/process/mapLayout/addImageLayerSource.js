import {CrudItem} from 'widget/crudItem'
import {Layout} from 'widget/layout'
import {ListItem} from 'widget/listItem'
import {Panel} from 'widget/panel/panel'
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

class _AddImageLayerSourcePanel extends React.Component {
    constructor(props) {
        super(props)
        this.selectRecipe = this.selectRecipe.bind(this)
        this.selectAsset = this.selectAsset.bind(this)
        this.selectPlanet = this.selectPlanet.bind(this)
    }

    render() {
        const {activatable: {deactivate}} = this.props
        return (
            <Panel type='modal' className={styles.panel}>
                <Panel.Header title={msg('map.layout.addImageLayerSource.title')}/>
                <Panel.Content>
                    {this.renderOptions()}
                </Panel.Content>
                <Panel.Buttons>
                    <Panel.Buttons.Main>
                        <Panel.Buttons.Close
                            keybinding='Escape'
                            onClick={deactivate}
                        />
                    </Panel.Buttons.Main>
                </Panel.Buttons>
            </Panel>
        )
    }

    renderOptions() {
        return (
            <Layout type='vertical' spacing='tight'>
                {this.renderRecipeButton()}
                {this.renderAssetButton()}
                {this.renderPlanetButton()}
            </Layout>
        )
    }

    renderRecipeButton() {
        return (
            <ListItem onClick={this.selectRecipe}>
                <CrudItem
                    title={msg('imageLayerSources.Recipe.label')}
                    description={msg('map.layout.addImageLayerSource.types.Recipe.description')}
                />
            </ListItem>
        )
    }

    renderAssetButton() {
        return (
            <ListItem onClick={this.selectAsset}>
                <CrudItem
                    title={msg('imageLayerSources.Asset.label')}
                    description={msg('map.layout.addImageLayerSource.types.Asset.description')}
                />
            </ListItem>
        )
    }

    renderPlanetButton() {
        return (
            <ListItem onClick={this.selectPlanet}>
                <CrudItem
                    title={msg('imageLayerSources.Planet.label')}
                    description={msg('map.layout.addImageLayerSource.types.Planet.description')}
                />
            </ListItem>
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
    selectRecipe: 'allow-then-deactivate',
    selectAsset: 'allow-then-deactivate',
    selectPlanet: 'allow-then-deactivate'
})

const AddImageLayerSourcePanel = compose(
    _AddImageLayerSourcePanel,
    activatable({id: 'addImageLayerSource', policy, alwaysAllow: true}),
    activator('mapLayout', 'selectRecipe', 'selectAsset', 'selectPlanet')
)
