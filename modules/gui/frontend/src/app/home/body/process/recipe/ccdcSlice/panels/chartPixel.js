import '../../ccdc/panels/chart.css'
import {Form, form} from 'widget/form/form'
import {Panel} from 'widget/panel/panel'
import {loadCCDCSegments$, RecipeActions} from '../ccdcSliceRecipe'
import {Subject} from 'rxjs'
import {compose} from 'compose'
import {msg} from 'translate'
import {selectFrom} from 'stateUtils'
import {takeUntil} from 'rxjs/operators'
import {withRecipe} from '../../../recipeContext'
import Icon from 'widget/icon'
import Keybinding from 'widget/keybinding'
import Notifications from 'widget/notifications'
import React from 'react'
import _ from 'lodash'
import styles from './chartPixel.module.css'
import {CCDCGraph} from '../../ccdc/ccdcGraph'
import moment from 'moment'

const fields = {
    selectedBand: new Form.Field()
}

const mapRecipeToProps = recipe => ({
    recipeId: recipe.id,
    latLng: selectFrom(recipe, 'ui.chartPixel'),
    dateFormat: selectFrom(recipe, 'model.source.dateFormat'),
    date: selectFrom(recipe, 'model.date.date'),
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
        const {date, dateFormat, inputs: {selectedBand}} = this.props
        const {segments} = this.state
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
                        startDate: moment(date, 'YYYY-MM-DD').subtract(0.5, 'days').toDate(),
                        endDate: moment(date, 'YYYY-MM-DD').add(0.5, 'days').toDate(),
                        color: '#FF0000'
                    }]}
                    highlightGaps
                />
            )
        }
    }

    componentDidUpdate(prevProps, prevState, snapshot) {
        const {stream, recipe, latLng, inputs: {selectedBand}} = this.props

        if (!selectedBand.value)
            selectedBand.set(recipe.model.source.bands[0])

        if (latLng && selectedBand.value && !_.isEqual(
            [recipe.model, latLng, selectedBand.value],
            [prevProps.recipe.model, prevProps.latLng, prevProps.inputs.selectedBand.value])
        ) {
            this.cancel$.next(true)
            this.setState({segments: undefined})
            stream('LOAD_CCDC_SEGMENTS',
                // of({"changeProb":[1,0],"ndwi_coefs":[[-439223.70821076905,215.1876193089946,-727.3541532507837,594.7438108806724,-254.00319350911434,-136.8030553791102,74.63840046922108,54.40544556317409],[-393456.56899727084,191.7092607629123,-431.3701345238819,573.4262362206015,-151.68302134139591,-233.6967490670943,-7.038562898709706,-110.03688339229556]],"ndwi_magnitude":[-1698.4496494625705,0],"ndwi_rmse":[553.0643088514388,912.1285119549182],"numObs":[24,30],"tBreak":[2016.2974832740765,0],"tEnd":[2016.2536778322813,2020.678045727812],"tStart":[2013.8443731335717,2016.2974832740765]}).pipe(
                //     delay(100),
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

ChartPixel.propTypes = {}

export default compose(
    ChartPixel,
    withRecipe(mapRecipeToProps),
    form({fields})
)
