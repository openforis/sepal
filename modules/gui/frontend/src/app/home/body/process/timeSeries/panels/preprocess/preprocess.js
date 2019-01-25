import {Field, form} from 'widget/form'
import {RecipeActions, RecipeState} from '../../timeSeriesRecipe'
import {initValues} from 'app/home/body/process/recipe'
import {msg} from 'translate'
import {recipePath} from 'app/home/body/process/timeSeries/timeSeriesRecipe'
import Buttons from 'widget/buttons'
import Panel, {PanelContent, PanelHeader} from 'widget/panel'
import PanelButtons from 'widget/panelButtons'
import PropTypes from 'prop-types'
import React from 'react'
import styles from './preprocess.module.css'

const fields = {
    corrections: new Field(),
    shadowPercentile: new Field(),
    hazePercentile: new Field(),
    ndviPercentile: new Field(),
    dayOfYearPercentile: new Field(),
    mask: new Field(),
    compose: new Field()
}

class Preprocess extends React.Component {
    constructor(props) {
        super(props)
        this.recipeActions = RecipeActions(props.recipeId)
    }

    renderContent() {
        const {inputs: {corrections, mask}} = this.props
        return (
            <div className={styles.content}>
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
                <div className={styles.inline}>
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
                </div>
            </div>
        )
    }

    render() {
        const {recipeId, form} = this.props
        return (
            <Panel
                className={styles.panel}
                form={form}
                statePath={recipePath(recipeId, 'ui')}
                onApply={values => this.recipeActions.setPreprocessOptions({
                    values,
                    model: valuesToModel(values)
                }).dispatch()}>
                <PanelHeader
                    icon='cog'
                    title={msg('process.timeSeries.panel.preprocess.title')}/>

                <PanelContent>
                    {this.renderContent()}
                </PanelContent>

                <PanelButtons/>
            </Panel>
        )
    }
}

Preprocess.propTypes = {
    disabled: PropTypes.any,
    recipeId: PropTypes.string,
    source: PropTypes.string
}

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

export default initValues({
    getModel: props => RecipeState(props.recipeId)('model.preprocessOptions'),
    getValues: props => RecipeState(props.recipeId)('ui.preprocessOptions'),
    modelToValues,
    onInitialized: ({model, values, props}) =>
        RecipeActions(props.recipeId)
            .setPreprocessOptions({values, model})
            .dispatch()
})(
    form({fields})(Preprocess)
)
