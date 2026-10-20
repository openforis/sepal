import React from 'react'

import {RecipeFormPanel, recipeFormPanel} from '~/app/home/body/process/recipeFormPanel'
import {compose} from '~/compose'
import {selectFrom} from '~/stateUtils'
import {msg} from '~/translate'
import {Form} from '~/widget/form'
import {Layout} from '~/widget/layout'
import {Panel} from '~/widget/panel/panel'

import {preferredGateIndex, readableGateIndexes} from '../../gateIndexes'
import styles from './options.module.css'

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
    sources: selectFrom(recipe, 'model.sources'),
    processing: selectFrom(recipe, 'model.options'),
    classificationImagery: selectFrom(recipe, 'ui.classificationBands')
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
        this.explainGateIndex()
    }

    componentDidUpdate() {
        this.explainGateIndex()
    }

    // An index gated on that the imagery cannot compute is said beside the index and holds Apply back; it is not switched
    // off for the user, so opening OPT edits nothing. Choosing an index it can compute, or turning the gate off, repairs
    // it. Bands not yet known rule nothing out (availableIndexes).
    explainGateIndex() {
        const {inputs: {useIndexGate, gateIndex}} = this.props
        const error = useIndexGate.value && gateIndex.value && !this.availableIndexes().includes(gateIndex.value)
            ? msg('process.pyeoAlerts.panel.options.form.gateIndex.unsupported', {index: gateIndex.value.toUpperCase()})
            : ''
        if (error ? gateIndex.error !== error : this.explained) {
            gateIndex.setInvalid(error)
        }
        this.explained = !!error
    }

    renderContent() {
        const {inputs: {useIndexGate, gateIndex, minConsecutiveDetections}} = this.props
        const gateAvailable = this.availableIndexes().length > 0
        return (
            <Layout>
                <Layout type='horizontal' alignment='distribute' spacing='loose'>
                    <Form.Combo
                        label={msg('process.pyeoAlerts.panel.options.form.gateIndex.label')}
                        tooltip={msg('process.pyeoAlerts.panel.options.form.gateIndex.tooltip')}
                        input={gateIndex}
                        options={this.indexOptions()}
                        disabled={!useIndexGate.value}
                    />
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
                        disabled={!gateAvailable && !useIndexGate.value}
                        onChange={on => on && this.preferSupportedIndex()}
                    />
                </Layout>
                {useIndexGate.value && gateAvailable ? this.renderIndexThreshold() : null}
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

    renderIndexThreshold() {
        const {inputs: {gateThreshold}} = this.props
        return (
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
        )
    }

    // A gate turned on with no index saved takes NDVI, or else the first the gate can read; a saved one is kept.
    preferSupportedIndex() {
        const {model, inputs: {gateIndex}} = this.props
        const preferred = preferredGateIndex(...this.gateContext())
        if (!model?.indexGate && preferred && !this.availableIndexes().includes(gateIndex.value)) {
            gateIndex.set(preferred)
        }
    }

    // The gate indexes it can read (gateIndexes.js). The classification's input is what Sources last read of it, only
    // where that is the classification applied: one read for another, or not read yet, rules nothing out.
    availableIndexes() {
        return readableGateIndexes(...this.gateContext())
    }

    gateContext() {
        const {sources, processing, classificationImagery} = this.props
        const baseline = classificationImagery?.classification && classificationImagery.classification === sources?.classification
            ? classificationImagery
            : null
        return [{sources, options: processing}, baseline]
    }

    // The indexes it can compute, and the one selected though it cannot, shown to be repaired.
    indexOptions() {
        const {inputs: {gateIndex}} = this.props
        const available = this.availableIndexes()
        const unsupported = gateIndex.value && !available.includes(gateIndex.value) ? [gateIndex.value] : []
        return [...available, ...unsupported].map(index => ({value: index, label: index.toUpperCase()}))
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
