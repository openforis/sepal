import React from 'react'
import {loadCCDCTimeSeries$, RecipeActions} from '../ccdcRecipe'
import styles from './chartPixel.module.css'
import {Subject} from 'rxjs'
import {finalize, takeUntil, tap} from 'rxjs/operators'
import {Panel} from 'widget/panel/panel'
import {compose} from 'compose'
import {withRecipe} from '../../recipeContext'
import {selectFrom} from 'stateUtils'
import Keybinding from 'widget/keybinding'
import _ from 'lodash'
import ChartistGraph from 'react-chartist'
import Chartist from 'chartist'
import './chart.css'
import moment from 'moment'
import {fitSegments} from '../segments'
import {opticalBandOptions, radarBandOptions} from '../bandOptions'
import {form, Form} from 'widget/form/form'

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
        console.log('Constructor')
        this.cancel$ = new Subject()
        this.state = {
            chart: null,
            segments: null,
            timeSeries: null
        }
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
        const {latLng, stream} = this.props
        const loading = !stream('LOAD_CHART').completed
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
                    <Form>
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
        return <div>Spinner</div>
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
        const {stream} = this.props
        const loading = !stream('LOAD_CHART').completed
        if (loading)
            return this.renderSpinner()

        const {segments, timeSeries} = this.state
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
                    return moment(value).format('YYYY-MM-DD');
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
        if (!bands.value) {
            bands.set(recipe.model.sources.breakpointBands[0])
        }
        if (latLng && bands.value && !_.isEqual(
            [recipe.model, latLng, bands.value],
            [prevProps.recipe.model, prevProps.latLng, prevProps.inputs.bands.value])
        ) {
            console.log('Trying to cancel')
            this.cancel$.next(true)
            this.props.stream('LOAD_CHART',
                loadCCDCTimeSeries$({recipe, latLng, bands: [bands.value]}).pipe(
                    tap(({segments, timeSeries}) => {
                        this.setState({
                            segments: fitSegments({
                                segments,
                                band: bands.value,
                                dateFormat: 0
                            }),
                            timeSeries
                        })
                    }),
                    takeUntil(this.cancel$),
                    finalize(() => console.log('Finalized'))
                )
            )
        }
    }

    close() {
        this.recipeActions.setChartPixel(null)
    }
}

ChartPixel.propTypes = {}

export default compose(
    ChartPixel,
    withRecipe(mapRecipeToProps),
    form({fields})
)
