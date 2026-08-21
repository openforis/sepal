import React from 'react'

import {getAvailableIndexes} from '~/app/home/body/process/opticalIndexes'
import {getDataSetBands} from '~/app/home/body/process/recipe/opticalMosaic/sources'
import {RecipeFormPanel, recipeFormPanel} from '~/app/home/body/process/recipeFormPanel'
import {compose} from '~/compose'
import {selectFrom} from '~/stateUtils'
import {msg} from '~/translate'
import {Form} from '~/widget/form'
import {Layout} from '~/widget/layout'
import {Panel} from '~/widget/panel/panel'

import styles from './options.module.css'

// V1: land-change-meaningful normalized-difference indices (all bounded [-1, 1],
// where a *drop* vs. baseline signals disturbance). Source-filtered at render.
const GATE_INDEXES = ['ndvi', 'ndmi', 'nbr']

const fields = {
    minConsecutiveDetections: new Form.Field()
        .notBlank()
        .int(),
    useIndexGate: new Form.Field(),
    gateIndex: new Form.Field()
        .skip((_v, {useIndexGate}) => !useIndexGate)
        .notBlank('process.pyeoAlerts.panel.options.form.gateIndex.required'),
    gateThreshold: new Form.Field()
        .skip((_v, {useIndexGate}) => !useIndexGate)
        .notBlank('process.pyeoAlerts.panel.options.form.gateThreshold.required')
}

const mapRecipeToProps = recipe => ({
    dataSets: selectFrom(recipe, 'model.sources.dataSets'),
    classificationBands: selectFrom(recipe, 'ui.classificationBands')
})

class _Options extends React.Component {
    render() {
        return (
            <RecipeFormPanel
                className={styles.panel}
                placement='bottom-right'>
                <Panel.Header
                    icon='shuffle'
                    title={msg('process.pyeoAlerts.panel.options.title')}/>
                <Panel.Content>
                    {this.renderContent()}
                </Panel.Content>
                <Form.PanelButtons/>
            </RecipeFormPanel>
        )
    }

    componentDidMount() {
        this.forceGateOffIfUnavailable()
    }

    componentDidUpdate() {
        this.forceGateOffIfUnavailable()
    }

    // With no computable index, force the gate off so a stale/default "on" can't require an index
    // the source can't produce — the toggle is also disabled in renderContent().
    forceGateOffIfUnavailable() {
        const {inputs: {useIndexGate}} = this.props
        if (useIndexGate.value && !this.availableIndexes().length) {
            useIndexGate.set(false)
        }
    }

    renderContent() {
        const {inputs: {useIndexGate, minConsecutiveDetections}} = this.props
        const gateAvailable = this.availableIndexes().length > 0
        return (
            <Layout>
                <Form.Buttons
                    label={msg('process.pyeoAlerts.panel.options.form.useIndexGate.label')}
                    tooltip={msg(gateAvailable
                        ? 'process.pyeoAlerts.panel.options.form.useIndexGate.tooltip'
                        : 'process.pyeoAlerts.panel.options.form.useIndexGate.unavailable')}
                    input={useIndexGate}
                    options={[
                        {value: false, label: msg('process.pyeoAlerts.panel.options.form.useIndexGate.off')},
                        {value: true, label: msg('process.pyeoAlerts.panel.options.form.useIndexGate.on')}
                    ]}
                    disabled={!gateAvailable}
                />
                {useIndexGate.value && gateAvailable ? this.renderIndexGate() : null}
                <Form.Slider
                    label={msg('process.pyeoAlerts.panel.options.form.minConsecutiveDetections.label')}
                    tooltip={msg('process.pyeoAlerts.panel.options.form.minConsecutiveDetections.tooltip')}
                    input={minConsecutiveDetections}
                    minValue={1}
                    maxValue={10}
                    ticks={[1, 2, 3, 5, 10]}
                    info={value => msg('process.pyeoAlerts.panel.options.form.minConsecutiveDetections.value', {value})}
                />
            </Layout>
        )
    }

    renderIndexGate() {
        const {inputs: {gateIndex, gateThreshold}} = this.props
        return (
            <Layout>
                <Form.Combo
                    label={msg('process.pyeoAlerts.panel.options.form.gateIndex.label')}
                    tooltip={msg('process.pyeoAlerts.panel.options.form.gateIndex.tooltip')}
                    input={gateIndex}
                    options={this.indexOptions()}
                />
                <Form.Slider
                    label={msg('process.pyeoAlerts.panel.options.form.gateThreshold.label')}
                    tooltip={msg('process.pyeoAlerts.panel.options.form.gateThreshold.tooltip')}
                    input={gateThreshold}
                    minValue={0}
                    maxValue={1}
                    decimals={2}
                    ticks={[0, 0.25, 0.5, 0.75, 1]}
                    info={value => msg('process.pyeoAlerts.panel.options.form.gateThreshold.value', {value})}
                />
            </Layout>
        )
    }

    // Gate indexes computable on BOTH the classification's baseline imagery and the monitoring
    // datasets — the gate runs on both, so a band missing from either rules the index out.
    // classificationBands undefined ⇒ not resolved yet: fall back so we don't pre-disable.
    availableIndexes() {
        const {dataSets, classificationBands} = this.props
        const classificationIndexes = classificationBands
            ? getAvailableIndexes(classificationBands)
            : GATE_INDEXES
        const dataSetIndexes = dataSets && Object.keys(dataSets).length
            ? getAvailableIndexes(getDataSetBands({model: {sources: {dataSets}}}))
            : GATE_INDEXES
        return GATE_INDEXES.filter(index =>
            classificationIndexes.includes(index) && dataSetIndexes.includes(index)
        )
    }

    indexOptions() {
        return this.availableIndexes().map(index => ({value: index, label: index.toUpperCase()}))
    }
}

const valuesToModel = values => ({
    minConsecutiveDetections: Number(values.minConsecutiveDetections),
    indexGate: values.useIndexGate
        ? {index: values.gateIndex, threshold: Number(values.gateThreshold)}
        : undefined
})

const modelToValues = model => ({
    minConsecutiveDetections: model.minConsecutiveDetections || 2,
    useIndexGate: !!model.indexGate,
    gateIndex: (model.indexGate && model.indexGate.index) || 'ndvi',
    gateThreshold: model.indexGate && model.indexGate.threshold !== undefined
        ? model.indexGate.threshold
        : 0.20
})

export const Options = compose(
    _Options,
    recipeFormPanel({id: 'pyeoAlertsOptions', fields, mapRecipeToProps, modelToValues, valuesToModel})
)
