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
                of({"changeProb":[1,0],"ndvi_coefs":[[-439223.70821076905,215.1876193089946,-727.3541532507837,594.7438108806724,-254.00319350911434,-136.8030553791102,74.63840046922108,54.40544556317409],[-393456.56899727084,191.7092607629123,-431.3701345238819,573.4262362206015,-151.68302134139591,-233.6967490670943,-7.038562898709706,-110.03688339229556]],"ndvi_magnitude":[-1698.4496494625705,0],"ndvi_rmse":[553.0643088514388,912.1285119549182],"numObs":[24,30],"tBreak":[2016.2974832740765,0],"tEnd":[2016.2536778322813,2020.678045727812],"tStart":[2013.8443731335717,2016.2974832740765]}).pipe(
                    delay(100),
                // loadCCDCSegments$({recipe, latLng, bands: [selectedBand.value]}).pipe(
                    takeUntil(this.cancel$)
                ),
                segments => this.setState({segments}),
                error => {
                    this.close()
                    Notifications.error(msg('process.ccdc.mapToolbar.chartPixel.loadSegments.error', {error}))
                }
            )
            stream('LOAD_CCDC_OBSERVATIONS',
                of({"type":"FeatureCollection","columns":{},"features":[{"type":"Feature","geometry":null,"id":"1_2_LC08_130052_20130902","properties":{"date":{"type":"Date","value":1378093607350},"value":-7060}},{"type":"Feature","geometry":null,"id":"1_2_LC08_130052_20131020","properties":{"date":{"type":"Date","value":1382240794160},"value":-5285}},{"type":"Feature","geometry":null,"id":"1_2_LC08_130052_20131105","properties":{"date":{"type":"Date","value":1383623189600},"value":-7222}},{"type":"Feature","geometry":null,"id":"1_2_LC08_130052_20131223","properties":{"date":{"type":"Date","value":1387770372100},"value":-6811}},{"type":"Feature","geometry":null,"id":"1_2_LC08_130052_20140124","properties":{"date":{"type":"Date","value":1390535152580},"value":-6485}},{"type":"Feature","geometry":null,"id":"1_2_LC08_130052_20140209","properties":{"date":{"type":"Date","value":1391917541100},"value":-5903}},{"type":"Feature","geometry":null,"id":"1_2_LC08_130052_20140225","properties":{"date":{"type":"Date","value":1393299928190},"value":-6309}},{"type":"Feature","geometry":null,"id":"1_2_LC08_130052_20140313","properties":{"date":{"type":"Date","value":1394682316680},"value":-6042}},{"type":"Feature","geometry":null,"id":"1_2_LC08_130052_20140329","properties":{"date":{"type":"Date","value":1396064698920},"value":-5672}},{"type":"Feature","geometry":null,"id":"1_2_LC08_130052_20141210","properties":{"date":{"type":"Date","value":1418183090750},"value":-6073}},{"type":"Feature","geometry":null,"id":"1_2_LC08_130052_20141226","properties":{"date":{"type":"Date","value":1419565490340},"value":-6505}},{"type":"Feature","geometry":null,"id":"1_2_LC08_130052_20150127","properties":{"date":{"type":"Date","value":1422330282020},"value":-5946}},{"type":"Feature","geometry":null,"id":"1_2_LC08_130052_20150212","properties":{"date":{"type":"Date","value":1423712674820},"value":-5780}},{"type":"Feature","geometry":null,"id":"1_2_LC08_130052_20150417","properties":{"date":{"type":"Date","value":1429242247850},"value":-5515}},{"type":"Feature","geometry":null,"id":"1_2_LC08_130052_20150604","properties":{"date":{"type":"Date","value":1433389434620},"value":-4931}},{"type":"Feature","geometry":null,"id":"1_2_LC08_130052_20150722","properties":{"date":{"type":"Date","value":1437536660060},"value":-5365}},{"type":"Feature","geometry":null,"id":"1_2_LC08_130052_20151026","properties":{"date":{"type":"Date","value":1445831090230},"value":-5629}},{"type":"Feature","geometry":null,"id":"1_2_LC08_130052_20151127","properties":{"date":{"type":"Date","value":1448595894020},"value":-6032}},{"type":"Feature","geometry":null,"id":"1_2_LC08_130052_20151229","properties":{"date":{"type":"Date","value":1451360692120},"value":-7143}},{"type":"Feature","geometry":null,"id":"1_2_LC08_130052_20160114","properties":{"date":{"type":"Date","value":1452743089680},"value":-6985}},{"type":"Feature","geometry":null,"id":"1_2_LC08_130052_20160130","properties":{"date":{"type":"Date","value":1454125488520},"value":-7236}},{"type":"Feature","geometry":null,"id":"1_2_LC08_130052_20160318","properties":{"date":{"type":"Date","value":1458272673180},"value":-6213}},{"type":"Feature","geometry":null,"id":"1_2_LC08_130052_20160419","properties":{"date":{"type":"Date","value":1461037458170},"value":-5895}},{"type":"Feature","geometry":null,"id":"1_2_LC08_130052_20160505","properties":{"date":{"type":"Date","value":1462419861560},"value":-5501}},{"type":"Feature","geometry":null,"id":"1_2_LC08_130052_20160606","properties":{"date":{"type":"Date","value":1465184665650},"value":-7059}},{"type":"Feature","geometry":null,"id":"1_2_LC08_130052_20160724","properties":{"date":{"type":"Date","value":1469331884490},"value":-7219}},{"type":"Feature","geometry":null,"id":"1_2_LC08_130052_20160809","properties":{"date":{"type":"Date","value":1470714286600},"value":-6589}},{"type":"Feature","geometry":null,"id":"1_2_LC08_130052_20161028","properties":{"date":{"type":"Date","value":1477626305900},"value":-7813}},{"type":"Feature","geometry":null,"id":"1_2_LC08_130052_20161113","properties":{"date":{"type":"Date","value":1479008704660},"value":-7708}},{"type":"Feature","geometry":null,"id":"1_2_LC08_130052_20161129","properties":{"date":{"type":"Date","value":1480391104960},"value":-7620}},{"type":"Feature","geometry":null,"id":"1_2_LC08_130052_20161231","properties":{"date":{"type":"Date","value":1483155898570},"value":-7561}},{"type":"Feature","geometry":null,"id":"1_2_LC08_130052_20170201","properties":{"date":{"type":"Date","value":1485920687370},"value":-6918}},{"type":"Feature","geometry":null,"id":"1_2_LC08_130052_20170321","properties":{"date":{"type":"Date","value":1490067864160},"value":-5287}},{"type":"Feature","geometry":null,"id":"1_2_LC08_130052_20170524","properties":{"date":{"type":"Date","value":1495597456630},"value":-6596}},{"type":"Feature","geometry":null,"id":"1_2_LC08_130052_20171031","properties":{"date":{"type":"Date","value":1509421502770},"value":-4431}},{"type":"Feature","geometry":null,"id":"1_2_LC08_130052_20171202","properties":{"date":{"type":"Date","value":1512186293590},"value":-5606}},{"type":"Feature","geometry":null,"id":"1_2_LC08_130052_20171218","properties":{"date":{"type":"Date","value":1513568696100},"value":-7239}},{"type":"Feature","geometry":null,"id":"1_2_LC08_130052_20180103","properties":{"date":{"type":"Date","value":1514951093280},"value":-7408}},{"type":"Feature","geometry":null,"id":"1_2_LC08_130052_20180119","properties":{"date":{"type":"Date","value":1516333485850},"value":-7397}},{"type":"Feature","geometry":null,"id":"1_2_LC08_130052_20180308","properties":{"date":{"type":"Date","value":1520480663110},"value":-7132}},{"type":"Feature","geometry":null,"id":"1_2_LC08_130052_20181103","properties":{"date":{"type":"Date","value":1541216680010},"value":-6198}},{"type":"Feature","geometry":null,"id":"1_2_LC08_130052_20181119","properties":{"date":{"type":"Date","value":1542599080980},"value":-7127}},{"type":"Feature","geometry":null,"id":"1_2_LC08_130052_20181221","properties":{"date":{"type":"Date","value":1545363877380},"value":-7431}},{"type":"Feature","geometry":null,"id":"1_2_LC08_130052_20190122","properties":{"date":{"type":"Date","value":1548128673200},"value":-6050}},{"type":"Feature","geometry":null,"id":"1_2_LC08_130052_20190207","properties":{"date":{"type":"Date","value":1549511070480},"value":-7311}},{"type":"Feature","geometry":null,"id":"1_2_LC08_130052_20191005","properties":{"date":{"type":"Date","value":1570247106896},"value":-7560}},{"type":"Feature","geometry":null,"id":"1_2_LC08_130052_20191106","properties":{"date":{"type":"Date","value":1573011907553},"value":-6797}},{"type":"Feature","geometry":null,"id":"1_2_LC08_130052_20191208","properties":{"date":{"type":"Date","value":1575776703529},"value":-7530}},{"type":"Feature","geometry":null,"id":"1_2_LC08_130052_20191224","properties":{"date":{"type":"Date","value":1577159100510},"value":-6596}},{"type":"Feature","geometry":null,"id":"1_2_LC08_130052_20200125","properties":{"date":{"type":"Date","value":1579923892562},"value":-7197}},{"type":"Feature","geometry":null,"id":"1_2_LC08_130052_20200210","properties":{"date":{"type":"Date","value":1581306287789},"value":-6599}},{"type":"Feature","geometry":null,"id":"1_2_LC08_130052_20200226","properties":{"date":{"type":"Date","value":1582688683871},"value":-6253}},{"type":"Feature","geometry":null,"id":"1_2_LC08_130052_20200313","properties":{"date":{"type":"Date","value":1584071077377},"value":-6533}},{"type":"Feature","geometry":null,"id":"1_2_LC08_130052_20200329","properties":{"date":{"type":"Date","value":1585453468425},"value":-6512}},{"type":"Feature","geometry":null,"id":"1_2_LC08_130052_20200414","properties":{"date":{"type":"Date","value":1586835861243},"value":-6926}},{"type":"Feature","geometry":null,"id":"1_2_LC08_130052_20200430","properties":{"date":{"type":"Date","value":1588218253300},"value":-7018}},{"type":"Feature","geometry":null,"id":"1_2_LC08_130052_20200516","properties":{"date":{"type":"Date","value":1589600650080},"value":-4995}},{"type":"Feature","geometry":null,"id":"1_2_LC08_130052_20200601","properties":{"date":{"type":"Date","value":1590983054746},"value":-7160}},{"type":"Feature","geometry":null,"id":"1_2_LC08_130052_20200719","properties":{"date":{"type":"Date","value":1595130278365},"value":-5519}},{"type":"Feature","geometry":null,"id":"1_2_LC08_130052_20200820","properties":{"date":{"type":"Date","value":1597895088226},"value":-7075}},{"type":"Feature","geometry":null,"id":"1_2_LC08_130052_20200905","properties":{"date":{"type":"Date","value":1599277495860},"value":-7581}},{"type":"Feature","geometry":null,"id":"1_2_LC08_130053_20130902","properties":{"date":{"type":"Date","value":1378093631260},"value":-7003}},{"type":"Feature","geometry":null,"id":"1_2_LC08_130053_20131020","properties":{"date":{"type":"Date","value":1382240818070},"value":-5261}},{"type":"Feature","geometry":null,"id":"1_2_LC08_130053_20131105","properties":{"date":{"type":"Date","value":1383623213510},"value":-7126}},{"type":"Feature","geometry":null,"id":"1_2_LC08_130053_20131207","properties":{"date":{"type":"Date","value":1386388005610},"value":-6927}},{"type":"Feature","geometry":null,"id":"1_2_LC08_130053_20131223","properties":{"date":{"type":"Date","value":1387770396010},"value":-6788}},{"type":"Feature","geometry":null,"id":"1_2_LC08_130053_20140124","properties":{"date":{"type":"Date","value":1390535176480},"value":-6296}},{"type":"Feature","geometry":null,"id":"1_2_LC08_130053_20140209","properties":{"date":{"type":"Date","value":1391917565000},"value":-6000}},{"type":"Feature","geometry":null,"id":"1_2_LC08_130053_20140225","properties":{"date":{"type":"Date","value":1393299952100},"value":-6014}},{"type":"Feature","geometry":null,"id":"1_2_LC08_130053_20140313","properties":{"date":{"type":"Date","value":1394682340580},"value":-5778}},{"type":"Feature","geometry":null,"id":"1_2_LC08_130053_20140329","properties":{"date":{"type":"Date","value":1396064722820},"value":-5767}},{"type":"Feature","geometry":null,"id":"1_2_LC08_130053_20140703","properties":{"date":{"type":"Date","value":1404359096180},"value":-3453}},{"type":"Feature","geometry":null,"id":"1_2_LC08_130053_20141226","properties":{"date":{"type":"Date","value":1419565514250},"value":-6502}},{"type":"Feature","geometry":null,"id":"1_2_LC08_130053_20150111","properties":{"date":{"type":"Date","value":1420947911660},"value":-6007}},{"type":"Feature","geometry":null,"id":"1_2_LC08_130053_20150127","properties":{"date":{"type":"Date","value":1422330305920},"value":-5879}},{"type":"Feature","geometry":null,"id":"1_2_LC08_130053_20150212","properties":{"date":{"type":"Date","value":1423712698720},"value":-5427}},{"type":"Feature","geometry":null,"id":"1_2_LC08_130053_20150417","properties":{"date":{"type":"Date","value":1429242271750},"value":-5469}},{"type":"Feature","geometry":null,"id":"1_2_LC08_130053_20150503","properties":{"date":{"type":"Date","value":1430624660350},"value":-4735}},{"type":"Feature","geometry":null,"id":"1_2_LC08_130053_20150604","properties":{"date":{"type":"Date","value":1433389458520},"value":-4965}},{"type":"Feature","geometry":null,"id":"1_2_LC08_130053_20150722","properties":{"date":{"type":"Date","value":1437536683970},"value":-5358}},{"type":"Feature","geometry":null,"id":"1_2_LC08_130053_20151127","properties":{"date":{"type":"Date","value":1448595917930},"value":-6053}},{"type":"Feature","geometry":null,"id":"1_2_LC08_130053_20160114","properties":{"date":{"type":"Date","value":1452743113580},"value":-6716}},{"type":"Feature","geometry":null,"id":"1_2_LC08_130053_20160130","properties":{"date":{"type":"Date","value":1454125512420},"value":-7057}},{"type":"Feature","geometry":null,"id":"1_2_LC08_130053_20160318","properties":{"date":{"type":"Date","value":1458272697100},"value":-6185}},{"type":"Feature","geometry":null,"id":"1_2_LC08_130053_20160419","properties":{"date":{"type":"Date","value":1461037482070},"value":-5730}},{"type":"Feature","geometry":null,"id":"1_2_LC08_130053_20160505","properties":{"date":{"type":"Date","value":1462419885470},"value":-5338}},{"type":"Feature","geometry":null,"id":"1_2_LC08_130053_20160606","properties":{"date":{"type":"Date","value":1465184689550},"value":-7079}},{"type":"Feature","geometry":null,"id":"1_2_LC08_130053_20160724","properties":{"date":{"type":"Date","value":1469331908400},"value":-7095}},{"type":"Feature","geometry":null,"id":"1_2_LC08_130053_20160809","properties":{"date":{"type":"Date","value":1470714310510},"value":-6345}},{"type":"Feature","geometry":null,"id":"1_2_LC08_130053_20161028","properties":{"date":{"type":"Date","value":1477626329820},"value":-7730}},{"type":"Feature","geometry":null,"id":"1_2_LC08_130053_20161113","properties":{"date":{"type":"Date","value":1479008728570},"value":-7415}},{"type":"Feature","geometry":null,"id":"1_2_LC08_130053_20161129","properties":{"date":{"type":"Date","value":1480391128860},"value":-7248}},{"type":"Feature","geometry":null,"id":"1_2_LC08_130053_20161231","properties":{"date":{"type":"Date","value":1483155922480},"value":-7513}},{"type":"Feature","geometry":null,"id":"1_2_LC08_130053_20170201","properties":{"date":{"type":"Date","value":1485920711280},"value":-6855}},{"type":"Feature","geometry":null,"id":"1_2_LC08_130053_20170321","properties":{"date":{"type":"Date","value":1490067888060},"value":-4847}},{"type":"Feature","geometry":null,"id":"1_2_LC08_130053_20170524","properties":{"date":{"type":"Date","value":1495597480540},"value":-6668}},{"type":"Feature","geometry":null,"id":"1_2_LC08_130053_20170609","properties":{"date":{"type":"Date","value":1496979888670},"value":-7507}},{"type":"Feature","geometry":null,"id":"1_2_LC08_130053_20171031","properties":{"date":{"type":"Date","value":1509421526680},"value":-4537}},{"type":"Feature","geometry":null,"id":"1_2_LC08_130053_20171202","properties":{"date":{"type":"Date","value":1512186317490},"value":-5606}},{"type":"Feature","geometry":null,"id":"1_2_LC08_130053_20171218","properties":{"date":{"type":"Date","value":1513568720010},"value":-7051}},{"type":"Feature","geometry":null,"id":"1_2_LC08_130053_20180103","properties":{"date":{"type":"Date","value":1514951117190},"value":-7297}},{"type":"Feature","geometry":null,"id":"1_2_LC08_130053_20180119","properties":{"date":{"type":"Date","value":1516333509760},"value":-7343}},{"type":"Feature","geometry":null,"id":"1_2_LC08_130053_20180308","properties":{"date":{"type":"Date","value":1520480687020},"value":-6792}},{"type":"Feature","geometry":null,"id":"1_2_LC08_130053_20180612","properties":{"date":{"type":"Date","value":1528775039990},"value":-6184}},{"type":"Feature","geometry":null,"id":"1_2_LC08_130053_20181119","properties":{"date":{"type":"Date","value":1542599104890},"value":-7044}},{"type":"Feature","geometry":null,"id":"1_2_LC08_130053_20181205","properties":{"date":{"type":"Date","value":1543981502900},"value":-7382}},{"type":"Feature","geometry":null,"id":"1_2_LC08_130053_20181221","properties":{"date":{"type":"Date","value":1545363901290},"value":-7320}},{"type":"Feature","geometry":null,"id":"1_2_LC08_130053_20190122","properties":{"date":{"type":"Date","value":1548128697110},"value":-6438}},{"type":"Feature","geometry":null,"id":"1_2_LC08_130053_20190207","properties":{"date":{"type":"Date","value":1549511094390},"value":-7154}},{"type":"Feature","geometry":null,"id":"1_2_LC08_130053_20190615","properties":{"date":{"type":"Date","value":1560570298220},"value":-4242}},{"type":"Feature","geometry":null,"id":"1_2_LC08_130053_20191005","properties":{"date":{"type":"Date","value":1570247130804},"value":-7321}},{"type":"Feature","geometry":null,"id":"1_2_LC08_130053_20191106","properties":{"date":{"type":"Date","value":1573011931461},"value":-6937}},{"type":"Feature","geometry":null,"id":"1_2_LC08_130053_20191208","properties":{"date":{"type":"Date","value":1575776727442},"value":-7477}},{"type":"Feature","geometry":null,"id":"1_2_LC08_130053_20191224","properties":{"date":{"type":"Date","value":1577159124418},"value":-6576}},{"type":"Feature","geometry":null,"id":"1_2_LC08_130053_20200125","properties":{"date":{"type":"Date","value":1579923916470},"value":-7158}},{"type":"Feature","geometry":null,"id":"1_2_LC08_130053_20200210","properties":{"date":{"type":"Date","value":1581306311692},"value":-6630}},{"type":"Feature","geometry":null,"id":"1_2_LC08_130053_20200226","properties":{"date":{"type":"Date","value":1582688707779},"value":-5823}},{"type":"Feature","geometry":null,"id":"1_2_LC08_130053_20200313","properties":{"date":{"type":"Date","value":1584071101277},"value":-6412}},{"type":"Feature","geometry":null,"id":"1_2_LC08_130053_20200329","properties":{"date":{"type":"Date","value":1585453492333},"value":-6531}},{"type":"Feature","geometry":null,"id":"1_2_LC08_130053_20200414","properties":{"date":{"type":"Date","value":1586835885151},"value":-6690}},{"type":"Feature","geometry":null,"id":"1_2_LC08_130053_20200430","properties":{"date":{"type":"Date","value":1588218277203},"value":-6421}},{"type":"Feature","geometry":null,"id":"1_2_LC08_130053_20200516","properties":{"date":{"type":"Date","value":1589600673988},"value":-4992}},{"type":"Feature","geometry":null,"id":"1_2_LC08_130053_20200601","properties":{"date":{"type":"Date","value":1590983078659},"value":-7118}},{"type":"Feature","geometry":null,"id":"1_2_LC08_130053_20200719","properties":{"date":{"type":"Date","value":1595130302277},"value":-5507}},{"type":"Feature","geometry":null,"id":"1_2_LC08_130053_20200820","properties":{"date":{"type":"Date","value":1597895112130},"value":-6836}},{"type":"Feature","geometry":null,"id":"1_2_LC08_130053_20200905","properties":{"date":{"type":"Date","value":1599277519772},"value":-7597}},{"type":"Feature","geometry":null,"id":"2_LC08_130052_20150807","properties":{"date":{"type":"Date","value":1438919062380},"value":-5670}},{"type":"Feature","geometry":null,"id":"2_LC08_130052_20170609","properties":{"date":{"type":"Date","value":1496979864770},"value":-7685}}]}).pipe(
                    delay(1000),
                // loadCCDCObservations$({recipe, latLng, bands: [selectedBand.value]}).pipe(
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
