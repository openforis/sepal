import {CCDCGraph} from '../../ccdc/ccdcGraph'
import {Form} from '~/widget/form'
import {Icon} from '~/widget/icon'
import {Notifications} from '~/widget/notifications'
import {Panel} from '~/widget/panel/panel'
import {RecipeActions, loadCCDCSegments$} from '../ccdcSliceRecipe'
import {Subject, takeUntil} from 'rxjs'
import {compose} from '~/compose'
import {msg} from '~/translate'
import {selectFrom} from '~/stateUtils'
import {withForm} from '~/widget/form/form'
import {withRecipe} from '../../../recipeContext'
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
    dateFormat: selectFrom(recipe, 'model.source.dateFormat'),
    baseBands: selectFrom(recipe, 'model.source.baseBands'),
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
        const {recipe: {model: {source: {baseBands}}}, inputs: {selectedBand}} = this.props
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

    componentDidUpdate(prevProps) {
        const {baseBands, stream, recipe, latLng, inputs: {selectedBand}} = this.props

        if (!selectedBand.value)
            selectedBand.set(baseBands[0].name)

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
        }
    }

    close() {
        this.cancel$.next(true)
        this.setState({segments: undefined})
        this.recipeActions.setChartPixel(null)
    }
}

export const ChartPixel = compose(
    _ChartPixel,
    withRecipe(mapRecipeToProps),
    withForm({fields})
)

ChartPixel.propTypes = {}
