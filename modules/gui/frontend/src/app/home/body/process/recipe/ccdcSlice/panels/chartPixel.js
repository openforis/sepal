import '../../ccdc/panels/chart.css'
import {Form, form} from 'widget/form/form'
import {Panel} from 'widget/panel/panel'
import {RecipeActions, loadCCDCSegments$} from '../ccdcSliceRecipe'
import {Subject} from 'rxjs'
import {compose} from 'compose'
import {evaluateSegments} from '../../ccdc/segments'
import {msg} from 'translate'
import {selectFrom} from 'stateUtils'
import {takeUntil, tap} from 'rxjs/operators'
import {withRecipe} from '../../../recipeContext'
import Chartist from 'chartist'
import ChartistGraph from 'react-chartist'
import Icon from 'widget/icon'
import Keybinding from 'widget/keybinding'
import Notifications from 'widget/notifications'
import React from 'react'
import _ from 'lodash'
import moment from 'moment'
import styles from './chartPixel.module.css'

const fields = {
    selectedBand: new Form.Field()
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
        const {segments} = this.state
        const loading = !segments || !segments.length
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
        const {recipe: {model: {source: {bands: sourceBands}}}, inputs: {selectedBand}} = this.props
        const options = sourceBands.map(band => ({value: band, label: band.toUpperCase()}))
        return (
            <Form.Buttons
                className={styles.buttons}
                layout='horizontal-nowrap-scroll'
                input={selectedBand}
                multiple={false}
                options={options}/>
        )

    }

    renderChart() {
        const {segments = []} = this.state
        const loading = !segments || !segments.length
        if (loading)
            return this.renderSpinner()

        const data = {
            series: segments.map((segment, i) => ({
                name: `segment-${i + 1}`,
                data: segment.map(({date, value}) => ({x: date, y: value}))
            }))
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
                {}
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
        const {recipe, latLng, inputs: {selectedBand}} = this.props

        if (!selectedBand.value)
            selectedBand.set(recipe.model.source.bands[0])

        if (latLng && selectedBand.value && !_.isEqual(
            [recipe.model, latLng, selectedBand.value],
            [prevProps.recipe.model, prevProps.latLng, prevProps.inputs.selectedBand.value])
        ) {
            this.cancel$.next(true)
            this.setState({segments: undefined})
            const load$ = loadCCDCSegments$({recipe, latLng}).pipe(
                tap(segments => {
                    this.setState({
                        segments: evaluateSegments({
                            segments,
                            band: selectedBand.value,
                            dateFormat: recipe.model.source.dateFormat || 0,
                            harmonics: recipe.model.options.harmonics
                        })
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
        this.setState({segments: undefined})
        this.recipeActions.setChartPixel(null)
    }
}

ChartPixel.propTypes = {}

export default compose(
    ChartPixel,
    withRecipe(mapRecipeToProps),
    form({fields})
)
