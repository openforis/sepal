import {Panel} from 'widget/panel/panel'
import {SuperButton} from 'widget/superButton'
import {activatable} from 'widget/activation/activatable'
import {activator} from 'widget/activation/activator'
import {compose} from 'compose'
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
                <Panel.Header title='Add layer'/>
                <Panel.Content>
                    {this.renderOptions()}
                </Panel.Content>
                <Panel.Buttons>
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
                    title='Sepal recipe'
                    description='Add from Sepal recipe'
                    onClick={() => this.addSepalRecipe()}/>
                <SuperButton
                    title='Google Earth Engine Asset'
                    description='Add a Google Earth Engine Asset'
                    onClick={() => this.addAsset()}/>
                <SuperButton
                    title='Planet'
                    description='Add a Planet API Key'
                    onClick={() => this.addAsset()}/>
            </React.Fragment>
        )
    }

    addSepalRecipe() {
        const {activator: {activatables: {selectRecipe}}} = this.props
        selectRecipe.activate()
    }

    addAsset() {
        // console.log('Add asset')
    }
}

const policy = () => ({
    _: 'allow',
    mapLayout: 'allow',
    selectRecipe: 'allow-then-deactivate'
})

const AddImageLayerSourcePanel = compose(
    _AddImageLayerSourcePanel,
    activatable({id: 'addImageLayerSource', policy}),
    activator('mapLayout', 'selectRecipe')
)
