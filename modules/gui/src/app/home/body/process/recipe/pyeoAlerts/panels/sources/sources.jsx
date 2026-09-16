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
    classification: new Form.Field(),
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

class _Sources extends React.Component {
    cancel$ = new Subject()
    state = {classificationError: null}
    // Pre-process/Dates params derived from the classification, staged on select and
    // committed on Apply — selecting a classification must never mutate the recipe or map.
    pendingModel = null
    // Whether the user manually chose optical datasets; if so we keep them across classifications.
    dataSetsTouched = false

    componentDidMount() {
        // A saved recipe already carries the user's datasets — treat them as user-owned so a
        // later classification change won't overwrite them. A fresh recipe starts empty and
        // follows the classification's native default until the user intervenes.
        const {model} = this.props
        this.dataSetsTouched = !!(model && model.dataSets && Object.keys(model.dataSets).length)
        // Load the legend for an already-selected classification (edit of a saved recipe) so the
        // From/To options render. No prefill — that only happens on a user change.
        this.syncLegendFromModel()
    }

    componentWillUnmount() {
        this.cancel$.next()
        this.cancel$.complete()
    }

    render() {
        return (
            <RecipeFormPanel
                className={styles.panel}
                placement='bottom-right'
                onApply={() => this.onApply()}
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

    isLoading() {
        const {stream} = this.props
        return stream('LOAD_CLASSIFICATION').active || stream('LOAD_INPUT_IMAGERY').active
    }

    hasClasses() {
        // A valid, loaded classification is one that produced a legend. An invalid
        // classification (error, legend cleared) leaves the downstream controls disabled.
        return !!this.props.classificationLegend
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
                errorMessage={this.state.classificationError}
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

    // ---- live classification metadata load (was the headless ClassificationSync) ----

    // Mount / Cancel: reflect the committed classification — legend only, never a prefill.
    syncLegendFromModel() {
        const {model} = this.props
        const id = model && model.classification
        this.startLoad(id)
        if (id) {
            this.loadClassification(id, false)
        }
    }

    // User picked a classification: load its legend and stage derived params (pending Apply).
    onClassificationSelected(id) {
        if (id === this.loadedClassificationId) {
            return
        }
        this.startLoad(id)
        if (id) {
            this.loadClassification(id, true)
        } else {
            // Cleared selection — drop any staged From/To so nothing dangles.
            const {inputs} = this.props
            inputs.changeFromClasses.set([])
            inputs.changeToClasses.set([])
        }
    }

    // Reset the load guard/stream and clear staged state before (re)loading a classification.
    startLoad(id) {
        this.loadedClassificationId = id
        this.cancel$.next()
        this.cancel$ = new Subject()
        this.pendingModel = null
        this.setState({classificationError: null})
        if (!id) {
            this.setLegend(undefined)
            this.setClassificationBands(undefined)
        }
    }

    loadClassification(id, prefill) {
        const {stream, loadRecipe$} = this.props
        stream('LOAD_CLASSIFICATION',
            loadRecipe$(id).pipe(takeUntil(this.cancel$)),
            classification => this.onClassification(classification, prefill),
            error => Notifications.error({message: msg('process.pyeoAlerts.classification.loadError'), error})
        )
    }

    onClassification(classification, prefill) {
        // Always resolve the classification's input bands (drives the Options index-gate guard);
        // only a user selection (prefill) stages derived Pre-process/Dates params.
        if (prefill) {
            const {inputs} = this.props
            inputs.changeFromClasses.set([])
            inputs.changeToClasses.set([])
        }
        const images = (classification.model.inputImagery && classification.model.inputImagery.images) || []
        if (images.length !== 1) {
            this.setClassificationBands(undefined)
            if (prefill) {
                this.setClassificationError('process.pyeoAlerts.classification.singleInputRequired', {clearLegend: true})
            } else {
                this.setLegend(classification.model.legend)
            }
            return
        }
        this.setLegend(classification.model.legend)
        const input = images[0]
        if (input.type === 'RECIPE_REF' || input.type === 'ASSET') {
            this.loadInputImagery(input, prefill)
        } else {
            this.setClassificationBands(undefined)
            if (prefill) {
                this.notDerivable()
            }
        }
    }

    // The bands are wanted whichever way the panel was opened; the configuration only when the user has
    // just chosen this classification. What could not supply one is configured by hand, not rejected.
    loadInputImagery(input, prefill) {
        const {stream, loadRecipe$, loadedRecipes} = this.props
        stream('LOAD_INPUT_IMAGERY',
            readInputImagery$(
                input,
                {loadRecipe$, loadedRecipes, assetMetadata$: args => api.gee.assetMetadata$(args)},
                {defaults: prefill}
            ).pipe(takeUntil(this.cancel$)),
            ({bands, defaults, restriction}) => {
                this.setClassificationBands(bands)
                if (!prefill) {
                    return
                }
                if (restriction === SELECTED_SCENES) {
                    this.setClassificationError(
                        'process.pyeoAlerts.classification.selectedScenesUnsupported', {clearLegend: true}
                    )
                } else if (restriction === NOT_DERIVABLE) {
                    this.notDerivable()
                } else {
                    this.prefill(defaults)
                }
            },
            error => Notifications.error({message: msg(input.type === 'ASSET'
                ? 'process.pyeoAlerts.classification.assetLoadError'
                : 'process.pyeoAlerts.classification.mosaicLoadError'), error})
        )
    }

    prefill({options, sources, start, end}) {
        const {inputs} = this.props
        // Optical datasets: follow the classification's native default only while the user
        // hasn't manually chosen datasets — otherwise keep their selection.
        if (!this.dataSetsTouched) {
            inputs.dataSets.set(_.uniq(Object.values((sources && sources.dataSets) || {}).flat()))
        }
        inputs.cloudPercentageThreshold.set(
            sources && sources.cloudPercentageThreshold !== undefined ? sources.cloudPercentageThreshold : 75
        )
        // Pre-process + Dates live in other panels: stage them and commit on Apply (onApply),
        // so merely selecting a classification never mutates the recipe or the map.
        const baselineStart = toDateString(start)
        const baselineEnd = toDateString(end)
        // Default the monitoring window to (at most) one year after the baseline's last date.
        const monitoringEnd = moment
            .min(moment(baselineEnd, DATE_FORMAT).add(1, 'year'), moment())
            .format(DATE_FORMAT)
        this.pendingModel = {
            options,
            dates: {
                baselineStart,
                baselineEnd,
                monitoringStart: baselineEnd, // end-exclusive ⇒ seamless
                monitoringEnd,
                derived: true
            }
        }
    }

    notDerivable() {
        this.setClassificationError('process.pyeoAlerts.classification.notDerivable')
        this.pendingModel = {dates: {derived: false}}
    }

    onApply() {
        // Commit the classification-derived Pre-process/Dates params staged on select.
        const {recipeActionBuilder} = this.props
        if (!this.pendingModel) {
            return
        }
        const {options, dates} = this.pendingModel
        const actionBuilder = recipeActionBuilder('COMMIT_CLASSIFICATION_DERIVED', {})
        if (options) {
            actionBuilder.assign('model.options', options)
        }
        if (dates) {
            Object.entries(dates).forEach(([key, value]) => actionBuilder.set(`model.dates.${key}`, value))
        }
        actionBuilder.dispatch()
        this.pendingModel = null
    }

    onCancel() {
        // Drop staged params. If a different classification was previewed, restore the
        // committed one's legend; otherwise the current legend already matches.
        this.pendingModel = null
        const {model} = this.props
        if (this.loadedClassificationId !== (model && model.classification)) {
            this.syncLegendFromModel()
        }
    }

    setClassificationError(key, {clearLegend = false} = {}) {
        this.setState({classificationError: msg(key)})
        if (clearLegend) {
            this.setLegend(undefined)
        }
    }

    setLegend(legend) {
        const {recipeActionBuilder} = this.props
        recipeActionBuilder('SET_CLASSIFICATION_LEGEND', {})
            .set('ui.classificationLegend', legend)
            .dispatch()
    }

    // The classification's input-imagery band names — read by the Options panel to enable/disable
    // the index gate (an RGB baseline can't produce NDVI/NDMI/NBR).
    setClassificationBands(classificationBands) {
        const {recipeActionBuilder} = this.props
        recipeActionBuilder('SET_CLASSIFICATION_BANDS', {})
            .set('ui.classificationBands', classificationBands)
            .dispatch()
    }
}

const valuesToModel = ({classification, dataSets, cloudPercentageThreshold, changeFromClasses, changeToClasses}) => ({
    classification,
    dataSets: toSources(_.isArray(dataSets) ? dataSets : [dataSets]),
    cloudPercentageThreshold,
    changeFromClasses,
    changeToClasses
})

const modelToValues = ({classification, dataSets, cloudPercentageThreshold, changeFromClasses, changeToClasses}) => ({
    classification,
    dataSets: _.uniq(Object.values(dataSets || {}).flat()),
    cloudPercentageThreshold: cloudPercentageThreshold !== undefined ? cloudPercentageThreshold : 75,
    changeFromClasses: changeFromClasses || [],
    changeToClasses: changeToClasses || []
})

export const Sources = compose(
    _Sources,
    withRecipe(mapRecipeToProps),
    recipeFormPanel({id: 'sources', fields, modelToValues, valuesToModel}),
    recipeAccess()
)
