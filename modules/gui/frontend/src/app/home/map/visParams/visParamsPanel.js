import {Form, form} from 'widget/form/form'
import {Histogram, histogramStretch} from './histogram'
import {Layout} from 'widget/layout'
import {Palette} from './palette'
import {Panel} from 'widget/panel/panel'
import {Widget} from 'widget/widget'
import {activatable} from 'widget/activation/activatable'
import {compose} from 'compose'
import {msg} from 'translate'
import {selectFrom} from 'stateUtils'
import {withRecipe} from 'app/home/body/process/recipeContext'
import ButtonSelect from 'widget/buttonSelect'
import Confirm from 'widget/confirm'
import Label from 'widget/label'
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
        .notBlank()
        .number()
        .predicate((min1, {max1}) => min1 < max1, msg('map.visParams.form.min.notSmallerThanMax')),
    max1: new Form.Field()
        .skip((value, {name1}) => !name1)
        .notBlank()
        .number(),
    inverted1: new Form.Field(),
    gamma1: new Form.Field()
        .skip((value, {type}) => type === 'single')
        .notBlank()
        .number(),

    name2: new Form.Field()
        .skip((value, {type}) => type === 'single')
        .notBlank(),
    min2: new Form.Field()
        .skip((value, {name2}) => !name2)
        .skip((value, {type}) => type === 'single')
        .notBlank()
        .number()
        .predicate((min2, {max2}) => min2 < max2, msg('map.visParams.form.min.notSmallerThanMax')),
    max2: new Form.Field()
        .skip((value, {name2}) => !name2)
        .skip((value, {type}) => type === 'single')
        .notBlank()
        .number(),
    inverted2: new Form.Field(),
    gamma2: new Form.Field()
        .skip((value, {type}) => type === 'single')
        .notBlank()
        .number(),
    name3: new Form.Field()
        .skip((value, {type}) => type === 'single')
        .notBlank(),
    min3: new Form.Field()
        .skip((value, {name3}) => !name3)
        .skip((value, {type}) => type === 'single')
        .notBlank()
        .number()
        .predicate((min3, {max3}) => min3 < max3, msg('map.visParams.form.min.notSmallerThanMax')),
    max3: new Form.Field()
        .skip((value, {name3}) => !name3)
        .skip((value, {type}) => type === 'single')
        .notBlank()
        .number(),
    inverted3: new Form.Field(),
    gamma3: new Form.Field()
        .skip((value, {type}) => type === 'single')
        .notBlank()
        .number(),
}

const mapRecipeToProps = (recipe, {activatable: {imageLayerSourceId}}) => ({
    visParamsSets: selectFrom(recipe, ['layers.customVisParams', imageLayerSourceId]) || []
})
class _VisParamsPanel extends React.Component {
    state = {
        bands: null,
        histograms: {},
        askConfirmation: false
    }

    render() {
        const {askConfirmation} = this.state
        return askConfirmation
            ? this.renderConfirm()
            : this.renderPanel()
    }

    renderPanel() {
        const {activatable: {deactivate}, form, inputs: {name1, name2, name3}} = this.props
        const {histograms} = this.state
        const hasNoHistogram = !histograms[name1.value] && !histograms[name2.value] && !histograms[name3.value]
        const invalid = form.isInvalid()
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
                <Panel.Buttons onEscape={deactivate} onEnter={() => invalid || this.check()}>
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
                    <Panel.Buttons.Main>
                        <Panel.Buttons.Cancel onClick={deactivate}/>
                        <Panel.Buttons.Save
                            disabled={invalid}
                            onClick={() => this.check()}
                        />
                    </Panel.Buttons.Main>
                </Panel.Buttons>
            </Panel>
        )
    }

    renderTypeButtons() {
        const {inputs: {type}} = this.props
        return (
            <Form.Buttons
                input={type}
                options={[
                    {value: 'single', label: msg('map.visParams.type.single.label')},
                    {value: 'rgb', label: msg('map.visParams.type.rgb.label')},
                    {value: 'hsv', label: msg('map.visParams.type.hsv.label')},
                ]}
                onChange={this.setMode}
            />
        )
    }

    renderContent() {
        const {inputs} = this.props
        if (inputs.type.value === 'single') {
            return (
                <Layout>
                    {this.renderBandForm(0, msg('map.visParams.form.band.band.label'))}
                    {this.renderHistogram(0)}
                </Layout>
            )
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

    renderBandForm(i, label) {
        const {inputs: {type}} = this.props
        const {bands} = this.state
        return (
            <BandForm
                bands={bands}
                type={type.value}
                inputs={this.bandInputs(i)}
                label={label}
                onBandSelected={name => this.initHistogram(name, {stretch: true})}/>
        )
    }

    renderHistogram(i) {
        const {stream} = this.props
        const {histograms} = this.state
        const {name, min, max, inverted} = this.bandInputs(i)
        return (
            <Histogram
                histogram={histograms[name.value]}
                min={isNumeric(min.value) ? _.toNumber(min.value) : undefined}
                max={isNumeric(max.value) ? _.toNumber(max.value) : undefined}
                inverted={inverted.value}
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
            visParams.palette
                ? inputs.palette.set(visParams.palette.map(color => ({id: guid(), color})))
                : []
            inputs['gamma1'].set(visParams.gamma ? visParams.gamma[0] : 1)
            inputs['gamma2'].set(visParams.gamma ? visParams.gamma[1] : 1)
            inputs['gamma3'].set(visParams.gamma ? visParams.gamma[2] : 1)
            const initBand = (name, i) => {
                this.initHistogram(name, {stretch: false})
                inputs[`name${i + 1}`].set(name)
                inputs[`min${i + 1}`].set(visParams.min[i])
                inputs[`max${i + 1}`].set(visParams.max[i])
                inputs[`inverted${i + 1}`].set([visParams.inverted[i]])
            }
            visParams.bands.forEach(initBand)
        } else {
            inputs.type.set('single')
            inputs.gamma1.set(1)
            inputs.gamma2.set(1)
            inputs.gamma3.set(1)
        }
    }

    initHistogram(name, {stretch}) {
        const {stream, activatable: {recipe}} = this.props
        const {histograms} = this.state
        const histogram = histograms[name]
        const updateHistogram = (data, stretch) => this.setState(({histograms}) =>
            ({histograms: {
                ...histograms,
                [name]: {data, stretch}
            }})
        )
        if (histogram) {
            updateHistogram(histogram.data, true)
        } else {
            stream((`LOAD_HISTOGRAM_${name}`),
                api.gee.histogram$({recipe, band: name}),
                data => updateHistogram(data, stretch)
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

    save() {
        const {recipeActionBuilder, activatable: {imageLayerSourceId, visParams: prevVisParams, deactivate}, inputs, updateLayerConfig} = this.props
        const type = inputs.type.value
        const singleBand = type === 'single'
        const bands = this.values('name')
        const inverted = this.values('inverted').map(inverted => inverted ? inverted[0] : false)
        const min = this.values('min')
        const max = this.values('max')
        const gamma = this.values('gamma')
        const palette = inputs.palette.value ? inputs.palette.value.map(({color}) => color) : []
        const id = prevVisParams ? prevVisParams.id : guid()
        const visParams = singleBand
            ? {id, type, bands, inverted, min, max, palette, custom: true}
            : {id, type, bands, inverted, min, max, gamma, custom: true}
        const toDelete = this.overridingVisParams() || {}
        recipeActionBuilder('SAVE_VIS_PARAMS', {visParams})
            .del(['layers.customVisParams', imageLayerSourceId, {id: toDelete.id}])
            .set(['layers.customVisParams', imageLayerSourceId, {id}], visParams)
            .dispatch()
        updateLayerConfig({visParams})
        deactivate()
    }

    values(name) {
        const {inputs} = this.props
        const type = inputs.type.value
        const singleBand = type === 'single'
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
    form({fields}),
    withRecipe(mapRecipeToProps),
    activatable({
        id: ({area}) => `visParams-${area}`,
        policy
    })
)

class BandForm extends React.Component {
    render() {
        const {type} = this.props
        const singleBand = type === 'single'
        return (
            <Layout type={'vertical'}>
                <Layout type={'horizontal'}>
                    {this.renderBand()}
                    {this.renderRange()}
                    {singleBand ? null : this.renderGamma()}
                </Layout>
                {singleBand ? this.renderPalette() : null}
            </Layout>
        )
    }

    renderInverted() {
        const {inputs: {inverted}} = this.props
        return (
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
            />
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
                    type='number'
                    label={msg('map.visParams.form.min.label')}
                    className={styles.minMax}
                    errorMessage
                />
                <Form.Input
                    input={max}
                    type='number'
                    label={msg('map.visParams.form.max.label')}
                    className={styles.minMax}
                    errorMessage
                />
            </Layout>
        )
    }

    renderBand() {
        const {onBandSelected, bands, label, inputs: {name}} = this.props
        const options = (bands || []).map(band => ({value: band, label: band}))
        return (
            <Form.Combo
                label={label}
                className={styles.band}
                placeholder={msg('map.visParams.form.band.select.placeholder')}
                input={name}
                options={options}
                disabled={!bands}
                busyMessage={!bands && msg('map.visParams.bands.loading')}
                additionalButtons={[this.renderInverted()]}
                errorMessage
                onChange={({value}) => onBandSelected(value)}
            />
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

function isNumeric(n) {
    return !isNaN(parseFloat(n)) && isFinite(n)
}
