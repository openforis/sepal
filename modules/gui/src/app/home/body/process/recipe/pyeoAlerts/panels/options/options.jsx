import React from 'react'

import {RecipeFormPanel, recipeFormPanel} from '~/app/home/body/process/recipeFormPanel'
import {compose} from '~/compose'
import {msg} from '~/translate'
import {Button} from '~/widget/button'
import {Form} from '~/widget/form'
import {Layout} from '~/widget/layout'
import {Message} from '~/widget/message'
import {Panel} from '~/widget/panel/panel'

import {withOutputRequirementReads} from '../../../selectedSource'
import {CHECKING, UNAVAILABLE} from '../../../sourceRequirements'
import {GateIndexCandidates} from '../../gateIndexCandidates'
import {gateDependencyOf} from '../../sourcesRequirements'
import styles from './options.module.css'

const fields = {
    advanced: new Form.Field(),
    minRepeatability: new Form.Field()
        .notBlank()
        .int(),
    minCumulativeDetections: new Form.Field()
        .notBlank()
        .int(),
    minFromDetections: new Form.Field()
        .notBlank()
        .int(),
    minToDetections: new Form.Field()
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

class _Options extends React.Component {
    state = {gateIndexChanges: 0}

    constructor(props) {
        super(props)
        const {sourceRuntime, recipeId} = props
        this.gateIndexes = new GateIndexCandidates({
            sourceRuntime,
            recipeId,
            onChange: () => this.mounted && this.setState(({gateIndexChanges}) => ({gateIndexChanges: gateIndexChanges + 1}))
        })
    }

    render() {
        const {inputs: {advanced}} = this.props
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
                <Form.PanelButtons>
                    <Button
                        label={advanced.value ? msg('button.less') : msg('button.more')}
                        onClick={() => advanced.set(!advanced.value)}/>
                </Form.PanelButtons>
            </RecipeFormPanel>
        )
    }

    componentDidMount() {
        this.mounted = true
        this.gateIndexes.update(this.props.model)
    }

    componentDidUpdate() {
        this.gateIndexes.update(this.props.model)
    }

    // An index the shared rule finds the gate cannot read of the draft is said beside the index, holding Apply back
    // (sourcesRequirements.js); it is not switched off for the user, so opening OPT edits nothing. While the classification
    // the gate reads is found unusable, or not yet known, the gate's settings are kept as they are, disabled - what is
    // wrong with it is said in Sources, so only a classification still being checked, or not checkable, is said here;
    // the rest of the panel stays editable.
    renderContent() {
        const {inputs: {advanced, minRepeatability, minCumulativeDetections}} = this.props
        return (
            <Layout>
                {this.renderIndexGate()}
                <Form.Slider
                    label={msg('process.pyeoAlerts.panel.options.form.minRepeatability.label')}
                    tooltip={msg('process.pyeoAlerts.panel.options.form.minRepeatability.tooltip')}
                    input={minRepeatability}
                    minValue={10}
                    maxValue={100}
                    ticks={[10, 25, 50, 75, 100]}
                    info={value => msg('process.pyeoAlerts.panel.options.form.minRepeatability.value', {value})}
                />
                <Form.Slider
                    label={msg('process.pyeoAlerts.panel.options.form.minCumulativeDetections.label')}
                    tooltip={msg('process.pyeoAlerts.panel.options.form.minCumulativeDetections.tooltip')}
                    input={minCumulativeDetections}
                    minValue={1}
                    maxValue={10}
                    ticks={[1, 2, 3, 5, 10]}
                    info={value => msg('process.pyeoAlerts.panel.options.form.minCumulativeDetections.value', {value})}
                />
                {advanced.value ? this.renderFromToDetections() : null}
            </Layout>
        )
    }

    // Disabled rather than hidden: the panel is anchored at the bottom, so a row appearing would move the rows above it.
    renderIndexGate() {
        const {gateDependency, inputs: {useIndexGate, gateIndex}} = this.props
        const gateAvailable = this.availableIndexes().length > 0
        return (
            <React.Fragment>
                {[CHECKING, UNAVAILABLE].includes(gateDependency)
                    ? <Message type='info' text={msg(`process.pyeoAlerts.panel.options.form.useIndexGate.dependsOnSources.${gateDependency}`)}/>
                    : null}
                <Layout type='horizontal' alignment='distribute' spacing='loose'>
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
                        disabled={!!gateDependency || (!gateAvailable && !useIndexGate.value)}
                        onChange={on => on && this.preferSupportedIndex()}
                    />
                    <Form.Combo
                        label={msg('process.pyeoAlerts.panel.options.form.gateIndex.label')}
                        tooltip={msg('process.pyeoAlerts.panel.options.form.gateIndex.tooltip')}
                        input={gateIndex}
                        options={this.indexOptions()}
                        disabled={!useIndexGate.value || !!gateDependency}
                    />
                </Layout>
                {this.renderIndexThreshold(!useIndexGate.value || !gateAvailable || !!gateDependency)}
            </React.Fragment>
        )
    }

    renderIndexThreshold(disabled) {
        const {inputs: {gateThreshold}} = this.props
        return (
            <Form.Slider
                label={msg('process.pyeoAlerts.panel.options.form.gateThreshold.label')}
                tooltip={msg('process.pyeoAlerts.panel.options.form.gateThreshold.tooltip')}
                input={gateThreshold}
                disabled={disabled}
                minValue={0}
                maxValue={1}
                decimals={2}
                ticks={[0, 0.25, 0.5, 0.75, 1]}
                info={value => msg('process.pyeoAlerts.panel.options.form.gateThreshold.value', {value})}
            />
        )
    }

    renderFromToDetections() {
        const {inputs: {minFromDetections, minToDetections}} = this.props
        return (
            <React.Fragment>
                <Form.Slider
                    label={msg('process.pyeoAlerts.panel.options.form.minFromDetections.label')}
                    tooltip={msg('process.pyeoAlerts.panel.options.form.minFromDetections.tooltip')}
                    input={minFromDetections}
                    minValue={1}
                    maxValue={10}
                    ticks={[1, 2, 3, 5, 10]}
                    info={value => msg('process.pyeoAlerts.panel.options.form.minFromDetections.value', {value})}
                />
                <Form.Slider
                    label={msg('process.pyeoAlerts.panel.options.form.minToDetections.label')}
                    tooltip={msg('process.pyeoAlerts.panel.options.form.minToDetections.tooltip')}
                    input={minToDetections}
                    minValue={1}
                    maxValue={10}
                    ticks={[1, 2, 3, 5, 10]}
                    info={value => msg('process.pyeoAlerts.panel.options.form.minToDetections.value', {value})}
                />
            </React.Fragment>
        )
    }

    // A gate turned on with no index saved takes NDVI, or else the first the gate can read; a saved one is kept.
    preferSupportedIndex() {
        const {model, inputs: {gateIndex}} = this.props
        const available = this.availableIndexes()
        const preferred = available.includes('ndvi') ? 'ndvi' : available[0]
        if (!model?.indexGate && preferred && !available.includes(gateIndex.value)) {
            gateIndex.set(preferred)
        }
    }

    componentWillUnmount() {
        this.mounted = false
        this.gateIndexes.stop()
    }

    // The gate indexes it can read, to offer (gateIndexCandidates.js).
    availableIndexes() {
        return this.gateIndexes.readable()
    }

    // The indexes it can compute, and the one selected though it cannot, shown to be repaired.
    indexOptions() {
        const {inputs: {gateIndex}} = this.props
        const available = this.availableIndexes()
        const unsupported = gateIndex.value && !available.includes(gateIndex.value) ? [gateIndex.value] : []
        return [...available, ...unsupported].map(index => ({value: index, label: index.toUpperCase()}))
    }
}

const DEFAULT_REPEATABILITY = 50
const DEFAULT_DETECTIONS = 2

const valuesToModel = values => ({
    minRepeatability: Number(values.minRepeatability),
    minCumulativeDetections: Number(values.minCumulativeDetections),
    minFromDetections: Number(values.minFromDetections),
    minToDetections: Number(values.minToDetections),
    indexGate: values.useIndexGate
        ? {index: values.gateIndex, threshold: Number(values.gateThreshold)}
        : undefined
})

// A recipe saved before the rename carries minConsecutiveDetections. From/To counts that are set are never hidden.
const modelToValues = model => {
    const minFromDetections = model.minFromDetections ?? DEFAULT_DETECTIONS
    const minToDetections = model.minToDetections ?? DEFAULT_DETECTIONS
    return {
        advanced: minFromDetections !== DEFAULT_DETECTIONS || minToDetections !== DEFAULT_DETECTIONS,
        minRepeatability: model.minRepeatability ?? DEFAULT_REPEATABILITY,
        minCumulativeDetections: model.minCumulativeDetections ?? model.minConsecutiveDetections ?? DEFAULT_DETECTIONS,
        minFromDetections,
        minToDetections,
        ...gateValues(model)
    }
}

const gateValues = model => ({
    useIndexGate: !!model.indexGate,
    gateIndex: (model.indexGate && model.indexGate.index) || 'ndvi',
    gateThreshold: model.indexGate && model.indexGate.threshold !== undefined
        ? model.indexGate.threshold
        : 0.20
})

export const Options = compose(
    _Options,
    withOutputRequirementReads(reads => ({gateDependency: gateDependencyOf(reads)})),
    recipeFormPanel({id: 'pyeoAlertsOptions', fields, modelToValues, valuesToModel})
)
