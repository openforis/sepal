import _ from 'lodash'
import moment from 'moment'
import React from 'react'
import {Subject, takeUntil} from 'rxjs'

import {PRIMARY_IMAGE} from '#sepal/recipe/type/ccdcSlice'
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
import {segmentDescription} from '../../segmentEvidence'
import {PIXEL_SEGMENTS} from '../../sourceRequirements'
import {loadCCDCSegments$, RecipeActions} from '../ccdcSliceRecipe'
import {dateFormatOf} from '../sliceEvidence'
import styles from './chartPixel.module.css'

const fields = {
    selectedBand: new Form.Field()
}

const mapRecipeToProps = recipe => ({
    recipeId: recipe.id,
    latLng: selectFrom(recipe, 'ui.chartPixel'),
    dateFormat: dateFormatOf(recipe),
    // Samples are interpreted with the description they were taken under, so another one supersedes them.
    description: segmentDescription(recipe, PRIMARY_IMAGE).description,
    dateType: selectFrom(recipe, 'model.date.dateType'),
    date: selectFrom(recipe, 'model.date.date'),
    startDate: selectFrom(recipe, 'model.date.startDate'),
    endDate: selectFrom(recipe, 'model.date.endDate'),
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
        const {segments} = this.state
        const loading = !noChartableBand && (!segments || !segments.length)
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
            dateType, date, startDate, endDate, harmonics, gapStrategy, extrapolateSegment, extrapolateMaxDays, dateFormat, inputs: {selectedBand}
        } = this.props
        const {segmentsGate, noChartableBand} = this.props
        const {segments} = this.state
        const [highlightStart, highlightEnd] = dateType === 'RANGE'
            ? [startDate, endDate]
            : [date, date]
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
                    dateFormat={dateFormat}
                    segments={segments}
                    highlights={[{
                        startDate: moment(highlightStart, 'YYYY-MM-DD').subtract(0.5, 'days').toDate(),
                        endDate: moment(highlightEnd, 'YYYY-MM-DD').add(0.5, 'days').toDate(),
                        backgroundColor: '#FF000010',
                        color: '#FF0000'

                    }]}
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
        this.updateChart()
    }

    componentDidUpdate(prevProps) {
        this.updateChart(prevProps)
    }

    componentWillUnmount() {
        this.evidence?.unsubscribe()
        this.cancel$.next(true)
        this.cancel$.complete()
    }

    // Segments are requested only once the source is known to suit them (requestGate, sourceRequirements.js), and
    // requested when it comes to; segments already charted stay while it is checked again. Nothing is requested for a
    // band being replaced: the update the replacement causes requests it.
    updateChart(prevProps) {
        const {pixels, recipe, latLng, description, segmentsGate, noChartableBand, inputs: {selectedBand}} = this.props
        const band = this.resolvedBand(selectedBand.value)
        if (band !== selectedBand.value) {
            this.clearData()
            selectedBand.set(band)
            return
        }
        // With no band to chart, what was read for one charted before is not that band's, nor anything's now.
        if (noChartableBand || !latLng || !band) {
            return this.clearData()
        }
        // Read again when what is asked changes AND when the pixels may have moved without the model moving: a chart
        // drawn before that goes on plotting pixels the source no longer has.
        if (!prevProps || !_.isEqual(
            [recipe.model, pixels, latLng, band, description],
            [prevProps.recipe.model, prevProps.pixels, prevProps.latLng, prevProps.inputs.selectedBand.value, prevProps.description])
        ) {
            this.clearData()
            this.segmentsHeld = Boolean(segmentsGate)
            if (!this.segmentsHeld) {
                this.loadSegments()
            }
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

    // The measures the source's segments can be plotted for (pixelChartAvailability).
    bandOptions() {
        const {chartBands} = this.props
        return chartBands.map(name => ({value: name, label: name}))
    }

    // A band no longer offered is replaced by one that is - but only once what can be plotted is established: checking
    // the source again is no reason to change what is charted.
    resolvedBand(band) {
        const {chartable} = this.props
        return chartable
            ? resolveChartBand(band, this.bandOptions().map(({value}) => value))
            : band
    }

    // What is being read is let go and what was read is no longer shown.
    clearData() {
        this.cancel$.next(true)
        this.segmentsHeld = false
        if (this.state.segments !== undefined)
            this.setState({segments: undefined})
    }

    close() {
        this.clearData()
        this.recipeActions.setChartPixel(null)
    }
}

// What the chart's pixels were read from beyond the recipe: a change means they may have moved, which no comparison of
// what the source DESCRIBES would show (pixelGeneration.js). And, assessed as the toolbar's action assesses it, whether
// its segments may be read and which bands it can plot.
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
