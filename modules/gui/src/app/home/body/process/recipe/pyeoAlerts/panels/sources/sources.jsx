import _ from 'lodash'
import moment from 'moment'
import React from 'react'
import {Subject, takeUntil} from 'rxjs'

import api from '~/apiRegistry'
import {getDataSetOptions as opticalDataSetOptions} from '~/app/home/body/process/recipe/opticalMosaic/sources'
import {recipeAccess} from '~/app/home/body/process/recipeAccess'
import {withRecipe} from '~/app/home/body/process/recipeContext'
import {RecipeFormPanel, recipeFormPanel} from '~/app/home/body/process/recipeFormPanel'
import {compose} from '~/compose'
import {toSources} from '~/sources'
import {selectFrom} from '~/stateUtils'
import {msg} from '~/translate'
import {Form} from '~/widget/form'
import {withBusyExplanation} from '~/widget/form/inputFeedback'
import {Icon} from '~/widget/icon'
import {Layout} from '~/widget/layout'
import {NoData} from '~/widget/noData'
import {Notifications} from '~/widget/notifications'
import {Panel} from '~/widget/panel/panel'
import {RecipeInput} from '~/widget/recipeInput'

import {preferredGateIndex, readableGateIndexes} from '../../gateIndexes'
import {NOT_DERIVABLE, readInputImagery$, SELECTED_SCENES} from '../../inputImagery'
import toDateString from '../../toDateString'
import styles from './sources.module.css'

const DATE_FORMAT = 'YYYY-MM-DD'

const fields = {
    classification: new Form.Field(),
    // Holds Apply until the classification selected now has been read, judged against the field's current value: Combo
    // updates the field before its deferred onChange. Never shown: the selector says it is busy instead.
    acquisition: new Form.Field()
        .predicate(
            (acquisition, {classification}) =>
                !classification || !!(acquisition?.usable && acquisition.classification === classification),
            'process.pyeoAlerts.classification.pending'
        ),
    dataSets: new Form.Field()
        .notEmpty('process.pyeoAlerts.panel.sources.form.dataSets.required'),
    cloudPercentageThreshold: new Form.Field(),
    changeFromClasses: new Form.Field()
        .notEmpty('process.pyeoAlerts.panel.sources.form.changeFromClasses.required'),
    changeToClasses: new Form.Field()
        .notEmpty('process.pyeoAlerts.panel.sources.form.changeToClasses.required')
        .predicate(
            (toClasses, {changeFromClasses}) => {
                const overlap = (toClasses || []).filter(c => (changeFromClasses || []).includes(c))
                return overlap.length === 0
            },
            'process.pyeoAlerts.panel.sources.form.changeToClasses.overlap'
        )
}

const mapRecipeToProps = recipe => ({
    dates: selectFrom(recipe, 'model.dates'),
    classificationLegend: selectFrom(recipe, 'ui.classificationLegend'),
    initialized: selectFrom(recipe, 'ui.initialized'),
    processing: selectFrom(recipe, 'model.options'),
    indexGate: selectFrom(recipe, 'model.pyeoAlertsOptions.indexGate')
})

export const Sources = compose(
    class _Sources extends React.Component {
        cancel$ = new Subject()
        dataSetsTouched = false

        render() {
            return (
                <RecipeFormPanel
                    className={styles.panel}
                    placement='bottom-right'
                    additionalUpdates={values => [...proposedUpdates(values.acquisition), ...this.initialGateUpdates(values)]}
                    onCancel={() => this.onCancel()}>
                    <Panel.Header icon='cog' title={msg('process.pyeoAlerts.panel.sources.title')}/>
                    <Panel.Content>
                        <Layout>
                            {this.renderClassification()}
                            {this.renderDataSets()}
                            {this.renderCloudPercentageThreshold()}
                            {this.renderChangeClasses()}
                        </Layout>
                    </Panel.Content>
                    <Form.PanelButtons/>
                </RecipeFormPanel>
            )
        }

        componentDidMount() {
            const {model} = this.props
            // Treat saved datasets as user choices, preserving them across classification changes.
            this.dataSetsTouched = !!(model && model.dataSets && Object.keys(model.dataSets).length)
            this.showCommittedClassification()
        }

        onClassificationSelected(id) {
            const {classification, retry} = this.acquisition()
            if (id === classification && !retry) {
                return
            }
            if (id) {
                this.startAcquisition(acquiring(id))
                this.readClassification(id, true)
            } else {
                const {inputs} = this.props
                inputs.changeFromClasses.set([], {validate: false})
                inputs.changeToClasses.set([], {validate: false})
                this.startAcquisition(committed(id))
            }
        }

        onCancel() {
            this.showCommittedClassification()
        }

        componentWillUnmount() {
            this.cancel$.next()
            this.cancel$.complete()
        }

        renderClassification() {
            const {inputs: {classification}} = this.props
            const pending = this.isPending() ? msg('process.pyeoAlerts.classification.pending') : null
            return (
                <RecipeInput
                    label={msg('process.pyeoAlerts.panel.sources.form.classification.label')}
                    tooltip={withBusyExplanation(msg('process.pyeoAlerts.panel.sources.form.classification.tooltip'), {busy: pending})}
                    placeholder={msg('process.pyeoAlerts.panel.sources.form.classification.placeholder')}
                    input={classification}
                    filter={type => type.id === 'CLASSIFICATION'}
                    busyMessage={pending || this.isLoading()}
                    onChange={id => this.onClassificationSelected(id)}
                />
            )
        }

        renderDataSets() {
            const {dates, form, inputs: {dataSets}} = this.props
            return (
                <Form.Buttons
                    label={msg('process.pyeoAlerts.panel.sources.form.dataSets.label')}
                    tooltip={msg('process.pyeoAlerts.panel.sources.form.dataSets.tooltip')}
                    input={dataSets}
                    options={opticalDataSetOptions({...dates})}
                    errorMessage={form.getErrorMessage(dataSets)}
                    multiple
                    disabled={!this.hasClasses()}
                    onChange={() => {this.dataSetsTouched = true}}
                />
            )
        }

        renderCloudPercentageThreshold() {
            const {inputs: {cloudPercentageThreshold}} = this.props
            return (
                <Form.Slider
                    label={msg('process.pyeoAlerts.panel.sources.form.cloudPercentageThreshold.label')}
                    tooltip={msg('process.pyeoAlerts.panel.sources.form.cloudPercentageThreshold.tooltip')}
                    input={cloudPercentageThreshold}
                    minValue={0}
                    maxValue={100}
                    ticks={[0, 10, 25, 50, 75, 90, 100]}
                    range='low'
                    info={value =>
                        msg('process.pyeoAlerts.panel.sources.form.cloudPercentageThreshold.value', {value})
                    }
                    disabled={!this.hasClasses()}
                />
            )
        }

        renderChangeClasses() {
            return (
                <div className={styles.changeClasses}>
                    {this.renderChangeClassesContent()}
                </div>
            )
        }

        renderChangeClassesContent() {
            const {form, inputs: {changeFromClasses, changeToClasses}, classificationLegend} = this.props
            if (this.isLoading()) {
                return (
                    <div className={styles.changeClassesMessage}>
                        <Icon name='spinner'/>
                    </div>
                )
            }
            const entries = (classificationLegend && classificationLegend.entries) || []
            if (!entries.length) {
                return (
                    <div className={styles.changeClassesMessage}>
                        <NoData message={msg('process.pyeoAlerts.panel.sources.form.changeClasses.noClassification')}/>
                    </div>
                )
            }
            const fromValues = changeFromClasses.value || []
            const toValues = changeToClasses.value || []
            const fromOptions = entries.map(({value, label, color}) => ({value, label, color, disabled: toValues.includes(value)}))
            const toOptions = entries.map(({value, label, color}) => ({value, label, color, disabled: fromValues.includes(value)}))
            return (
                <Layout>
                    <Form.Buttons
                        label={msg('process.pyeoAlerts.panel.sources.form.changeFromClasses.label')}
                        tooltip={msg('process.pyeoAlerts.panel.sources.form.changeFromClasses.tooltip')}
                        input={changeFromClasses}
                        options={fromOptions}
                        errorMessage={form.getErrorMessage(changeFromClasses)}
                        multiple
                    />
                    <Form.Buttons
                        label={msg('process.pyeoAlerts.panel.sources.form.changeToClasses.label')}
                        tooltip={msg('process.pyeoAlerts.panel.sources.form.changeToClasses.tooltip')}
                        input={changeToClasses}
                        options={toOptions}
                        errorMessage={form.getErrorMessage(changeToClasses)}
                        multiple
                    />
                </Layout>
            )
        }

        isLoading() {
            const {stream} = this.props
            return stream('LOAD_CLASSIFICATION').active || stream('LOAD_INPUT_IMAGERY').active
        }

        hasClasses() {
            return !!this.props.classificationLegend
        }

        // The classification selected now is still being read - or the selector has not yet told the panel of it.
        isPending() {
            const {inputs: {classification}} = this.props
            const {classification: acquired, pending} = this.acquisition()
            return !!classification.value && (pending || acquired !== classification.value)
        }

        acquisition() {
            const {inputs: {acquisition}} = this.props
            return acquisition.value || {}
        }

        // Opening a saved recipe reads metadata without re-deriving its configuration.
        showCommittedClassification() {
            const {model} = this.props
            const id = model && model.classification
            this.startAcquisition(committed(id))
            if (id) {
                this.readClassification(id, false)
            }
        }

        startAcquisition(acquisition) {
            this.cancel$.next()
            this.cancel$ = new Subject()
            if (!acquisition.classification) {
                this.setLegend(undefined)
                this.setClassificationBands(undefined)
            }
            this.setAcquisition(acquisition)
        }

        setAcquisition(acquisition) {
            const {inputs} = this.props
            // Acquired metadata must not make the form dirty.
            inputs.acquisition.setInitialValue(acquisition)
            inputs.classification.setInvalid(acquisition.error ? msg(acquisition.error) : '')
        }

        readClassification(id, proposing) {
            const {stream, loadRecipe$} = this.props
            stream('LOAD_CLASSIFICATION',
                loadRecipe$(id).pipe(takeUntil(this.cancel$)),
                record => this.onClassification(id, record, proposing),
                error => this.readFailed(id, 'process.pyeoAlerts.classification.loadError', error, proposing)
            )
        }

        onClassification(id, {model: {legend, inputImagery}}, proposing) {
            if (proposing) {
                const {inputs} = this.props
                inputs.changeFromClasses.set([], {validate: false})
                inputs.changeToClasses.set([], {validate: false})
            }
            const images = (inputImagery && inputImagery.images) || []
            if (images.length !== 1) {
                this.setClassificationBands(undefined)
                if (proposing) {
                    this.refuse(id, 'process.pyeoAlerts.classification.singleInputRequired')
                } else {
                    this.setLegend(legend)
                }
                return
            }
            this.setLegend(legend)
            const input = images[0]
            if (input.type === 'RECIPE_REF' || input.type === 'ASSET') {
                this.readInputImagery(id, input, proposing)
            } else {
                this.setClassificationBands(undefined)
                if (proposing) {
                    this.setAcquisition(manual(id))
                }
            }
        }

        readInputImagery(id, input, proposing) {
            const {stream, loadRecipe$, loadedRecipes} = this.props
            stream('LOAD_INPUT_IMAGERY',
                readInputImagery$(
                    input,
                    {loadRecipe$, loadedRecipes, assetMetadata$: args => api.gee.assetMetadata$(args)},
                    {defaults: proposing}
                ).pipe(takeUntil(this.cancel$)),
                ({bands, defaults, restriction}) => {
                    this.setClassificationBands({classification: id, type: input.type, bands})
                    if (!proposing) {
                        return
                    }
                    if (restriction === SELECTED_SCENES) {
                        this.refuse(id, 'process.pyeoAlerts.classification.selectedScenesUnsupported')
                    } else if (restriction === NOT_DERIVABLE) {
                        this.setAcquisition({...manual(id), baseline: {type: input.type, bands}})
                    } else {
                        this.propose(id, defaults, {type: input.type, bands})
                    }
                },
                error => this.readFailed(id, input.type === 'ASSET'
                    ? 'process.pyeoAlerts.classification.assetLoadError'
                    : 'process.pyeoAlerts.classification.mosaicLoadError', error, proposing)
            )
        }

        // A recipe still being set up has the index gate its default model starts with, which nobody has chosen: applying a
        // classification read gives it NDVI where the gate can read NDVI, otherwise an index it can. A recipe already set
        // up keeps its gate, as does a gate no index could be read for - said in OPT, to be turned off there.
        initialGateUpdates(values) {
            const {initialized, indexGate, processing} = this.props
            const {baseline, proposal} = values.acquisition || {}
            if (initialized || !indexGate || !baseline) {
                return []
            }
            const model = {sources: valuesToModel(values), options: {...processing, ...proposal?.options}}
            const preferred = preferredGateIndex(model, baseline)
            return preferred && !readableGateIndexes(model, baseline).includes(indexGate.index)
                ? [{path: 'model.pyeoAlertsOptions.indexGate.index', value: preferred}]
                : []
        }

        propose(id, {options, sources, start, end}, baseline) {
            const {inputs} = this.props
            // Only what the imagery states is proposed: a setting it does not state keeps what the panel has.
            if (!this.dataSetsTouched && sources?.dataSets) {
                inputs.dataSets.set(_.uniq(Object.values(sources.dataSets).flat()))
            }
            if (sources?.cloudPercentageThreshold !== undefined) {
                inputs.cloudPercentageThreshold.set(sources.cloudPercentageThreshold)
            }
            this.setAcquisition({...derived(id, {
                ...(options && {options}),
                dates: start !== undefined && end !== undefined ? derivedDates(start, end) : {derived: false}
            }), baseline})
        }

        refuse(id, error) {
            this.setAcquisition(unsupported(id, error))
            this.setLegend(undefined)
        }

        readFailed(id, message, error, proposing) {
            Notifications.error({message: msg(message), error})
            if (proposing) {
                this.setAcquisition(unreadable(id))
            }
        }

        setLegend(legend) {
            const {recipeActionBuilder} = this.props
            recipeActionBuilder('SET_CLASSIFICATION_LEGEND', {})
                .set('ui.classificationLegend', legend)
                .dispatch()
        }

        // What the classification's input was read to have - its bands, and whether it is an asset or a recipe - for the
        // Options panel to judge the index gate by, naming the classification it is of: undefined while nothing is.
        setClassificationBands(classificationBands) {
            const {recipeActionBuilder} = this.props
            recipeActionBuilder('SET_CLASSIFICATION_BANDS', {})
                .set('ui.classificationBands', classificationBands)
                .dispatch()
        }
    },
    withRecipe(mapRecipeToProps),
    recipeFormPanel({id: 'sources', fields, modelToValues, valuesToModel}),
    recipeAccess()
)

function modelToValues({classification, dataSets, cloudPercentageThreshold, changeFromClasses, changeToClasses}) {
    return {
        classification,
        acquisition: committed(classification),
        dataSets: _.uniq(Object.values(dataSets || {}).flat()),
        cloudPercentageThreshold: cloudPercentageThreshold !== undefined ? cloudPercentageThreshold : 75,
        changeFromClasses: changeFromClasses || [],
        changeToClasses: changeToClasses || []
    }
}

function valuesToModel({classification, dataSets, cloudPercentageThreshold, changeFromClasses, changeToClasses}) {
    return {
        classification,
        dataSets: toSources(_.isArray(dataSets) ? dataSets : [dataSets]),
        cloudPercentageThreshold,
        changeFromClasses,
        changeToClasses
    }
}

const proposedUpdates = ({proposal} = {}) =>
    proposal
        ? [
            ...proposal.options ? [{path: 'model.options', value: proposal.options, merge: true}] : [],
            ...proposal.dates ? [{path: 'model.dates', value: proposal.dates, merge: true}] : []
        ]
        : []

const acquiring = classification =>
    ({classification, pending: true})

const derivedDates = (start, end) => {
    const baselineEnd = toDateString(end)
    return {
        baselineStart: toDateString(start),
        baselineEnd,
        monitoringStart: baselineEnd, // The baseline end is exclusive.
        monitoringEnd: moment.min(moment(baselineEnd, DATE_FORMAT).add(1, 'year'), moment()).format(DATE_FORMAT),
        derived: true
    }
}

const committed = classification =>
    ({classification, usable: true})

const derived = (classification, proposal) =>
    ({classification, usable: true, proposal})

// Nothing could be derived: the panel is configured by hand, as it stands.
const manual = classification => ({
    classification,
    usable: true,
    proposal: {dates: {derived: false}}
})

const unreadable = classification =>
    ({classification, error: 'process.pyeoAlerts.classification.unavailable', retry: true})

const unsupported = (classification, error) =>
    ({classification, error})
