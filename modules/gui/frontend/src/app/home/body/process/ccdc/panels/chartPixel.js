import React from 'react'
import {RecipeActions} from '../ccdcRecipe'
import styles from './chartPixel.module.css'
import {of} from 'rxjs'
import {tap} from 'rxjs/operators'
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
import {createSegments} from '../segments'
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
        this.stat = {chart: null}
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
                    {this.renderContent()}
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

    renderContent() {
        const {stream} = this.props
        const loading = !stream('LOAD_CHART').completed

        if (loading)
            return this.renderSpinner()
        else {
            return (
                <Form>
                    {this.renderBandOptions()}
                    {this.renderChart()}
                </Form>
            )

        }
    }

    renderSpinner() {
        return <div>Spinner</div>
    }

    renderBandOptions() {
        const {recipe: {model: {sources: {dataSets, breakpointBands}}}, inputs: {bands}} = this.props

        const options = (_.isEmpty(dataSets['SENTINEL_1'])
            ? opticalBandOptions({dataSets})
            : radarBandOptions({}))
        return <Form.Buttons
            input={bands}
            multiple={false}
            options={options}/>

        // const options = breakpointBands.map(band =>)

    }

    renderChart() {
        const {segments} = this.state
        const segmentsData = segments.map((segment, i) => ({
            name: `segment-${i + 1}`,
            data: segment.map(({date, value}) => ({x: date, y: value}))
        }))

        // Make sure the actual pixels are loaded (and correctly reloaded)
        const actualData = {
            name: 'actual',
            data: [
                {x: new Date(143134652600), y: 43},
                {x: new Date(143234652600), y: 55},
                {x: new Date(143334652600), y: 10},
                {x: new Date(143384652600), y: 50},
                {x: new Date(143568652600), y: 43}
            ]
        }

        const data = {
            series: [
                ...segmentsData
                // actualData
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
                {'actual': {showLine: false}}
            )
        }

        return (
            <ChartistGraph
                data={data}
                options={options}
                type={'Line'}
                className={styles.chart}/>
        )
    }


    componentDidUpdate(prevProps, prevState, snapshot) {
        const {recipe, latLng, inputs: {bands}} = this.props
        if (latLng && !_.isEqual([recipe.model, latLng], [prevProps.recipe.model, prevProps.latLng])) {
            this.props.stream('LOAD_CHART',
                of({
                        "changeProb": [1, 1, 1, 0],
                        "ndfi_coefs": [
                            [-423655.8619800456, 0.5858665580394526, 10332.750747958018, 2613.1381810644016, 7705.33359401824, -4426.110106380094, 0, 0],
                            [2769089.4477641885, -3.7528984890660895, 477.09001655431854, 3648.3629272330736, 0, 0, 0, 0],
                            [519167.8945302955, -0.6986070630422198, 2434.0647525946997, 2566.5362749992005, 0, 0, 0, 0],
                            [2094971.7265259172, -2.8331107031749934, 3201.9643446759865, 6319.33968526346, 0, 0, 0, 0]
                        ],
                        "ndfi_magnitude": [3231.0983869271204, -3868.7420629272483, 4564.903002661727, 0],
                        "ndfi_rmse": [1872.223370052816, 2260.9884167018304, 2628.8220836192913, 2557.2990028619397],
                        "numObs": [21, 14, 15, 17],
                        "tBreak": [736291, 736899, 737555, 0],
                        "tEnd": [736259, 736883, 737443, 738019],
                        "tStart": [735395, 736291, 736899, 737555]
                    }
                ).pipe(
                    // loadCCDCTimeSeries$({recipe, latLng}).pipe(
                    // TODO: Don't hardcode band
                    // TODO: Store whole timeSeries, and create segments for a band based on Buttons
                    tap(timeSeries => this.setState({
                        segments: createSegments({
                            timeSeries,
                            band: bands.value || 'ndfi',
                            dateFormat: 0
                        })
                    }))
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
