import {FormButtons as Buttons} from 'widget/buttons'
import {Field} from 'widget/form'
import {FormPanelButtons} from 'widget/formPanel'
import {PanelContent, PanelHeader} from 'widget/panel'
import {RecipeActions} from '../../timeSeriesRecipe'
import {RecipeFormPanel, recipeFormPanel} from 'app/home/body/process/recipeFormPanel'
import {msg} from 'translate'
import React from 'react'
import styles from './preProcessingOptions.module.css'

const fields = {
    corrections: new Field(),
    shadowPercentile: new Field(),
    hazePercentile: new Field(),
    ndviPercentile: new Field(),
    dayOfYearPercentile: new Field(),
    mask: new Field(),
    compose: new Field()
}

class PreProcessingOptions extends React.Component {
    constructor(props) {
        super(props)
        this.recipeActions = RecipeActions(props.recipeId)
    }

    renderContent() {
        const {inputs: {corrections, mask}} = this.props
        return (
            <React.Fragment>
                <Buttons
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
                <Buttons
                    label={msg('process.timeSeries.panel.preprocess.form.mask.label')}
                    input={mask}
                    multiple={true}
                    options={[{
                        value: 'SNOW',
                        label: msg('process.timeSeries.panel.preprocess.form.mask.snow.label'),
                        tooltip: msg('process.timeSeries.panel.preprocess.form.mask.snow.tooltip')
                    }]}
                />
            </React.Fragment>
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

                <FormPanelButtons/>
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

export default recipeFormPanel({id: 'preProcessingOptions', fields, modelToValues, valuesToModel})(PreProcessingOptions)
