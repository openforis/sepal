import moment from 'moment'
import React from 'react'
import {Subject, takeUntil} from 'rxjs'

import {PIXEL_OBSERVATIONS, PIXEL_SEGMENTS} from '#sepal/recipe/output/readiness'
import {compose} from '~/compose'
import {connect} from '~/connect'
import {flatBandOptions, getAvailableBands, toDataSetIds} from '~/sources'
import {selectFrom} from '~/stateUtils'
import {msg} from '~/translate'
import {toUserErrorMessage} from '~/userError'
import {Form} from '~/widget/form'
import {withForm} from '~/widget/form/form'
import {Icon} from '~/widget/icon'
import {Notifications} from '~/widget/notifications'
import {Panel} from '~/widget/panel/panel'

import {withRecipe} from '../../../recipeContext'
import {withSourceRuntime} from '../../../sourceRuntime/sourceRuntimeContext'
import {ChartPixelPanelHeader} from '../../chartPixelPanelHeader'
import {pixelOperationsAvailability, watchOperations} from '../../operationAvailability'
import {pixelChartUpdate} from '../../pixelChartUpdate'
import {selectedClassificationOfState} from '../../selectedClassification'
import {CCDCGraph} from '../ccdcGraph'
import {loadCCDCObservations$, loadCCDCSegments$, RecipeActions} from '../ccdcRecipe'
import styles from './chartPixel.module.css'

// What the chart runs at its pixel, whatever band it charts: the collection's observations, and the segments CCDC fits to
// them there, both needing the Classification its Sources select trainable (type/ccdc.js). It and its action are held to
// these, and watch them (ccdcToolbar.jsx): a Classification that becomes unusable closes it (pixelChartUpdate).
export const CHART_OPERATIONS = [PIXEL_OBSERVATIONS, PIXEL_SEGMENTS]

const fields = {
    selectedBand: new Form.Field()
}

const mapRecipeToProps = recipe => ({
    recipeId: recipe.id,
    latLng: selectFrom(recipe, 'ui.chartPixel'),
    startDate: moment(selectFrom(recipe, 'model.dates.startDate'), 'YYYY-MM-DD').toDate(),
    endDate: moment(selectFrom(recipe, 'model.dates.endDate'), 'YYYY-MM-DD').toDate(),
    dateFormat: selectFrom(recipe, 'model.ccdcOptions.dateFormat'),
    corrections: selectFrom(recipe, 'model.options.corrections'),
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
        if (!latLng || !getAvailableBands(this.bandSetting()).length)
            return null
        else
            return this.renderPanel()
    }

    renderPanel() {
        const {latLng} = this.props
        const {segments, observations} = this.state
        const loading = (!segments || !segments.length) && (!observations || !observations.length)
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
        const {dateFormat, startDate, endDate, inputs: {selectedBand}} = this.props
        const {segments, observations} = this.state
        const loading = !segments
        if (loading) {
            return this.renderSpinner()
        } else {
            return (
                <CCDCGraph
                    band={selectedBand.value}
                    dateFormat={dateFormat}
                    startDate={startDate}
                    endDate={endDate}
                    segments={segments}
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
        this.updateChart()
    }

    componentDidUpdate(prevProps) {
        this.updateChart(prevProps)
    }

    componentWillUnmount() {
        this.operationWatches.unsubscribe()
        this.cancel$.next(true)
        this.cancel$.complete()
    }

    // The segments and observations are read together, whenever both may be (pixelChartUpdate).
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
        stream('LOAD_CCDC_SEGMENTS',
            loadCCDCSegments$({recipe, latLng, bands: [band]}).pipe(
                takeUntil(this.cancel$)
            ),
            segments => this.setState({segments}),
            error => {
                this.close()
                Notifications.error({
                    message: msg('process.ccdc.chartPixel.loadSegments.error'),
                    error: toUserErrorMessage(error),
                    group: true,
                    timeout: 0
                })
            }
        )
        stream('LOAD_CCDC_OBSERVATIONS',
            loadCCDCObservations$({recipe, latLng, bands: [band]}).pipe(
                takeUntil(this.cancel$)
            ),
            observations => this.setState({observations}),
            error => {
                this.close()
                Notifications.error({
                    message: msg('process.ccdc.chartPixel.loadObservations.error'),
                    error: toUserErrorMessage(error),
                    group: true,
                    timeout: 0
                })
            }
        )
    }

    clearData() {
        this.cancel$.next(true)
        if (this.state.segments !== undefined || this.state.observations !== undefined)
            this.setState({segments: undefined, observations: undefined})
    }

    close() {
        this.clearData()
        this.recipeActions.setChartPixel(null)
    }
}

// What it is computed from, beside whether it may be read (pixelOperationsAvailability), and what is offered of the
// Classification its Sources select, as the session holds it now or as those reads resolved it.
const mapStateToProps = (state, {recipe, sourceRuntime}) => {
    const {gate, computation, recordOf} = pixelOperationsAvailability({
        state, recipe, heldFor: key => sourceRuntime?.heldFor(key), operations: CHART_OPERATIONS
    })
    return {
        operationsGate: gate,
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
