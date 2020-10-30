import './chart.css'
import {Form, form} from 'widget/form/form'
import {Panel} from 'widget/panel/panel'
import {RecipeActions, loadCCDCTimeSeries$} from '../ccdcRecipe'
import {Subject} from 'rxjs'
import {compose} from 'compose'
import {evaluateSegments} from '../segments'
import {filterBands, opticalBandOptions, radarBandOptions} from '../bandOptions'
import {msg} from '../../../../../../../translate'
import {selectFrom} from 'stateUtils'
import {takeUntil, tap} from 'rxjs/operators'
import {withRecipe} from '../../../recipeContext'
import Chartist from 'chartist'
import ChartistGraph from 'react-chartist'
import Icon from '../../../../../../../widget/icon'
import Keybinding from 'widget/keybinding'
import Notifications from '../../../../../../../widget/notifications'
import React from 'react'
import _ from 'lodash'
import moment from 'moment'
import styles from './chartPixel.module.css'

const fields = {
    bands: new Form.Field()
}

const mapRecipeToProps = recipe => ({
    recipeId: recipe.id,
    latLng: selectFrom(recipe, 'ui.chartPixel'),
    recipe
})

class ChartPixel extends React.Component {
    constructor(props) {
        super(props)
        this.cancel$ = new Subject()
        this.state = {}
        this.recipeActions = RecipeActions(props.recipeId)
    }

    render() {
        const {latLng} = this.props
        if (!latLng)
            return null
        else
            return this.renderPanel()
    }

    renderPanel() {
        const {latLng} = this.props
        const {timeSeries} = this.state
        const loading = !timeSeries
        return (
            <Panel
                className={styles.panel}
                type='center'>
                <Panel.Header
                    icon='chart-area'
                    title={`${latLng.lat}, ${latLng.lng}`}/>

                <Panel.Content className={loading ? styles.loading : null}
                    scrollable={false}
                    noVerticalPadding>
                    <Form className={styles.form}>
                        {this.renderChart()}
                        {this.renderBandOptions()}
                    </Form>
                </Panel.Content>

                <Panel.Buttons>
                    <Panel.Buttons.Main>
                        <Keybinding keymap={{'Escape': () => this.close()}}>
                            <Panel.Buttons.Close onClick={() => this.close()}/>
                        </Keybinding>
                    </Panel.Buttons.Main>
                </Panel.Buttons>
            </Panel>
        )
    }

    renderSpinner() {
        return (
            <div className={styles.spinner}>
                <Icon name={'spinner'} size={'2x'}/>
            </div>
        )
    }

    renderBandOptions() {
        const {recipe: {model: {sources: {dataSets}}}, inputs: {bands}} = this.props

        const options = (_.isEmpty(dataSets['SENTINEL_1'])
            ? opticalBandOptions({dataSets}).map(o => o.options).flat()
            : radarBandOptions({}))
        return (
            <Form.Buttons
                className={styles.buttons}
                layout='horizontal-nowrap-scroll'
                input={bands}
                multiple={false}
                options={options}/>
        )

    }

    renderChart() {
        const {segments = [], timeSeries} = this.state
        const loading = !timeSeries
        if (loading)
            return this.renderSpinner()

        const segmentsData = segments.map((segment, i) => ({
            name: `segment-${i + 1}`,
            data: segment.map(({date, value}) => ({x: date, y: value}))
        }))

        const timeSeriesData = {
            name: 'time-series',
            data: timeSeries.map(({date, value}) => ({x: new Date(date), y: value / 10000}))
        }

        const data = {
            series: [
                ...segmentsData,
                timeSeriesData
            ]
        }

        const options = {
            axisX: {
                // type: Chartist.FixedScaleAxis,
                // divisor: 5,

                type: Chartist.AutoScaleAxis,
                scaleMinSpace: 60,

                labelInterpolationFnc: function (value) {
                    return moment(value).format('YYYY-MM-DD')
                }
            },
            series: segments.reduce(
                (series, _, i) => {
                    series[`segment-${i + 1}`] = {showPoint: false}
                    return series
                },
                {'time-series': {showLine: false}}
            )
        }

        return (
            <div className={styles.chart}>
                <ChartistGraph
                    data={data}
                    options={options}
                    type={'Line'}
                    className={styles.chart}/>
            </div>
        )
    }

    componentDidUpdate(prevProps, prevState, snapshot) {
        const {recipe, latLng, inputs: {bands}} = this.props
        const {model: {sources: {dataSets}}} = recipe
        const filteredBands = filterBands([bands.value], dataSets)
        bands.set(
            filteredBands.length
                ? filteredBands[0]
                : recipe.model.sources.breakpointBands[0]
        )
        if (latLng && bands.value && !_.isEqual(
            [recipe.model, latLng, bands.value],
            [prevProps.recipe.model, prevProps.latLng, prevProps.inputs.bands.value])
        ) {
            this.cancel$.next(true)
            this.setState({segments: undefined, timeSeries: undefined})
            const load$ = loadCCDCTimeSeries$({recipe, latLng, bands: [bands.value]}).pipe(
                tap(({segments, timeSeries}) => {
                    this.setState({
                        segments: evaluateSegments({
                            segments,
                            band: bands.value,
                            dateFormat: recipe.model.ccdcOptions.dateFormat
                        }),
                        timeSeries
                    })
                }),
                takeUntil(this.cancel$)
            )
            const onSuccess = () => null
            const onError = error => {
                this.close()
                Notifications.error({
                    message: msg('process.ccdc.chartPixel.loadFailed', {error})
                })
            }
            this.props.stream('LOAD_CHART', load$, onSuccess, onError)
        }
    }

    close() {
        this.cancel$.next(true)
        this.setState({segments: undefined, timeSeries: undefined})
        this.recipeActions.setChartPixel(null)
    }
}

ChartPixel.propTypes = {}

export default compose(
    ChartPixel,
    withRecipe(mapRecipeToProps),
    form({fields})
)
