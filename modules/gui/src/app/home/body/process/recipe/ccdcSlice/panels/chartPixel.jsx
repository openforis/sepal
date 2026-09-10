import _ from 'lodash'
import moment from 'moment'
import React from 'react'
import {Subject, takeUntil} from 'rxjs'

import {compose} from '~/compose'
import {selectFrom} from '~/stateUtils'
import {msg} from '~/translate'
import {toUserErrorMessage} from '~/userError'
import {Form} from '~/widget/form'
import {withForm} from '~/widget/form/form'
import {Icon} from '~/widget/icon'
import {Notifications} from '~/widget/notifications'
import {Panel} from '~/widget/panel/panel'

import {withRecipe} from '../../../recipeContext'
import {CCDCGraph} from '../../ccdc/ccdcGraph'
import {resolveChartBand} from '../../chartBandSelection'
import {ChartPixelPanelHeader} from '../../chartPixelPanelHeader'
import {loadCCDCSegments$, RecipeActions} from '../ccdcSliceRecipe'
import {baseBandsOf, dateFormatOf} from '../sliceEvidence'
import styles from './chartPixel.module.css'

const fields = {
    selectedBand: new Form.Field()
}

const mapRecipeToProps = recipe => ({
    recipeId: recipe.id,
    latLng: selectFrom(recipe, 'ui.chartPixel'),
    dateFormat: dateFormatOf(recipe),
    baseBands: baseBandsOf(recipe),
    // Which observation of the source the chart's segments belong to. A later one means the pixels may
    // have moved, which no comparison of what the source DESCRIBES would show.
    observation: selectFrom(recipe, 'ui.sourceEvidence.observation'),
    dateType: selectFrom(recipe, 'model.date.dateType'),
    date: selectFrom(recipe, 'model.date.date'),
    startDate: selectFrom(recipe, 'model.date.startDate'),
    endDate: selectFrom(recipe, 'model.date.endDate'),
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
        this.close = this.close.bind(this)
    }

    render() {
        const {latLng, baseBands} = this.props
        if (!latLng || !baseBands.length)
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
        const {baseBands, inputs: {selectedBand}} = this.props
        const options = baseBands.map(({name}) => ({value: name, label: name}))
        return (
            <Form.Combo
                className={styles.bandSelection}
                input={selectedBand}
                options={options}/>
        )
    }

    renderChart() {
        const {
            dateType, date, startDate, endDate, harmonics, gapStrategy, extrapolateSegment, extrapolateMaxDays, dateFormat, inputs: {selectedBand}
        } = this.props
        const {segments} = this.state
        const [highlightStart, highlightEnd] = dateType === 'RANGE'
            ? [startDate, endDate]
            : [date, date]
        const loading = !segments
        if (loading)
            return this.renderSpinner()
        else {
            return (
                <CCDCGraph
                    band={selectedBand.value}
                    dateFormat={dateFormat}
                    segments={segments}
                    highlights={[{
                        startDate: moment(highlightStart, 'YYYY-MM-DD').subtract(0.5, 'days').toDate(),
                        endDate: moment(highlightEnd, 'YYYY-MM-DD').add(0.5, 'days').toDate(),
                        backgroundColor: '#FF000010',
                        color: '#FF0000'

                    }]}
                    highlightGaps
                    gapStrategy={gapStrategy}
                    extrapolateMaxDays={extrapolateMaxDays}
                    extrapolateSegment={extrapolateSegment}
                    harmonics={harmonics}
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
        const {baseBands, observation, stream, recipe, latLng, inputs: {selectedBand}} = this.props
        const band = resolveChartBand(selectedBand.value, baseBands.map(({name}) => name))

        if (!latLng || !band || band !== selectedBand.value) {
            this.clearData()
            if (band !== selectedBand.value)
                selectedBand.set(band)
            // Form props still contain the old selection until the next update.
            return
        }

        // Reloaded when what is asked changes AND when the source has been read again: runtime evidence can
        // move without the model moving, and a chart drawn before that goes on plotting the pixels and the
        // date representation the source no longer has.
        if (!prevProps || !_.isEqual(
            [recipe.model, observation, latLng, band],
            [prevProps.recipe.model, prevProps.observation, prevProps.latLng, prevProps.inputs.selectedBand.value])
        ) {
            this.clearData()
            stream('LOAD_CCDC_SEGMENTS',
                loadCCDCSegments$({recipe, latLng, bands: [band]}).pipe(
                    takeUntil(this.cancel$)
                ),
                segments => this.setState({segments}),
                error => {
                    this.close()
                    Notifications.error({
                        message: msg('process.ccdc.chartPixel.loadFailed'),
                        error: toUserErrorMessage(error)
                    })
                }
            )
        }
    }

    clearData() {
        this.cancel$.next(true)
        if (this.state.segments !== undefined)
            this.setState({segments: undefined})
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
