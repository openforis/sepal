import {Form, withForm} from 'widget/form/form'
import {Histogram, histogramStretch} from './histogram'
import {Layout} from 'widget/layout'
import {LegendBuilder, defaultColor} from 'app/home/map/legendBuilder'
import {Palette} from './palette'
import {Panel} from 'widget/panel/panel'
import {Subject, filter, takeUntil} from 'rxjs'
import {Widget} from 'widget/widget'
import {compose} from 'compose'
import {downloadCsv} from 'widget/download'
import {msg} from 'translate'
import {normalize} from 'app/home/map/visParams/visParams'
import {selectFrom} from 'stateUtils'
import {withActivatable} from 'widget/activation/activatable'
import {withActivators} from 'widget/activation/activator'
import {withMap} from 'app/home/map/mapContext'
import {withRecipe} from 'app/home/body/process/recipeContext'
import ButtonSelect from 'widget/buttonSelect'
import Confirm from 'widget/confirm'
import Icon from 'widget/icon'
import Notifications from 'widget/notifications'
import React from 'react'
import _ from 'lodash'
import api from 'api'
import guid from 'guid'
import styles from './visParamsPanel.module.css'

const fields = {
    type: new Form.Field()
        .notBlank(),
    palette: new Form.Field(),
    name1: new Form.Field()
        .notBlank(),
    min1: new Form.Field()
        .skip((value, {name1}) => !name1)
        .skip((value, {type}) => type === 'categorical')
        .notBlank()
        .number()
        .predicate((min1, {max1}) => _.toNumber(min1) < _.toNumber(max1), 'map.visParams.form.min.notSmallerThanMax'),
    max1: new Form.Field()
        .skip((value, {name1}) => !name1)
        .skip((value, {type}) => type === 'categorical')
        .notBlank()
        .number(),
    inverted1: new Form.Field(),
    gamma1: new Form.Field()
        .skip((value, {type}) => !['rgb', 'hsv'].includes(type))
        .notBlank()
        .number(),

    name2: new Form.Field()
        .skip((value, {type}) => !['rgb', 'hsv'].includes(type))
        .notBlank(),
    min2: new Form.Field()
        .skip((value, {name2}) => !name2)
        .skip((value, {type}) => !['rgb', 'hsv'].includes(type))
        .notBlank()
        .number()
        .predicate((min2, {max2}) => _.toNumber(min2) < _.toNumber(max2), 'map.visParams.form.min.notSmallerThanMax'),
    max2: new Form.Field()
        .skip((value, {name2}) => !name2)
        .skip((value, {type}) => !['rgb', 'hsv'].includes(type))
        .notBlank()
        .number(),
    inverted2: new Form.Field(),
    gamma2: new Form.Field()
        .skip((value, {type}) => !['rgb', 'hsv'].includes(type))
        .notBlank()
        .number(),
    name3: new Form.Field()
        .skip((value, {type}) => !['rgb', 'hsv'].includes(type))
        .notBlank(),
    min3: new Form.Field()
        .skip((value, {name3}) => !name3)
        .skip((value, {type}) => !['rgb', 'hsv'].includes(type))
        .notBlank()
        .number()
        .predicate((min3, {max3}) => _.toNumber(min3) < _.toNumber(max3), 'map.visParams.form.min.notSmallerThanMax'),
    max3: new Form.Field()
        .skip((value, {name3}) => !name3)
        .skip((value, {type}) => !['rgb', 'hsv'].includes(type))
        .notBlank()
        .number(),
    inverted3: new Form.Field(),
    gamma3: new Form.Field()
        .skip((value, {type}) => !['rgb', 'hsv'].includes(type))
        .notBlank()
        .number(),
}

const mapRecipeToProps = (recipe, {activatable: {imageLayerSourceId}}) => ({
    visParamsSets: selectFrom(recipe, ['layers.userDefinedVisualizations', imageLayerSourceId]) || [],
    aoi: selectFrom(recipe, 'model.aoi'),
    importedLegendEntries: selectFrom(recipe, 'ui.importedLegendEntries')
})

class _VisParamsPanel extends React.Component {
    state = {
        bands: null,
        histograms: {},
        askConfirmation: false,
        legendEntries: [],
        invalidLegendEntries: false
    }

    cancelHistogram$ = new Subject()

    constructor(props) {
        super(props)
        this.importLegend = this.importLegend.bind(this)
        this.loadDistinctBandValues = this.loadDistinctBandValues.bind(this)
        this.check = this.check.bind(this)
    }

    render() {
        const {askConfirmation} = this.state
        return askConfirmation
            ? this.renderConfirm()
            : this.renderPanel()
    }

    renderPanel() {
        const {activatable: {deactivate}, form, inputs: {type}} = this.props
        const {legendEntries, invalidLegendEntries} = this.state
        const invalid = form.isInvalid() || (type.value === 'categorical' && (invalidLegendEntries || !legendEntries.length))
        return (
            <Panel type='modal' className={styles.panel}>
                <Panel.Header
                    icon='layer-group'
                    title={msg('map.visParams.title')}
                    label={this.renderTypeButtons()}
                />
                <Panel.Content>
                    {this.renderContent()}
                </Panel.Content>
                <Panel.Buttons>
                    {type.value === 'categorical'
                        ? this.renderLegendBuilderButtons()
                        : this.renderStretchButton()}
                    <Panel.Buttons.Main>
                        <Panel.Buttons.Cancel
                            keybinding='Escape'
                            onClick={deactivate}
                        />
                        <Panel.Buttons.Apply
                            disabled={invalid}
                            keybinding='Enter'
                            onClick={this.check}
                        />
                    </Panel.Buttons.Main>
                </Panel.Buttons>
            </Panel>
        )
    }

    renderLegendBuilderButtons() {
        const {stream} = this.props
        const {legendEntries} = this.state
        const options = [
            {options: [
                {
                    value: 'import',
                    label: msg('map.legendBuilder.load.options.importFromCsv.label'),
                    onSelect: this.importLegend
                },
                {
                    value: 'imageValues',
                    label: msg('map.legendBuilder.load.options.imageValues.label'),
                    onSelect: this.loadDistinctBandValues
                }
            ]},
            {options: [
                {
                    value: 'export',
                    label: msg('map.legendBuilder.load.options.exportToCsv.label'),
                    disabled: !legendEntries || !legendEntries.length,
                    onSelect: () => this.exportLegend()
                }
            ]}
        ]
        return (
            <ButtonSelect
                look={'add'}
                icon={'plus'}
                label={msg('button.add')}
                placement='above'
                tooltipPlacement='bottom'
                options={options}
                disabled={stream('LOAD_DISTINCT_IMAGE_VALUES').active}
                onClick={() => this.addLegendEntry()}
            />
        )
    }

    renderStretchButton() {
        const {inputs: {name1, name2, name3}} = this.props
        const {histograms} = this.state
        const hasNoHistogram = !histograms[name1.value] && !histograms[name2.value] && !histograms[name3.value]
        return (
            <ButtonSelect
                label={msg('map.visParams.stretch.label')}
                icon='chart-area'
                placement='above'
                tooltipPlacement='bottom'
                disabled={hasNoHistogram}
                options={[
                    {value: '100', label: '100%'},
                    {value: '99.99', label: '99.99%'},
                    {value: '99.9', label: '99.9%'},
                    {value: '99', label: '99%'},
                    {value: '98', label: '98%'},
                    {value: '95', label: '95%'},
                    {value: '90', label: '90%'},
                ]}
                onSelect={({value}) => this.stretchHistograms(value)}
            />
        )
    }

    renderTypeButtons() {
        const {inputs: {type}} = this.props
        return (
            <ButtonSelect
                chromeless
                shape='pill'
                placement='below'
                input={type}
                tooltipPlacement='bottom'
                options={[{
                    value: 'continuous',
                    label: msg('map.visParams.type.continuous.label'),
                    tooltip: msg('map.visParams.type.continuous.tooltip')
                }, {
                    value: 'categorical',
                    label: msg('map.visParams.type.categorical.label'),
                    tooltip: msg('map.visParams.type.categorical.tooltip')
                }, {
                    value: 'rgb',
                    label: msg('map.visParams.type.rgb.label'),
                    tooltip: msg('map.visParams.type.rgb.tooltip')
                }, {
                    value: 'hsv',
                    label: msg('map.visParams.type.hsv.label'),
                    tooltip: msg('map.visParams.type.hsv.tooltip')
                }]}
                onChange={nextType => this.onTypeChanged(nextType)}
            />
        )
    }

    onTypeChanged(nextType) {
        const {inputs} = this.props
        const {type, name1, name2, name3} = inputs
        const prevType = type.value
        const minMaxDefined = i => !_.isNil(inputs[`min${i}`]) && _.isNil(inputs[`max${i}`])
        if (prevType === 'categorical' && nextType !== 'categorical') {
            this.analyzeBand(name1.value, {type: nextType, stretch: !minMaxDefined(1)})
            if (type !== 'continuous') {
                this.analyzeBand(name2.value, {type: nextType, stretch: !minMaxDefined(1)})
                this.analyzeBand(name3.value, {type: nextType, stretch: !minMaxDefined(1)})
            }
        }
    }

    renderContent() {
        const {inputs} = this.props
        if (inputs.type.value === 'continuous') {
            return (
                <Layout>
                    {this.renderBandForm(0, msg('map.visParams.form.band.band.label'))}
                    {this.renderHistogram(0)}
                </Layout>
            )
        } else if (inputs.type.value === 'categorical') {
            return this.renderLegendBuilder()
        } else if (inputs.type.value === 'rgb') {
            return (
                <Layout>
                    {this.renderBandForm(0, msg('map.visParams.form.band.redChannel.label'))}
                    {this.renderHistogram(0)}
                    {this.renderBandForm(1, msg('map.visParams.form.band.greenChannel.label'))}
                    {this.renderHistogram(1)}
                    {this.renderBandForm(2, msg('map.visParams.form.band.blueChannel.label'))}
                    {this.renderHistogram(2)}
                </Layout>
            )
        } else {
            return (
                <Layout>
                    {this.renderBandForm(0, msg('map.visParams.form.band.hue.label'))}
                    {this.renderHistogram(0)}
                    {this.renderBandForm(1, msg('map.visParams.form.band.saturation.label'))}
                    {this.renderHistogram(1)}
                    {this.renderBandForm(2, msg('map.visParams.form.band.value.label'))}
                    {this.renderHistogram(2)}
                </Layout>
            )
        }
    }

    renderLegendBuilder() {
        const {stream} = this.props
        const {bands, legendEntries} = this.state
        const loading = stream('LOAD_DISTINCT_IMAGE_VALUES').active
        return (
            <Layout>
                <Band
                    label={msg('map.visParams.form.band.band.label')}
                    inputs={this.bandInputs(0)}
                    bands={bands}
                />
                {loading
                    ? (
                        <Widget label={msg('map.legendBuilder.label')}>
                            <Icon name='spinner' className={styles.spinner}/>
                        </Widget>
                    )
                    : (
                        <LegendBuilder
                            entries={legendEntries}
                            onChange={(updatedEntries, invalid) => this.updateLegendEntries(updatedEntries, invalid)}
                        />
                    )
                }
            </Layout>
        )
    }

    renderBandForm(i, label) {
        const {inputs: {type}} = this.props
        const {bands} = this.state
        return (
            <BandForm
                bands={bands}
                type={type.value}
                inputs={this.bandInputs(i)}
                label={label}
                onBandSelected={name => this.bandSelected(i, name)}/>
        )
    }

    renderHistogram(i) {
        const {stream} = this.props
        const {histograms} = this.state
        const {name, min, max} = this.bandInputs(i)
        return (
            <Histogram
                histogram={histograms[name.value]}
                min={isNumeric(min.value) ? _.toNumber(min.value) : undefined}
                max={isNumeric(max.value) ? _.toNumber(max.value) : undefined}
                loading={stream(`LOAD_HISTOGRAM_${name.value}`).active}
                onMinMaxChange={minMax => {
                    min.set(minMax.min)
                    max.set(minMax.max)
                }}
            />
        )
    }

    renderConfirm() {
        return (
            <Confirm
                message={'You already have saved visualization parameters with these bands. Do you want to override the old visualization parameters with these?'}
                label={'Replace'}
                onConfirm={() => {
                    this.save()
                }}
                onCancel={() => this.setState({askConfirmation: false})}/>
        )
    }

    stretchHistograms(percent) {
        this.stretchHistogram(percent, 0)
        this.stretchHistogram(percent, 1)
        this.stretchHistogram(percent, 2)
    }

    stretchHistogram(percent, i) {
        const {histograms} = this.state
        const inputs = this.bandInputs(i)
        const histogram = histograms[inputs.name.value]
        if (histogram) {
            const {min, max} = histogramStretch(histogram.data, percent)
            inputs.min.set(min)
            inputs.max.set(max)
        }
    }

    componentDidMount() {
        const {stream, inputs, activatable: {recipe, visParams}} = this.props
        stream('LOAD_BANDS',
            api.gee.bands$({recipe}),
            bands => this.setState({bands}),
            error => Notifications.error({message: msg('map.visParams.bands.loadError'), error})
        )
        if (visParams) {
            inputs.type.set(visParams.type)
            visParams.palette && inputs.palette.set(visParams.palette.map(color => ({id: guid(), color})))
            inputs['gamma1'].set(visParams.gamma ? visParams.gamma[0] : 1)
            inputs['gamma2'].set(visParams.gamma ? visParams.gamma[1] : 1)
            inputs['gamma3'].set(visParams.gamma ? visParams.gamma[2] : 1)
            const initBand = (name, i) => {
                inputs[`name${i + 1}`].set(name)
                inputs[`min${i + 1}`].set(visParams.min[i])
                inputs[`max${i + 1}`].set(visParams.max[i])
                inputs[`inverted${i + 1}`].set([visParams.inverted && visParams.inverted[i]])
                this.analyzeBand(name, {type: visParams.type, stretch: false})
            }
            visParams.bands.forEach(initBand)
            if (visParams.type === 'categorical') {
                const legendEntries = visParams.values
                    ? visParams.values.map((value, i) => ({
                        id: guid(),
                        value,
                        color: visParams.palette && visParams.palette.length > i
                            ? visParams.palette[i]
                            : null,
                        label: visParams.labels && visParams.labels.length > i
                            ? visParams.labels[i]
                            : null,
                    }))
                    : []
                this.setState({legendEntries})
            }
        } else {
            inputs.type.set('continuous')
            inputs.gamma1.set(1)
            inputs.gamma2.set(1)
            inputs.gamma3.set(1)
        }
    }

    componentDidUpdate(prevProps) {
        const {importedLegendEntries, recipeActionBuilder} = this.props
        if (importedLegendEntries && !_.isEqual(importedLegendEntries, prevProps.importedLegendEntries)) {
            recipeActionBuilder('CLEAR_IMPORTED_LEGEND_ENTRIES', {importedLegendEntries})
                .del('ui.importedLegendEntries')
                .dispatch()
            this.setState({legendEntries: importedLegendEntries})
        }
    }

    addLegendEntry() {
        this.setState(({legendEntries}) => {
            const max = _.maxBy(legendEntries, 'value')
            return {
                legendEntries: [...legendEntries, {
                    id: guid(),
                    value: max ? max.value + 1 : 1,
                    color: defaultColor(legendEntries.length),
                    label: ''
                }]
            }
        })
    }

    updateLegendEntries(legendEntries, invalidLegendEntries) {
        this.setState({legendEntries, invalidLegendEntries})
    }

    bandSelected(i, name) {
        const {inputs, stream} = this.props
        const prevName = inputs[`name${i + 1}`].value
        const prevActive = stream(`LOAD_HISTOGRAM_${prevName}`).active
        if (prevActive) {
            const prevSelectedElsewhere = [0, 1, 2]
                .filter(index => index !== i)
                .find(i => inputs[`name${i + 1}`].value === prevName)
            if (!prevSelectedElsewhere) {
                this.cancelHistogram$.next(prevName)
            }
        }
        this.analyzeBand(name, {type: inputs.type.value, stretch: true})
    }

    analyzeBand(name, {type, stretch}) {
        if (name && type !== 'categorical') {
            this.initHistogram(name, {stretch})
        }
    }

    initHistogram(name, {stretch}) {
        const {stream, activatable: {recipe}, aoi, map: {getBounds}} = this.props
        const {histograms} = this.state
        const histogram = histograms[name]
        const updateHistogram = (data, stretch) => this.setState(({histograms}) =>
            ({
                histograms: {
                    ...histograms,
                    [name]: {data, stretch}
                }
            })
        )
        if (histogram) {
            updateHistogram(histogram.data, true)
        } else if (!stream(`LOAD_HISTOGRAM_${name}`).active) {
            const mapBounds = getBounds()
            stream((`LOAD_HISTOGRAM_${name}`),
                api.gee.histogram$({recipe, aoi, band: name, mapBounds}).pipe(
                    takeUntil(this.cancelHistogram$.pipe(
                        filter(nameToCancel => nameToCancel === name)
                    ))
                ),
                data => data
                    ? updateHistogram(data, stretch)
                    : Notifications.warning({message: msg('map.visParams.form.histogram.noData')}),
                error => Notifications.error({message: msg('map.visParams.form.histogram.error'), error})
            )
        }
    }

    bandInputs(i) {
        const {inputs} = this.props
        return {
            name: inputs[`name${i + 1}`],
            min: inputs[`min${i + 1}`],
            max: inputs[`max${i + 1}`],
            inverted: inputs[`inverted${i + 1}`],
            palette: inputs['palette'],
            gamma: inputs[`gamma${i + 1}`]
        }
    }

    check() {
        if (this.overridingVisParams()) {
            this.setState({askConfirmation: true})
        } else {
            this.save()
        }
    }

    overridingVisParams() {
        const {visParamsSets, activatable: {visParams = {}}} = this.props
        const selectedBands = this.values('name')
        return visParamsSets.find(({id, bands}) =>
            id !== visParams.id && _.isEqual(bands, selectedBands)
        )
    }

    importLegend() {
        const {activator: {activatables: {legendImport}}} = this.props
        legendImport.activate()
    }

    exportLegend() {
        const {inputs: {name1}} = this.props
        const {legendEntries} = this.state
        const csv = [
            ['color,value,label'],
            legendEntries.map(({color, value, label}) => `${color},${value},"${label.replaceAll('"', '\\"')}"`)
        ].flat().join('\n')
        const filename = `${name1.value}_legend.csv`
        downloadCsv(csv, filename)
    }

    loadDistinctBandValues() {
        const {activatable: {recipe}, aoi, stream, inputs: {name1}, map: {getBounds}} = this.props
        const toEntries = values => values.map(value => ({
            id: guid(),
            value,
            label: `${value}`,
            color: '#000000'
        }))

        if (!stream('LOAD_DISTINCT_IMAGE_VALUES').active) {
            const mapBounds = getBounds()
            stream('LOAD_DISTINCT_IMAGE_VALUES',
                api.gee.distinctBandValues$({recipe, band: name1.value, aoi, mapBounds}),
                values => this.setState({legendEntries: toEntries(values)}),
                () => Notifications.error({message: msg('map.legendBuilder.load.options.imageValues.loadError')})
            )
        }
    }

    save() {
        const {recipeActionBuilder, activatable: {imageLayerSourceId, visParams: prevVisParams, deactivate}, inputs, updateLayerConfig} = this.props
        const type = inputs.type.value
        const bands = this.values('name')
        const inverted = this.values('inverted').map(inverted => inverted ? inverted[0] : false)
        const min = this.values('min').map(value => toNumber(value))
        const max = this.values('max').map(value => toNumber(value))
        const gamma = this.values('gamma').map(value => toNumber(value))
        const palette = inputs.palette.value
            ? inputs.palette.value.map(({color}) => color)
            : ['#000000', '#FFFFFF']
        const id = prevVisParams && prevVisParams.id ? prevVisParams.id : guid()
        const dataType = prevVisParams.dataType
        const visParams = normalize(
            type === 'continuous'
                ? {id, type, bands, dataType, inverted, min, max, palette, userDefined: true}
                : type === 'categorical'
                    ? this.toCategoricalVisParams(id)
                    : {id, type, bands, dataType, inverted, min, max, gamma, userDefined: true}
        )
        const toDelete = this.overridingVisParams() || {}
        recipeActionBuilder('SAVE_VIS_PARAMS', {visParams})
            .del(['layers.userDefinedVisualizations', imageLayerSourceId, {id: toDelete.id}])
            .set(['layers.userDefinedVisualizations', imageLayerSourceId, {id}], visParams)
            .dispatch()
        updateLayerConfig({visParams})
        deactivate()
    }

    toCategoricalVisParams(id) {
        const {inputs: {name1}} = this.props
        const {legendEntries} = this.state
        const sortedEntries = _.sortBy(legendEntries, 'value')
        return {
            id,
            type: 'categorical',
            bands: [name1.value],
            inverted: [false],
            min: _.min(sortedEntries.map(({value}) => value)),
            max: _.max(sortedEntries.map(({value}) => value)),
            values: sortedEntries.map(({value}) => value),
            labels: sortedEntries.map(({label}) => label),
            palette: sortedEntries.map(({color}) => color),
            userDefined: true
        }
    }

    values(name) {
        const {inputs} = this.props
        const type = inputs.type.value
        const singleBand = isSingleBand(type)
        return singleBand
            ? [inputs[`${name}1`].value]
            : [inputs[`${name}1`].value, inputs[`${name}2`].value, inputs[`${name}3`].value]
    }
}

const policy = () => ({
    _: 'allow'
})

export const VisParamsPanel = compose(
    _VisParamsPanel,
    withForm({fields}),
    withRecipe(mapRecipeToProps),
    withMap(),
    withActivatable({
        id: ({area}) => `visParams-${area}`,
        policy,
        alwaysAllow: true
    }),
    withActivators('legendImport')
)

class BandForm extends React.Component {
    render() {
        const {type, bands, label, onBandSelected = () => {}, inputs} = this.props
        return (
            <Layout type={'vertical'}>
                <Layout type={'horizontal'}>
                    <Band label={label} bands={bands} inputs={inputs} onBandSelected={onBandSelected} invertable/>
                    {this.renderRange()}
                    {type === 'continuous' ? null : this.renderGamma()}
                </Layout>
                {type === 'continuous' ? this.renderPalette() : null}
            </Layout>
        )
    }

    renderPalette() {
        const {inputs: {palette}} = this.props
        return <Palette input={palette}/>
    }

    renderRange() {
        const {inputs: {min, max}} = this.props
        return (
            <Layout type='horizontal'>
                <Form.Input
                    input={min}
                    label={msg('map.visParams.form.min.label')}
                    className={styles.minMax}
                    type='number'
                    errorMessage
                />
                <Form.Input
                    input={max}
                    label={msg('map.visParams.form.max.label')}
                    className={styles.minMax}
                    type='number'
                    errorMessage
                />
            </Layout>
        )
    }

    renderGamma() {
        const {inputs: {gamma}} = this.props
        return (
            <Widget
                label={msg('map.visParams.form.gamma.label')}
                className={styles.gamma}>
                <Form.Input
                    input={gamma}
                    errorMessage
                />
            </Widget>
        )
    }
}

const Band = ({invertable, onBandSelected, bands, label, inputs: {name, inverted}}) => {
    const options = (bands || []).map(band => ({value: band, label: band}))
    const invertedWidget = (
        <Form.Buttons
            key={'inverted'}
            input={inverted}
            look='transparent'
            shape={'pill'}
            air={'less'}
            size={'x-small'}
            options={[
                {value: true, label: 'REV', tooltip: msg('map.visParams.form.band.reverse.tooltip')}
            ]}
            multiple
            tabIndex={-1}
        />
    )

    return (
        <Form.Combo
            label={label}
            className={styles.band}
            placeholder={msg('map.visParams.form.band.select.placeholder')}
            input={name}
            options={options}
            busyMessage={!bands && msg('map.visParams.bands.loading')}
            disabled={!bands}
            additionalButtons={invertable ? [invertedWidget] : []}
            onChange={({value}) => onBandSelected && onBandSelected(value)}
        />
    )
}

const isSingleBand = type =>
    ['continuous', 'categorical'].includes(type)

const toNumber = value => {
    value = _.isString(value) ? value : _.toString(value)
    const parsed = parseFloat(value)
    return _.isFinite(parsed) ? parsed : null
}

const isNumeric = n => !isNaN(parseFloat(n)) && isFinite(n)
