import {Form} from 'widget/form/form'
import {Layout} from 'widget/layout'
import {Panel} from 'widget/panel/panel'
import {RecipeActions} from '../../ccdcRecipe'
import {RecipeFormPanel, recipeFormPanel} from 'app/home/body/process/recipeFormPanel'
import {compose} from 'compose'
import {msg} from 'translate'
import {opticalBandOptions, radarBandOptions} from '../../bandOptions'
import {selectFrom} from 'stateUtils'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'
import styles from './retrieve.module.css'

const fields = {
    bands: new Form.Field()
        .predicate(selection => selection && selection.length, 'process.ccdc.panel.retrieve.form.bands.atLeastOne'),
    scale: new Form.Field()
}

const mapRecipeToProps = recipe => ({
    sources: selectFrom(recipe, 'model.sources'),
    classificationLegend: selectFrom(recipe, 'ui.classificationLegend')
})

class Retrieve extends React.Component {
    constructor(props) {
        super(props)
        const {recipeId, inputs: {scale}} = this.props
        this.recipeActions = RecipeActions(recipeId)
        if (!scale.value)
            scale.set(30)
    }

    renderContent() {
        const {classificationLegend, sources: {dataSets}, inputs: {bands, scale}} = this.props
        const options = [
            ...(_.isEmpty(dataSets['SENTINEL_1'])
                ? opticalBandOptions({dataSets})
                : radarBandOptions({})),
            ...(classificationLegend
                ? [{
                    options: [
                        {
                            value: 'regression',
                            label: (msg('process.ccdc.panel.sources.form.breakpointBands.regression'))
                        },
                        ...classificationLegend.entries.map(({value, label}) => ({
                            value: `probability_${value}`,
                            label: msg('process.ccdc.panel.sources.form.breakpointBands.probability', {label})
                        }))
                    ]
                }]
                : [])
        ]

        return (
            <Layout>
                <Form.Buttons
                    label={msg('process.ccdc.panel.retrieve.form.bands.label')}
                    input={bands}
                    multiple
                    options={options}/>
                <Form.Slider
                    label={msg('process.radarMosaic.panel.retrieve.form.scale.label')}
                    info={scale => msg('process.ccdc.panel.retrieve.form.scale.info', {scale})}
                    input={scale}
                    minValue={10}
                    maxValue={100}
                    scale={'log'}
                    ticks={[10, 15, 20, 30, 60, 100]}
                    snap
                    range='none'
                />
            </Layout>
        )
    }

    render() {
        return (
            <RecipeFormPanel
                className={styles.panel}
                isActionForm
                placement='top-right'
                onApply={values => this.recipeActions.retrieve(values).dispatch()}>
                <Panel.Header
                    icon='cloud-download-alt'
                    title={msg('process.ccdc.panel.retrieve.title')}/>
                <Panel.Content>
                    {this.renderContent()}
                </Panel.Content>
                <Form.PanelButtons
                    applyLabel={msg('process.ccdc.panel.retrieve.apply')}/>
            </RecipeFormPanel>
        )
    }

    componentDidUpdate() {
        const {sources: {breakpointBands}, inputs: {bands}} = this.props
        if (!bands.value)
            bands.set(breakpointBands)
    }
}

Retrieve.propTypes = {
    recipeId: PropTypes.string
}

export default compose(
    Retrieve,
    recipeFormPanel({id: 'retrieve', fields, mapRecipeToProps})
)
