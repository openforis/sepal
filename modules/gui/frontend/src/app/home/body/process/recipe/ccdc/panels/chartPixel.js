import './chart.css'
import {Form, form} from 'widget/form/form'
import {Panel} from 'widget/panel/panel'
import {loadCCDCObservations$, loadCCDCSegments$, RecipeActions} from '../ccdcRecipe'
import {Subject, of} from 'rxjs'
import {takeUntil, delay} from 'rxjs/operators'
import {compose} from 'compose'
import {filterBands, opticalBandOptions, radarBandOptions} from '../bandOptions'
import {selectFrom} from 'stateUtils'
import {withRecipe} from '../../../recipeContext'
import Icon from 'widget/icon'
import Keybinding from 'widget/keybinding'
import React from 'react'
import _ from 'lodash'
import styles from './chartPixel.module.css'
import {CCDCGraph} from '../ccdcGraph'
import moment from 'moment'
import Notifications from 'widget/notifications'
import {msg} from 'translate'

const fields = {
    selectedBand: new Form.Field()
}

const mapRecipeToProps = recipe => ({
    recipeId: recipe.id,
    latLng: selectFrom(recipe, 'ui.chartPixel'),
    startDate: moment(selectFrom(recipe, 'model.dates.startDate'), 'YYYY-MM-DD').toDate(),
    endDate: moment(selectFrom(recipe, 'model.dates.endDate'), 'YYYY-MM-DD').toDate(),
    dateFormat: selectFrom(recipe, 'model.ccdcOptions.dateFormat'),
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
        const {segments, observations} = this.state
        const loading = !segments && !observations
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
        const {recipe: {model: {sources: {dataSets}}}, inputs: {selectedBand}} = this.props
        const options = (_.isEmpty(dataSets['SENTINEL_1'])
            ? opticalBandOptions({dataSets}).map(o => o.options).flat()
            : radarBandOptions({}))
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
        const {dateFormat, startDate, endDate, inputs: {selectedBand}} = this.props
        const {segments, observations} = this.state
        const loading = !segments
        if (loading)
            return this.renderSpinner()
        else
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

    componentDidUpdate(prevProps, prevState, snapshot) {
        const {stream, recipe, latLng, inputs: {selectedBand}} = this.props
        const {model: {sources: {dataSets}}} = recipe
        const filteredBands = filterBands([selectedBand.value], dataSets)
        selectedBand.set(
            filteredBands.length
                ? filteredBands[0]
                : recipe.model.sources.breakpointBands[0]
        )
        if (latLng && selectedBand.value && !_.isEqual(
            [recipe.model, latLng, selectedBand.value],
            [prevProps.recipe.model, prevProps.latLng, prevProps.inputs.selectedBand.value])
        ) {
            this.cancel$.next(true)
            this.setState({segments: undefined, observations: undefined})
            stream('LOAD_CCDC_SEGMENTS',
                loadCCDCSegments$({recipe, latLng, bands: [selectedBand.value]}).pipe(
                    takeUntil(this.cancel$)
                ),
                segments => this.setState({segments}),
                error => {
                    this.close()
                    Notifications.error(msg('process.ccdc.mapToolbar.chartPixel.loadSegments.error', {error}))
                }
            )
            stream('LOAD_CCDC_OBSERVATIONS',
                loadCCDCObservations$({recipe, latLng, bands: [selectedBand.value]}).pipe(
                    takeUntil(this.cancel$)
                ),
                observations => this.setState({observations}),
                error => {
                    this.close()
                    Notifications.error(msg('process.ccdc.mapToolbar.chartPixel.loadObservations.error', {error}))
                }
            )
        }
    }

    close() {
        this.cancel$.next(true)
        this.setState({segments: undefined, observations: undefined})
        this.recipeActions.setChartPixel(null)
    }
}

ChartPixel.propTypes = {}

export default compose(
    ChartPixel,
    withRecipe(mapRecipeToProps),
    form({fields})
)
