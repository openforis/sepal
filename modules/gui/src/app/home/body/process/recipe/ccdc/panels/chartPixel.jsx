import _ from 'lodash'
import moment from 'moment'
import React from 'react'
import {Subject, takeUntil} from 'rxjs'

import {compose} from '~/compose'
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
import {resolveChartBand} from '../../chartBandSelection'
import {ChartPixelPanelHeader} from '../../chartPixelPanelHeader'
import {CCDCGraph} from '../ccdcGraph'
import {loadCCDCObservations$, loadCCDCSegments$, RecipeActions} from '../ccdcRecipe'
import styles from './chartPixel.module.css'

const fields = {
    selectedBand: new Form.Field()
}

const mapRecipeToProps = recipe => ({
    recipeId: recipe.id,
    latLng: selectFrom(recipe, 'ui.chartPixel'),
    startDate: moment(selectFrom(recipe, 'model.dates.startDate'), 'YYYY-MM-DD').toDate(),
    endDate: moment(selectFrom(recipe, 'model.dates.endDate'), 'YYYY-MM-DD').toDate(),
    dateFormat: selectFrom(recipe, 'model.ccdcOptions.dateFormat'),
    classificationLegend: selectFrom(recipe, 'ui.classification.classificationLegend'),
    classifierType: selectFrom(recipe, 'ui.classification.classifierType'),
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
        const {classificationLegend, classifierType, corrections, dataSets} = this.props
        return {
            dataSets: toDataSetIds(dataSets),
            corrections,
            classification: {classificationLegend, classifierType, include: ['regression', 'probabilities']}
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
        this.updateChart()
    }

    componentDidUpdate(prevProps) {
        this.updateChart(prevProps)
    }

    componentWillUnmount() {
        this.cancel$.next(true)
        this.cancel$.complete()
    }

    updateChart(prevProps) {
        const {recipe, latLng, inputs: {selectedBand}} = this.props
        const availableBands = getAvailableBands(this.bandSetting())
        const band = resolveChartBand(selectedBand.value, availableBands)
        if (!latLng || !band || band !== selectedBand.value) {
            this.clearData()
            if (band !== selectedBand.value)
                selectedBand.set(band)
            // Form props still contain the old selection until the next update.
            return
        }
        if (!prevProps || !_.isEqual(
            [recipe.model, latLng, band],
            [prevProps.recipe.model, prevProps.latLng, prevProps.inputs.selectedBand.value])
        ) {
            this.loadData(band)
        }
    }

    loadData(band) {
        const {stream, recipe, latLng} = this.props
        this.clearData()
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

export const ChartPixel = compose(
    _ChartPixel,
    withRecipe(mapRecipeToProps),
    withForm({fields})
)

ChartPixel.propTypes = {}
