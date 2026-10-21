import moment from 'moment'
import React from 'react'
import {Subject, takeUntil} from 'rxjs'

import {pixelObservationsOperation} from '#sepal/recipe/classifiedOutputs'
import {CLASSIFIED_PIXEL_OBSERVATIONS, PIXEL_OBSERVATIONS} from '#sepal/recipe/output/readiness'
import {compose} from '~/compose'
import {connect} from '~/connect'
import {flatBandOptions, getAvailableBands, toDataSetIds} from '~/sources'
import {selectFrom} from '~/stateUtils'
import {msg} from '~/translate'
import {toUserErrorMessage} from '~/userError'
import {Form} from '~/widget/form'
import {withForm} from '~/widget/form/form'
import {Icon} from '~/widget/icon'
import {Message} from '~/widget/message'
import {Notifications} from '~/widget/notifications'
import {Panel} from '~/widget/panel/panel'

import {NoData} from '../../../../../../../widget/noData'
import {withRecipe} from '../../../recipeContext'
import {withSourceRuntime} from '../../../sourceRuntime/sourceRuntimeContext'
import {CCDCGraph} from '../../ccdc/ccdcGraph'
import {ChartPixelPanelHeader} from '../../chartPixelPanelHeader'
import {pixelOperationsAvailability, watchOperations} from '../../operationAvailability'
import {pixelChartUpdate} from '../../pixelChartUpdate'
import {selectedClassificationOfState} from '../../selectedClassification'
import {loadObservations$, RecipeActions} from '../timeSeriesRecipe'
import styles from './chartPixel.module.css'

// What the chart runs at its pixel, whatever band it charts: the collection's observations. It and its action are held to
// these, and watch them (timeSeriesToolbar.jsx). A band the Classification computes is read as the classified
// observations as well (BAND_OPERATIONS), which hold that band alone.
export const CHART_OPERATIONS = [PIXEL_OBSERVATIONS]

const NO_OPERATIONS = []

const BAND_OPERATIONS = {
    [PIXEL_OBSERVATIONS]: NO_OPERATIONS,
    [CLASSIFIED_PIXEL_OBSERVATIONS]: [CLASSIFIED_PIXEL_OBSERVATIONS]
}

const fields = {
    selectedBand: new Form.Field()
}

const mapRecipeToProps = recipe => ({
    recipeId: recipe.id,
    latLng: selectFrom(recipe, 'ui.chartPixel'),
    startDate: moment(selectFrom(recipe, 'model.dates.startDate'), 'YYYY-MM-DD').toDate(),
    endDate: moment(selectFrom(recipe, 'model.dates.endDate'), 'YYYY-MM-DD').toDate(),
    dateFormat: selectFrom(recipe, 'model.ccdcOptions.dateFormat'),
    corrections: selectFrom(recipe, 'model.opticalPreprocess.corrections'),
    dataSets: selectFrom(recipe, 'model.sources.dataSets'),
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
        const {latLng, bandGate} = this.props
        const {observations} = this.state
        const loading = !observations && !bandGate?.withdraw
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
        const options = flatBandOptions(this.bandSetting())
        return (
            <Form.Combo
                className={styles.bandSelection}
                input={selectedBand}
                options={options}/>
        )
    }

    bandSetting() {
        const {classificationLegend, classifierType, classifier, corrections, dataSets} = this.props
        return {
            dataSets: toDataSetIds(dataSets),
            corrections,
            classification: {classificationLegend, classifierType, classifier, include: ['regression', 'probabilities']}
        }
    }

    renderChart() {
        const {dateFormat, startDate, endDate, bandGate, inputs: {selectedBand}} = this.props
        const {observations} = this.state
        const loading = !observations
        const noObservations = observations && !observations.features.length
        if (bandGate?.withdraw) {
            return <Message type='info' text={msg('process.timeSeries.chartPixel.classifiedBandWithheld')}/>
        } else if (loading) {
            return this.renderSpinner()
        } else if (noObservations) {
            return <NoData message={msg('process.timeSeries.chartPixel.loadObservations.noData')}/>
        } else {
            return (
                <CCDCGraph
                    band={selectedBand.value}
                    dateFormat={dateFormat}
                    startDate={startDate}
                    endDate={endDate}
                    observations={observations}
                    highlightGaps
                    harmonics={3}
                />
            )
        }
    }

    componentDidMount() {
        const {recipeId, sourceRuntime} = this.props
        this.operationWatches = watchOperations({sourceRuntime, recipeId, operations: CHART_OPERATIONS})
        this.watchBand()
        this.updateChart()
    }

    componentDidUpdate(prevProps) {
        this.watchBand(prevProps)
        this.updateChart(prevProps)
    }

    componentWillUnmount() {
        this.operationWatches.unsubscribe()
        this.bandWatches.unsubscribe()
        this.cancel$.next(true)
    }

    // What the band charted needs beyond what any band does is read for as long as it is charted.
    watchBand(prevProps) {
        const {recipeId, sourceRuntime, bandOperations} = this.props
        if (!prevProps || bandOperations !== prevProps.bandOperations) {
            this.bandWatches?.unsubscribe()
            this.bandWatches = watchOperations({sourceRuntime, recipeId, operations: bandOperations})
        }
    }

    // The observations are read whenever they may be (pixelChartUpdate).
    updateChart(prevProps) {
        const {inputs: {selectedBand}} = this.props
        const {close, clear, select, load} = pixelChartUpdate(this.props, prevProps, getAvailableBands(this.bandSetting()))
        if (close) {
            return this.close()
        }
        clear && this.clearData()
        select !== undefined && selectedBand.set(select)
        load && this.loadData(load)
    }

    loadData(band) {
        const {stream, recipe, latLng} = this.props
        stream('LOAD_OBSERVATIONS',
            loadObservations$({recipe, latLng, bands: [band]}).pipe(
                takeUntil(this.cancel$)
            ),
            observations => this.setState({observations}),
            error => {
                this.close()
                Notifications.error({
                    message: msg('process.timeSeries.chartPixel.loadObservations.error'),
                    error: toUserErrorMessage(error)
                })
            }
        )
    }

    clearData() {
        this.cancel$.next(true)
        if (this.state.observations !== undefined)
            this.setState({observations: undefined})
    }

    close() {
        this.clearData()
        this.recipeActions.setChartPixel(null)
    }
}

// What it is computed from, beside whether it may be read (pixelOperationsAvailability), and what is offered of the
// Classification its Sources select, as the session holds it now or as those reads resolved it. What the band charted
// needs beyond that (`bandGate`) holds that band without closing the chart, so another band can still be charted: a
// finding of it is said in the chart instead.
const mapStateToProps = (state, {recipe, sourceRuntime, latLng, inputs: {selectedBand}}) => {
    const heldFor = key => sourceRuntime?.heldFor(key)
    const {gate, computation, recordOf} = pixelOperationsAvailability({state, recipe, heldFor, operations: CHART_OPERATIONS})
    const bandOperations = latLng && selectedBand.value ? BAND_OPERATIONS[pixelObservationsOperation([selectedBand.value])] : NO_OPERATIONS
    const bandGate = bandOperations.length
        ? pixelOperationsAvailability({state, recipe, heldFor, operations: bandOperations}).gate
        : null
    return {
        operationsGate: gate || (bandGate && {...bandGate, withdraw: false}),
        bandGate,
        bandOperations,
        computation,
        ...selectedClassificationOfState(state, recipe, recordOf)
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
