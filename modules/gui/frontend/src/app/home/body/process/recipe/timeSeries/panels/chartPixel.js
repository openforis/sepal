import {CCDCGraph} from '../../ccdc/ccdcGraph'
import {Form, form} from 'widget/form/form'
import {Panel} from 'widget/panel/panel'
import {RecipeActions, loadCCDCObservations$} from '../../ccdc/ccdcRecipe'
import {Subject} from 'rxjs'
import {compose} from 'compose'
import {filterBands, opticalBandOptions, radarBandOptions} from '../bandOptions'
import {msg} from 'translate'
import {selectFrom} from 'stateUtils'
import {takeUntil} from 'rxjs/operators'
import {withRecipe} from '../../../recipeContext'
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
    startDate: moment(selectFrom(recipe, 'model.dates.startDate'), 'YYYY-MM-DD').toDate(),
    endDate: moment(selectFrom(recipe, 'model.dates.endDate'), 'YYYY-MM-DD').toDate(),
    classificationLegend: selectFrom(recipe, 'ui.classificationLegend'),
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
        const {observations} = this.state
        const loading = !observations
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
        const {inputs: {selectedBand}} = this.props
        const options = this.getBandOptions()
        return (
            <Form.Buttons
                className={styles.buttons}
                layout='horizontal-nowrap-scroll'
                input={selectedBand}
                multiple={false}
                options={options}/>
        )
    }

    getBandOptions() {
        const {recipe: {model: {sources: {dataSets}}}, classificationLegend} = this.props
        return [
            ...(_.isEmpty(dataSets['SENTINEL_1'])
                ? opticalBandOptions({dataSets}).map(o => o.options).flat()
                : radarBandOptions({})),
            ...(classificationLegend
                ? [{
                    value: 'regression',
                    label: (msg('process.ccdc.panel.sources.form.breakpointBands.regression')),
                    scale: 1000
                }]
                : []),
            ...classificationLegend
                ? classificationLegend.entries.map(({value, label}) => ({
                    value: `probability_${value}`,
                    label: msg('process.ccdc.panel.sources.form.breakpointBands.probability', {label}),
                    scale: 100
                }))
                : []
        ]
    }

    renderChart() {
        const {dateFormat, startDate, endDate, inputs: {selectedBand}} = this.props
        const {observations} = this.state
        const loading = !observations
        if (loading) {
            return this.renderSpinner()
        } else {
            const scale = this.getBandOptions().find(({value}) => value === selectedBand.value)
                .scale
            return (
                <CCDCGraph
                    band={selectedBand.value}
                    scale={scale}
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

    componentDidUpdate(prevProps) {
        const {classificationLegend, stream, recipe, latLng, inputs: {selectedBand}} = this.props
        const {model: {sources: {dataSets}}} = recipe
        const options = this.getBandOptions()
        const filteredBands = classificationLegend && (
            selectedBand.value === 'regression' || classificationLegend.entries
                .find(({value}) => `probability_${value}` === selectedBand.value))
            ? [selectedBand.value]
            : selectedBand.value ? filterBands([selectedBand.value], dataSets) : []
        selectedBand.set(
            filteredBands.length
                ? filteredBands[0]
                : options[0].value
        )
        if (latLng && selectedBand.value && !_.isEqual(
            [recipe.model, latLng, selectedBand.value],
            [prevProps.recipe.model, prevProps.latLng, prevProps.inputs.selectedBand.value])
        ) {
            this.cancel$.next(true)
            this.setState({observations: undefined})
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
        this.setState({observations: undefined})
        this.recipeActions.setChartPixel(null)
    }
}

ChartPixel.propTypes = {}

export default compose(
    ChartPixel,
    withRecipe(mapRecipeToProps),
    form({fields})
)
