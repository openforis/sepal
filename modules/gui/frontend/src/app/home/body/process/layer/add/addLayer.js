import FooRecipe from 'app/home/body/process/layer/add/fooRecipe'
import SelectRecipe from 'app/home/body/process/layer/add/selectRecipe'
import {compose} from 'compose'
import React from 'react'
import {activatable} from 'widget/activation/activatable'
import {activator} from 'widget/activation/activator'
import {Panel, PanelButtons, PanelContent, PanelHeader} from 'widget/panel'
import SuperButton from 'widget/superButton'
import styles from './addLayer.module.css'

export default class AddLayer extends React.Component {
    render() {
        return (
            <React.Fragment>
                <AddLayerPanel/>
                <SelectRecipe/>
                <FooRecipe/>
            </React.Fragment>
        )
    }
}

class _AddLayerPanel extends React.Component {
    render() {
        const {activatable: {deactivate}} = this.props
        return (
            <Panel type='modal' className={styles.panel}>
                <PanelHeader title='Add layer'/>
                <PanelContent>
                    {this.renderOptions()}
                </PanelContent>
                <PanelButtons>
                    <PanelButtons.Main>
                        <PanelButtons.Close onClick={deactivate}/>
                    </PanelButtons.Main>
                </PanelButtons>
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
    _: 'allow-then-deactivate'
})

const AddLayerPanel = compose(
    _AddLayerPanel,
    activatable({id: 'addLayer', policy, alwaysAllow: true}),
    activator('selectRecipe'),
)
