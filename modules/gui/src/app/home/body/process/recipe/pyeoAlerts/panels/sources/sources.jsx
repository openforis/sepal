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
import {Icon} from '~/widget/icon'
import {Layout} from '~/widget/layout'
import {NoData} from '~/widget/noData'
import {Notifications} from '~/widget/notifications'
import {Panel} from '~/widget/panel/panel'
import {RecipeInput} from '~/widget/recipeInput'

import {NOT_DERIVABLE, readInputImagery$, SELECTED_SCENES} from '../../inputImagery'
import toDateString from '../../toDateString'
import styles from './sources.module.css'

const DATE_FORMAT = 'YYYY-MM-DD'

const fields = {
    // Combo updates the field before its deferred onChange; validate against the current value.
    classification: new Form.Field()
        .predicate(
            (classification, {acquisition}) =>
                !classification || !!(acquisition?.usable && acquisition.classification === classification),
            'process.pyeoAlerts.classification.pending'
        ),
    acquisition: new Form.Field(),
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
    classificationLegend: selectFrom(recipe, 'ui.classificationLegend')
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
                    additionalUpdates={({acquisition}) => proposedUpdates(acquisition)}
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
                inputs.changeFromClasses.set([])
                inputs.changeToClasses.set([])
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
            return (
                <RecipeInput
                    label={msg('process.pyeoAlerts.panel.sources.form.classification.label')}
                    tooltip={msg('process.pyeoAlerts.panel.sources.form.classification.tooltip')}
                    placeholder={msg('process.pyeoAlerts.panel.sources.form.classification.placeholder')}
                    input={classification}
                    filter={type => type.id === 'CLASSIFICATION'}
                    busyMessage={this.isLoading()}
                    warningMessage={this.warningMessage()}
                    onChange={id => this.onClassificationSelected(id)}
                />
            )
        }

        renderDataSets() {
            const {dates, inputs: {dataSets}} = this.props
            return (
                <Form.Buttons
                    label={msg('process.pyeoAlerts.panel.sources.form.dataSets.label')}
                    tooltip={msg('process.pyeoAlerts.panel.sources.form.dataSets.tooltip')}
                    input={dataSets}
                    options={opticalDataSetOptions({...dates})}
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
            const {inputs: {changeFromClasses, changeToClasses}, classificationLegend} = this.props
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
                        multiple
                    />
                    <Form.Buttons
                        label={msg('process.pyeoAlerts.panel.sources.form.changeToClasses.label')}
                        tooltip={msg('process.pyeoAlerts.panel.sources.form.changeToClasses.tooltip')}
                        input={changeToClasses}
                        options={toOptions}
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

        warningMessage() {
            const {warning} = this.acquisition()
            return warning ? msg(warning) : null
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
            inputs.classification.setInvalid(acquisition.usable ? '' : msg(acquisition.error))
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
                inputs.changeFromClasses.set([])
                inputs.changeToClasses.set([])
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
                    this.setClassificationBands(bands)
                    if (!proposing) {
                        return
                    }
                    if (restriction === SELECTED_SCENES) {
                        this.refuse(id, 'process.pyeoAlerts.classification.selectedScenesUnsupported')
                    } else if (restriction === NOT_DERIVABLE) {
                        this.setAcquisition(manual(id))
                    } else {
                        this.propose(id, defaults)
                    }
                },
                error => this.readFailed(id, input.type === 'ASSET'
                    ? 'process.pyeoAlerts.classification.assetLoadError'
                    : 'process.pyeoAlerts.classification.mosaicLoadError', error, proposing)
            )
        }

        propose(id, {options, sources, start, end}) {
            const {inputs} = this.props
            if (!this.dataSetsTouched) {
                inputs.dataSets.set(_.uniq(Object.values((sources && sources.dataSets) || {}).flat()))
            }
            inputs.cloudPercentageThreshold.set(sources?.cloudPercentageThreshold ?? 75)
            const baselineEnd = toDateString(end)
            const monitoringEnd = moment
                .min(moment(baselineEnd, DATE_FORMAT).add(1, 'year'), moment())
                .format(DATE_FORMAT)
            this.setAcquisition(derived(id, {
                options,
                dates: {
                    baselineStart: toDateString(start),
                    baselineEnd,
                    monitoringStart: baselineEnd, // The baseline end is exclusive.
                    monitoringEnd,
                    derived: true
                }
            }))
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

        // The Options panel uses these bands to decide which index gates are available.
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
    ({classification, error: 'process.pyeoAlerts.classification.pending'})

const committed = classification =>
    ({classification, usable: true})

const derived = (classification, proposal) =>
    ({classification, usable: true, proposal})

const manual = classification => ({
    classification,
    usable: true,
    proposal: {dates: {derived: false}},
    warning: 'process.pyeoAlerts.classification.notDerivable'
})

const unreadable = classification =>
    ({classification, error: 'process.pyeoAlerts.classification.unavailable', retry: true})

const unsupported = (classification, error) =>
    ({classification, error})
