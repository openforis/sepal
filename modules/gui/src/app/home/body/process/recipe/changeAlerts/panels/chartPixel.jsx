import moment from 'moment'
import React from 'react'
import {Subject, takeUntil} from 'rxjs'

import {monitoringDates} from '#sepal/recipe/changeAlerts/monitoringDates'
import {PIXEL_OBSERVATIONS} from '#sepal/recipe/output/readiness'
import {PRIMARY_IMAGE} from '#sepal/recipe/type/changeAlerts'
import {compose} from '~/compose'
import {connect} from '~/connect'
import {selectFrom} from '~/stateUtils'
import {msg} from '~/translate'
import {toUserErrorMessage} from '~/userError'
import {Form} from '~/widget/form'
import {withForm} from '~/widget/form/form'
import {Icon} from '~/widget/icon'
import {Message} from '~/widget/message'
import {Notifications} from '~/widget/notifications'
import {Panel} from '~/widget/panel/panel'

import {withRecipe} from '../../../recipeContext'
import {withSourceRuntime} from '../../../sourceRuntime/sourceRuntimeContext'
import {CCDCGraph} from '../../ccdc/ccdcGraph'
import {ChartPixelPanelHeader} from '../../chartPixelPanelHeader'
import {combineOperationGates, pixelChartAvailability, pixelOperationsAvailability, watchOperations} from '../../operationAvailability'
import {pixelChartUpdate} from '../../pixelChartUpdate'
import {pixelGenerationOfState} from '../../pixelGeneration'
import {dateFormatOf, segmentDescription} from '../../segmentEvidence'
import {PIXEL_SEGMENTS} from '../../sourceRequirements'
import {loadCCDCObservations$, loadCCDCSegments$, RecipeActions} from '../changeAlertsRecipe'
import {settingsOf} from '../processingSettings'
import styles from './chartPixel.module.css'

// Both streams are held to their declared needs: the reference's segments and the native observations. Sources'
// configured monitoring choice applies to both, independently of an exploratory chart-band selection.
export const CHART_OPERATIONS = [PIXEL_SEGMENTS, PIXEL_OBSERVATIONS]

const fields = {
    selectedBand: new Form.Field()
}

const mapRecipeToProps = recipe => ({
    recipeId: recipe.id,
    latLng: selectFrom(recipe, 'ui.chartPixel'),
    dateFormat: settingsOf(recipe).model && dateFormatOf({...recipe, model: settingsOf(recipe).model}, PRIMARY_IMAGE),
    band: selectFrom(recipe, 'model.sources.band'),
    harmonics: selectFrom(recipe, 'model.options.harmonics'),
    gapStrategy: selectFrom(recipe, 'model.options.gapStrategy'),
    extrapolateSegment: selectFrom(recipe, 'model.options.extrapolateSegment'),
    extrapolateMaxDays: selectFrom(recipe, 'model.options.extrapolateMaxDays'),
    recipe
})

class _ChartPixel extends React.Component {
    constructor(props) {
        super(props)
        this.cancel$ = new Subject()
        this.state = {}
        this.recipeActions = RecipeActions(props.recipeId)
        this.close = this.close.bind(this)
    }

    render() {
        const {latLng} = this.props
        if (!latLng)
            return null
        else
            return this.renderPanel()
    }

    renderPanel() {
        const {latLng, noChartableBand} = this.props
        const {segments, observations} = this.state
        const loading = !noChartableBand && (!segments || !segments.length) && (!observations || !observations.length)
        return (
            <Panel
                className={styles.panel}
                placement='center'>
                <ChartPixelPanelHeader latLng={latLng}/>

                <Panel.Content className={loading ? styles.loading : null}
                    scrollable={false}
                    noVerticalPadding>
                    <form className={styles.form}>
                        {this.renderBandOptions()}
                        {this.renderChart()}
                    </form>
                </Panel.Content>

                <Panel.Buttons>
                    <Panel.Buttons.Main>
                        <Panel.Buttons.Close
                            keybinding='Escape'
                            onClick={this.close}
                        />
                    </Panel.Buttons.Main>
                </Panel.Buttons>
            </Panel>
        )
    }

    renderSpinner() {
        return (
            <div className={styles.spinner}>
                <Icon name='spinner' size='2x'/>
            </div>
        )
    }

    renderBandOptions() {
        const {inputs: {selectedBand}} = this.props
        const options = this.bandOptions()
        return (
            <Form.Combo
                className={styles.bandSelection}
                input={selectedBand}
                options={options}/>
        )
    }

    renderChart() {
        const {
            recipe, harmonics, gapStrategy, extrapolateSegment, extrapolateMaxDays, dateFormat, inputs: {selectedBand}
        } = this.props
        const {segments, observations} = this.state
        const {monitoringEnd, monitoringStart, calibrationStart} = monitoringDates(recipe.model)
        const highlights = [
            {
                startDate: moment.utc(calibrationStart, 'YYYY-MM-DD').subtract(0.5, 'days').toDate(),
                endDate: moment.utc(monitoringStart, 'YYYY-MM-DD').subtract(0.5, 'days').toDate(),
                backgroundColor: '#00FF0010',
                color: '#00FF00'
            },
            {
                startDate: moment.utc(monitoringStart, 'YYYY-MM-DD').toDate(),
                endDate: moment.utc(monitoringEnd, 'YYYY-MM-DD').add(0.5, 'days').toDate(),
                backgroundColor: '#FF000010',
                color: '#FF0000'
            }
        ]
        const {noChartableBand} = this.props
        if (noChartableBand)
            return <Message type='info' text={msg('process.ccdc.chartPixel.noChartableBand')}/>
        const loading = !segments
        if (loading)
            return this.renderSpinner()
        else {
            return (
                <CCDCGraph
                    band={selectedBand.value}
                    startDate={moment.utc(calibrationStart, 'YYYY-MM-DD').subtract(1, 'year').toDate()}
                    endDate={moment.utc(monitoringEnd, 'YYYY-MM-DD').add(2, 'days').toDate()}
                    dateFormat={dateFormat}
                    segments={segments}
                    observations={observations}
                    highlights={highlights}
                    highlightGaps
                    gapStrategy={gapStrategy}
                    extrapolateMaxDays={extrapolateMaxDays}
                    extrapolateSegment={extrapolateSegment}
                    harmonics={harmonics}
                />
            )
        }
    }

    // The chart watches the evidence its segments need, and what running them needs, so both are checked wherever it is
    // open.
    componentDidMount() {
        const {recipeId, sourceRuntime} = this.props
        this.evidence = sourceRuntime?.watchEvidence$({recipeId, operation: PIXEL_SEGMENTS}).subscribe()
        this.operationWatches = watchOperations({sourceRuntime, recipeId, operations: CHART_OPERATIONS})
    }

    // Capability, monitoring choice and execution needs share one gate and the common chart lifecycle.
    // Cancel both streams together, including when a confirmed Sources finding withdraws the chart.
    componentDidUpdate(prevProps) {
        const {band, chartable, latLng, inputs: {selectedBand}} = this.props
        if (latLng && !selectedBand.value && band && chartable && this.bandOptions().some(({value}) => value === band)
            && !this.props.operationsGate?.withdraw) {
            selectedBand.set(band)
            return
        }
        const bands = chartable ? this.props.chartBands : [selectedBand.value].filter(Boolean)
        const {close, clear, select, load} = pixelChartUpdate(this.props, prevProps, bands)
        if (close) {
            return this.close()
        }
        clear && this.withdraw()
        select !== undefined && selectedBand.set(select)
        if (load) {
            this.loadSegments()
            this.loadObservations()
        }
    }

    loadObservations() {
        const {stream, recipe, latLng, inputs: {selectedBand}} = this.props
        stream('LOAD_CCDC_OBSERVATIONS',
            loadCCDCObservations$({recipe, latLng, bands: [selectedBand.value]}).pipe(takeUntil(this.cancel$)),
            observations => this.setState({observations}),
            error => {
                this.close()
                Notifications.error({
                    message: msg('process.ccdc.chartPixel.loadObservations.error'),
                    error: toUserErrorMessage(error)
                })
            }
        )
    }

    loadSegments() {
        const {stream, recipe, latLng, inputs: {selectedBand}} = this.props
        stream('LOAD_CCDC_SEGMENTS',
            loadCCDCSegments$({recipe, latLng, bands: [selectedBand.value]}).pipe(
                takeUntil(this.cancel$)
            ),
            segments => this.setState({segments}),
            error => {
                this.close()
                Notifications.error({
                    message: msg('process.ccdc.chartPixel.loadFailed'),
                    error: toUserErrorMessage(error)
                })
            }
        )
    }

    // The measures the reference's segments can be plotted for and the observations show (pixelChartAvailability).
    bandOptions() {
        const {chartBands} = this.props
        return chartBands.map(name => ({value: name, label: name}))
    }

    // What is being read is let go and what was read is no longer shown. Once a band can be charted again, it is chosen
    // and read as any replacement is.
    withdraw() {
        const {segments, observations} = this.state
        this.cancel$.next(true)
        if (segments || observations) {
            this.setState({segments: undefined, observations: undefined})
        }
    }

    close() {
        this.cancel$.next(true)
        this.setState({segments: undefined, observations: undefined})
        this.recipeActions.setChartPixel(null)
    }

    componentWillUnmount() {
        this.cancel$.next(true)
        this.cancel$.complete()
        this.evidence?.unsubscribe()
        this.operationWatches.unsubscribe()
    }
}

// What the chart's pixels were read from beyond the recipe (pixelGeneration.js), and, assessed as the toolbar's action
// assesses it, whether its segments may be read, which bands it can plot, and whether the reference can run.
const mapStateToProps = (state, {recipe, recipeId, sourceRuntime}) => {
    const heldFor = key => sourceRuntime?.heldFor(key)
    const {gate, chartable, bands, noChartableBand} = pixelChartAvailability({
        state, recipe, evidenceOwnerOf: id => sourceRuntime?.evidenceOwnerOf(id), heldFor, now: Date.now()
    })
    const operations = pixelOperationsAvailability({state, recipe, heldFor, operations: CHART_OPERATIONS})
    return {
        operationsGate: combineOperationGates(gate, operations.gate),
        // Current descriptions and external pixel generations can change without the applied model changing.
        computation: [operations.computation, recipe.model, segmentDescription(recipe, PRIMARY_IMAGE).description, pixelGenerationOfState(state, recipeId)],
        chartable,
        chartBands: bands,
        noChartableBand
    }
}

export const ChartPixel = compose(
    _ChartPixel,
    connect(mapStateToProps),
    withSourceRuntime(),
    withRecipe(mapRecipeToProps),
    withForm({fields})
)

ChartPixel.propTypes = {}
