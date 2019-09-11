import {Panel} from 'widget/panel/panel'
import {SuperButton} from 'widget/superButton'
import {activatable} from 'widget/activation/activatable'
import {activator} from 'widget/activation/activator'
import {compose} from 'compose'
import React from 'react'
import styles from './addLayer.module.css'

export class AddLayer extends React.Component {
    render() {
        return (
            <React.Fragment>
                <AddLayerPanel/>
                {/* <SelectRecipe/> */}
                {/* <FooRecipe/> */}
            </React.Fragment>
        )
    }
}

class _AddLayerPanel extends React.Component {
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
        return (
            <React.Fragment>
                <SuperButton
                    title='Sepal recipe'
                    description='Add layer from Sepal recipe'
                    onClick={() => this.addSepalRecipe()}/>
                <SuperButton
                    title='Google Earth Engine Asset'
                    description='Add a Google Earth Engine Asset layer'
                    onClick={() => this.addAsset()}/>
                <SuperButton
                    title='Google Map Satellite'
                    description='Add Google Map high-resolution satellite layer'
                    onClick={() => this.addAsset()}/>
                <SuperButton
                    title='Planet'
                    description='Add layer from Planet'
                    onClick={() => this.addAsset()}/>
            </React.Fragment>
        )
    }

    addSepalRecipe() {
        const {activator: {activatables: {selectRecipe}}} = this.props
        selectRecipe.activate()
    }

    addAsset() {
        console.log('Add asset')
    }
}

const policy = () => ({
    _: 'allow',
    mapLayout: 'allow',
    selectRecipe: 'allow-then-deactivate'
})

const AddLayerPanel = compose(
    _AddLayerPanel,
    activatable({id: 'addLayer', policy}),
    activator('mapLayout', 'selectRecipe')
)
