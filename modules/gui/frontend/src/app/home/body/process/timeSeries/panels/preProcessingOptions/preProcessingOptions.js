import {Form} from 'widget/form/form'
import {Layout} from 'widget/layout'
import {PanelContent, PanelHeader} from 'widget/panel'
import {RecipeActions} from '../../timeSeriesRecipe'
import {RecipeFormPanel, recipeFormPanel} from 'app/home/body/process/recipeFormPanel'
import {compose} from 'compose'
import {msg} from 'translate'
import React from 'react'
import styles from './preProcessingOptions.module.css'

const fields = {
    corrections: new Form.Field(),
    shadowPercentile: new Form.Field(),
    hazePercentile: new Form.Field(),
    ndviPercentile: new Form.Field(),
    dayOfYearPercentile: new Form.Field(),
    mask: new Form.Field(),
    compose: new Form.Field()
}

class PreProcessingOptions extends React.Component {
    constructor(props) {
        super(props)
        this.recipeActions = RecipeActions(props.recipeId)
    }

    renderContent() {
        const {inputs: {corrections, mask}} = this.props
        return (
            <Layout>
                <Form.Buttons
                    label={msg('process.timeSeries.panel.preprocess.form.corrections.label')}
                    input={corrections}
                    multiple={true}
                    options={[{
                        value: 'SR',
                        label: msg('process.timeSeries.panel.preprocess.form.corrections.surfaceReflectance.label'),
                        tooltip: msg('process.timeSeries.panel.preprocess.form.corrections.surfaceReflectance.tooltip')
                    }, {
                        value: 'BRDF',
                        label: msg('process.timeSeries.panel.preprocess.form.corrections.brdf.label'),
                        tooltip: msg('process.timeSeries.panel.preprocess.form.corrections.brdf.tooltip')
                    }]}
                />
                <Form.Buttons
                    label={msg('process.timeSeries.panel.preprocess.form.mask.label')}
                    input={mask}
                    multiple={true}
                    options={[{
                        value: 'SNOW',
                        label: msg('process.timeSeries.panel.preprocess.form.mask.snow.label'),
                        tooltip: msg('process.timeSeries.panel.preprocess.form.mask.snow.tooltip')
                    }]}
                />
            </Layout>
        )
    }

    render() {
        return (
            <RecipeFormPanel
                className={styles.panel}
                placement='bottom-right'>
                <PanelHeader
                    icon='cog'
                    title={msg('process.timeSeries.panel.preprocess.title')}/>
                <PanelContent>
                    {this.renderContent()}
                </PanelContent>
                <Form.PanelButtons/>
            </RecipeFormPanel>
        )
    }
}

PreProcessingOptions.propTypes = {}

const valuesToModel = values => ({
    corrections: values.corrections,
    mask: values.mask
})

const modelToValues = model => {
    return ({
        corrections: model.corrections,
        mask: model.mask
    })
}

export default compose(
    PreProcessingOptions,
    recipeFormPanel({id: 'preProcessingOptions', fields, modelToValues, valuesToModel})
)
