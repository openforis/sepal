import _ from 'lodash'
import moment from 'moment'
import React from 'react'
import {Subject, takeUntil} from 'rxjs'

import {compose} from '~/compose'
import {getAvailableBands} from '~/sources'
import {selectFrom} from '~/stateUtils'
import {msg} from '~/translate'
import {Form} from '~/widget/form'
import {withForm} from '~/widget/form/form'
import {Icon} from '~/widget/icon'
import {Notifications} from '~/widget/notifications'
import {Panel} from '~/widget/panel/panel'

import {withRecipe} from '../../../recipeContext'
import {CCDCGraph} from '../../ccdc/ccdcGraph'
import {loadCCDCObservations$, loadCCDCSegments$, RecipeActions, toDates} from '../changeAlertsRecipe'
import styles from './chartPixel.module.css'

const fields = {
    selectedBand: new Form.Field()
}

const mapRecipeToProps = recipe => ({
    recipeId: recipe.id,
    latLng: selectFrom(recipe, 'ui.chartPixel'),
    dateFormat: selectFrom(recipe, 'model.reference.dateFormat'),
    corrections: selectFrom(recipe, 'model.options.corrections'),
    dataSets: selectFrom(recipe, 'model.sources.dataSets'),
    band: selectFrom(recipe, 'model.sources.band'),
    bands: selectFrom(recipe, 'model.reference.bands'),
    baseBands: selectFrom(recipe, 'model.reference.baseBands'),
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
        const loading = (!segments || !segments.length) && (!observations || !observations.length)
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
                    <form className={styles.form}>
                        {this.renderBandOptions()}
                        {this.renderChart()}
                    </form>
                </Panel.Content>

                <Panel.Buttons>
                    <Panel.Buttons.Main>
                        <Panel.Buttons.Close
                            keybinding='Escape'
                            onClick={() => this.close()}
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
        const {monitoringEnd, monitoringStart, calibrationStart} = toDates(recipe)
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

    componentDidUpdate(prevProps) {
        const {band, stream, recipe, latLng, inputs: {selectedBand}} = this.props

        if (!selectedBand.value)
            selectedBand.set(band)

        if (latLng && selectedBand.value && !_.isEqual(
            [recipe.model, latLng, selectedBand.value],
            [prevProps.recipe.model, prevProps.latLng, prevProps.inputs.selectedBand.value])
        ) {
            this.cancel$.next(true)
            this.setState({segments: undefined})
            stream('LOAD_CCDC_SEGMENTS',
                loadCCDCSegments$({recipe, latLng, bands: [selectedBand.value]}).pipe(
                    takeUntil(this.cancel$)
                ),
                segments => this.setState({segments}),
                error => {
                    this.close()
                    Notifications.error({
                        message: msg('process.ccdc.chartPixel.loadFailed', {error})
                    })
                }
            )
            stream('LOAD_CCDC_OBSERVATIONS',
                loadCCDCObservations$({recipe, latLng, bands: [selectedBand.value]}).pipe(
                    takeUntil(this.cancel$)
                ),
                observations => this.setState({observations}),
                error => {
                    this.close()
                    Notifications.error(msg('process.ccdc.chartPixel.loadObservations.error', {error}))
                }
            )
        }
    }

    bandOptions() {
        const {bands, baseBands, corrections, dataSets} = this.props
        const rmseBands = bands
            .filter(band => band.endsWith('_rmse'))
            .map(band => band.slice(0, -5))
        const ccdcBands = baseBands
            .map(({name}) => name)
            .filter(band => rmseBands.includes(band))
        const observationBands = getAvailableBands({
            dataSets: Object.values(dataSets).flat(),
            corrections
        })
        const intersection = _.intersection(ccdcBands, observationBands)
        return intersection.map(name => ({value: name, label: name}))
    }

    close() {
        this.cancel$.next(true)
        this.setState({segments: undefined, observations: undefined})
        this.recipeActions.setChartPixel(null)
    }
}

export const ChartPixel = compose(
    _ChartPixel,
    withRecipe(mapRecipeToProps),
    withForm({fields})
)

ChartPixel.propTypes = {}
