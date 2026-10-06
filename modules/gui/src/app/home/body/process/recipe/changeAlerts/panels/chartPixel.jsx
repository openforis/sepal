import _ from 'lodash'
import moment from 'moment'
import React from 'react'
import {Subject, takeUntil} from 'rxjs'

import {monitoringDates} from '#sepal/recipe/changeAlerts/monitoringDates'
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
import {resolveChartBand} from '../../chartBandSelection'
import {ChartPixelPanelHeader} from '../../chartPixelPanelHeader'
import {pixelChartAvailability} from '../../operationAvailability'
import {pixelGenerationOfState} from '../../pixelGeneration'
import {dateFormatOf, segmentDescription} from '../../segmentEvidence'
import {PIXEL_SEGMENTS} from '../../sourceRequirements'
import {loadCCDCObservations$, loadCCDCSegments$, RecipeActions} from '../changeAlertsRecipe'
import styles from './chartPixel.module.css'

const fields = {
    selectedBand: new Form.Field()
}

const mapRecipeToProps = recipe => ({
    recipeId: recipe.id,
    latLng: selectFrom(recipe, 'ui.chartPixel'),
    dateFormat: dateFormatOf(recipe, PRIMARY_IMAGE),
    // Samples are interpreted with the description they were taken under, so another one supersedes them - and the
    // description lives in ui, which recipe.model cannot see.
    description: segmentDescription(recipe, PRIMARY_IMAGE).description,
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
        const {segmentsGate, noChartableBand} = this.props
        if (noChartableBand)
            return <Message type='info' text={msg('process.ccdc.chartPixel.noChartableBand')}/>
        if (!segments && segmentsGate && !segmentsGate.wait)
            return <Message type='info' text={msg('process.source.status.withheld', {section: msg(segmentsGate.section)})}/>
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

    // The chart watches the evidence its segments need, so they are checked wherever it is open.
    componentDidMount() {
        const {recipeId, sourceRuntime} = this.props
        this.evidence = sourceRuntime?.watchEvidence$({recipeId, operation: PIXEL_SEGMENTS}).subscribe()
    }

    // Segments are requested only once the reference is known to suit them (requestGate, sourceRequirements.js), and
    // requested when it comes to; segments already charted stay while it is checked again.
    componentDidUpdate(prevProps) {
        const {band, stream, recipe, latLng, description, pixels, segmentsGate, noChartableBand, inputs: {selectedBand}} = this.props

        // Nothing is requested for a band being replaced: the update the replacement causes requests it.
        const resolved = this.resolvedBand(selectedBand.value || band)
        if (resolved !== selectedBand.value) {
            selectedBand.set(resolved)
            return
        }
        // With no band to chart, what was read for one charted before is not that band's, nor anything's now.
        if (noChartableBand) {
            return this.withdraw()
        }
        if (!latLng || !selectedBand.value) {
            return
        }
        if (!_.isEqual(
            [recipe.model, latLng, selectedBand.value, description, pixels],
            [prevProps.recipe.model, prevProps.latLng, prevProps.inputs.selectedBand.value, prevProps.description, prevProps.pixels])
        ) {
            this.cancel$.next(true)
            this.setState({segments: undefined})
            this.segmentsHeld = Boolean(segmentsGate)
            if (!this.segmentsHeld) {
                this.loadSegments()
            }
            stream('LOAD_CCDC_OBSERVATIONS',
                loadCCDCObservations$({recipe, latLng, bands: [selectedBand.value]}).pipe(
                    takeUntil(this.cancel$)
                ),
                observations => this.setState({observations}),
                error => {
                    this.close()
                    Notifications.error({
                        message: msg('process.ccdc.chartPixel.loadObservations.error'),
                        error: toUserErrorMessage(error)
                    })
                }
            )
        } else if (this.segmentsHeld && !segmentsGate) {
            this.segmentsHeld = false
            this.loadSegments()
        }
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
        this.segmentsHeld = false
        if (segments || observations) {
            this.setState({segments: undefined, observations: undefined})
        }
    }

    // A band no longer offered is replaced by one that is - but only once what can be plotted is established: checking
    // the reference again is no reason to change what is charted.
    resolvedBand(band) {
        const {chartable} = this.props
        return chartable
            ? resolveChartBand(band, this.bandOptions().map(({value}) => value))
            : band
    }

    close() {
        this.cancel$.next(true)
        this.setState({segments: undefined, observations: undefined})
        this.recipeActions.setChartPixel(null)
    }

    componentWillUnmount() {
        this.evidence?.unsubscribe()
    }
}

// What the chart's pixels were read from beyond the recipe (pixelGeneration.js), and, assessed as the toolbar's action
// assesses it, whether its segments may be read and which bands it can plot.
const mapStateToProps = (state, {recipe, recipeId, sourceRuntime}) => {
    const {gate, chartable, bands, noChartableBand} = pixelChartAvailability({
        state, recipe, evidenceOwnerOf: id => sourceRuntime?.evidenceOwnerOf(id), now: Date.now()
    })
    return {
        pixels: pixelGenerationOfState(state, recipeId),
        segmentsGate: gate,
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
