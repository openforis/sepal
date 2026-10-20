import _ from 'lodash'
import moment from 'moment'
import React from 'react'
import {Subject, takeUntil} from 'rxjs'

import {PIXEL_OBSERVATIONS} from '#sepal/recipe/output/readiness'
import {compose} from '~/compose'
import {connect} from '~/connect'
import {flatBandOptions, getAvailableBands, toDataSetIds} from '~/sources'
import {selectFrom} from '~/stateUtils'
import {msg} from '~/translate'
import {toUserErrorMessage} from '~/userError'
import {Form} from '~/widget/form'
import {withForm} from '~/widget/form/form'
import {Icon} from '~/widget/icon'
import {Notifications} from '~/widget/notifications'
import {Panel} from '~/widget/panel/panel'

import {NoData} from '../../../../../../../widget/noData'
import {withRecipe} from '../../../recipeContext'
import {withSourceRuntime} from '../../../sourceRuntime/sourceRuntimeContext'
import {CCDCGraph} from '../../ccdc/ccdcGraph'
import {ChartPixelPanelHeader} from '../../chartPixelPanelHeader'
import {pixelObservationsAvailability} from '../../operationAvailability'
import {loadObservations$, RecipeActions} from '../timeSeriesRecipe'
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
    corrections: selectFrom(recipe, 'model.opticalPreprocess.corrections'),
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
        const {observations} = this.state
        const loading = !observations
        const noObservations = observations && !observations.features.length
        if (loading) {
            return this.renderSpinner()
        } else if (noObservations) {
            return <NoData message={msg('process.timeSeries.chartPixel.loadObservations.noData')}/>
        } else {
            return (
                <CCDCGraph
                    band={selectedBand.value}
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

    componentDidMount() {
        const {recipeId, sourceRuntime} = this.props
        this.observationsWatch = sourceRuntime?.watchOutput$({recipeId, operation: PIXEL_OBSERVATIONS}).subscribe()
    }

    // Observations are requested only while the recipe's own requirements of them are known to be met
    // (pixelObservationsAvailability): once they are not known to be, what is being read is let go, and read again once
    // they are; a chart they are found not to meet is closed.
    componentDidUpdate(prevProps) {
        const {recipe, latLng, observationsGate, inputs: {selectedBand}} = this.props
        const availableBands = getAvailableBands(this.bandSetting())
        if (!availableBands.includes(selectedBand.value)) {
            selectedBand.set(availableBands.length
                ? availableBands[0]
                : null
            )
        }
        if (latLng && observationsGate?.withdraw) {
            return this.close()
        }
        if (latLng && selectedBand.value && !_.isEqual(
            [recipe.model, latLng, selectedBand.value],
            [prevProps.recipe.model, prevProps.latLng, prevProps.inputs.selectedBand.value])
        ) {
            observationsGate ? this.hold() : this.loadData()
        } else if (latLng && observationsGate && !prevProps.observationsGate) {
            this.hold()
        } else if (this.held && !observationsGate) {
            this.loadData()
        }
    }

    componentWillUnmount() {
        this.observationsWatch?.unsubscribe()
        this.cancel$.next(true)
    }

    hold() {
        this.cancel$.next(true)
        this.held = true
        this.setState({observations: undefined})
    }

    loadData() {
        const {stream, recipe, latLng, inputs: {selectedBand}} = this.props
        this.cancel$.next(true)
        this.held = false
        this.setState({observations: undefined})
        stream('LOAD_OBSERVATIONS',
            loadObservations$({recipe, latLng, bands: [selectedBand.value]}).pipe(
                takeUntil(this.cancel$)
            ),
            observations => this.setState({observations}),
            error => {
                this.close()
                Notifications.error({
                    message: msg('process.timeSeries.chartPixel.loadObservations.error'),
                    error: toUserErrorMessage(error)
                })
            }
        )
    }

    close() {
        this.cancel$.next(true)
        this.held = false
        this.setState({observations: undefined})
        this.recipeActions.setChartPixel(null)
    }
}

const mapStateToProps = (state, {recipe, sourceRuntime}) => ({
    observationsGate: pixelObservationsAvailability({state, recipe, heldFor: key => sourceRuntime?.heldFor(key)}).gate
})

export const ChartPixel = compose(
    _ChartPixel,
    connect(mapStateToProps),
    withSourceRuntime(),
    withRecipe(mapRecipeToProps),
    withForm({fields})
)

ChartPixel.propTypes = {}
