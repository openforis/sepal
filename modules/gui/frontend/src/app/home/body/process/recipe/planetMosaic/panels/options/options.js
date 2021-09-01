import {Form} from 'widget/form/form'
import {Layout} from 'widget/layout'
import {Panel} from 'widget/panel/panel'
import {RecipeFormPanel, recipeFormPanel} from 'app/home/body/process/recipeFormPanel'
import {compose} from 'compose'
import {msg} from 'translate'
import React from 'react'
import styles from './options.module.css'

const fields = {
    cloudThreshold: new Form.Field(),
    shadowThreshold: new Form.Field()
}

class Options extends React.Component {
    constructor(props) {
        super(props)
    }

    render() {
        return (
            <RecipeFormPanel
                className={styles.panel}
                placement='bottom-right'>
                <Panel.Header
                    icon='layer-group'
                    title={msg('process.planetMosaic.panel.options.title')}/>
                <Panel.Content>
                    {this.renderContent()}
                </Panel.Content>
                <Form.PanelButtons/>
            </RecipeFormPanel>
        )
    }

    renderContent() {
        const {inputs: {cloudThreshold, shadowThreshold}} = this.props
        return (
            <Layout>
                <Form.Slider
                    label={msg('process.planetMosaic.panel.options.cloudThreshold.label')}
                    tooltip={msg('process.planetMosaic.panel.options.cloudThreshold.tooltip')}
                    input={cloudThreshold}
                    minValue={0}
                    maxValue={100}
                    ticks={[0, 10, 25, 50, 75, 90, 100]}
                    info={value => msg('process.planetMosaic.panel.options.cloudThreshold.value', {value})}
                />
                <Form.Slider
                    label={msg('process.planetMosaic.panel.options.shadowThreshold.label')}
                    tooltip={msg('process.planetMosaic.panel.options.shadowThreshold.tooltip')}
                    input={shadowThreshold}
                    minValue={0}
                    maxValue={100}
                    ticks={[0, 10, 25, 50, 75, 90, 100]}
                    info={value => msg('process.planetMosaic.panel.options.shadowThreshold.value', {value})}
                />
            </Layout>
        )
    }
}

const valuesToModel = values => ({
    cloudThreshold: 1 - values.cloudThreshold / 100,
    shadowThreshold: 1 - values.shadowThreshold / 100,
})

const modelToValues = model => ({
    cloudThreshold: 100 - model.cloudThreshold * 100,
    shadowThreshold: 100 - model.shadowThreshold * 100,
})

export default compose(
    Options,
    recipeFormPanel({id: 'options', fields, modelToValues, valuesToModel})
)
