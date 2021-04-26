import {Form, form} from 'widget/form/form'
import {Histogram, stretch} from './histogram'
import {Layout} from 'widget/layout'
import {Palette} from './palette'
import {Panel} from 'widget/panel/panel'
import {Widget} from 'widget/widget'
import {activatable} from 'widget/activation/activatable'
import {compose} from 'compose'
import {msg} from 'translate'
import ButtonSelect from 'widget/buttonSelect'
import Label from 'widget/label'
import Notifications from 'widget/notifications'
import React from 'react'
import _ from 'lodash'
import api from 'api'
import styles from './visParamsPanel.module.css'

const fields = {
    type: new Form.Field(),
    palette: new Form.Field(),

    name1: new Form.Field(),
    min1: new Form.Field(),
    max1: new Form.Field(),
    inverted1: new Form.Field(),
    gamma1: new Form.Field(),

    name2: new Form.Field(),
    min2: new Form.Field(),
    max2: new Form.Field(),
    inverted2: new Form.Field(),
    gamma2: new Form.Field(),

    name3: new Form.Field(),
    min3: new Form.Field(),
    max3: new Form.Field(),
    inverted3: new Form.Field(),
    gamma3: new Form.Field(),
}

class _VisParamsPanel extends React.Component {
    state = {
        bands: null,
        histograms: {}
    }

    render() {
        const {activatable: {deactivate}, inputs: {name1, name2, name3}} = this.props
        const {histograms} = this.state
        const hasNoHistogram = !histograms[name1.value] && !histograms[name2.value] && !histograms[name3.value]
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
                <Panel.Buttons onEscape={deactivate}>
                    <ButtonSelect
                        label={'Stretch'}
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
                        <Panel.Buttons.Save onClick={() => this.save()}/>
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
                    {this.renderBandForm(0, 'Bands')}
                    {this.renderHistogram(0)}
                </Layout>
            )
        } else if (inputs.type.value === 'rgb') {
            return (
                <Layout>
                    {this.renderBandForm(0, 'Red channel')}
                    {this.renderHistogram(0)}
                    {this.renderBandForm(1, 'Green channel')}
                    {this.renderHistogram(1)}
                    {this.renderBandForm(2, 'Blue channel')}
                    {this.renderHistogram(2)}
                </Layout>
            )
        } else {
            return (
                <Layout>
                    {this.renderBandForm(0, 'Hue')}
                    {this.renderHistogram(0)}
                    {this.renderBandForm(1, 'Saturation')}
                    {this.renderHistogram(1)}
                    {this.renderBandForm(2, 'Value')}
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
                onBandSelected={name => this.initHistogram(name)}/>
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
            const {min, max} = stretch(histogram, percent)
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
            inputs.palette.set(visParams.palette)
            const initBand = ({name, min, max, inverted, gamma}, i) => {
                inputs[`name${i + 1}`].set(name)
                inputs[`min${i + 1}`].set(min)
                inputs[`max${i + 1}`].set(max)
                inputs[`inverted${i + 1}`].set(inverted)
                inputs[`gamma${i + 1}`].set(gamma)
            }
            visParams.bands.forEach(initBand)
        } else {
            inputs.type.set('single')
            inputs.gamma1.set(1)
            inputs.gamma2.set(1)
            inputs.gamma3.set(1)
        }
    }

    initHistogram(name) {
        const {stream, activatable: {recipe}} = this.props
        const {histograms} = this.state
        const histogram = histograms[name]
        if (!histogram) {
            stream((`LOAD_HISTOGRAM_${name}`),
                api.gee.histogram$({recipe, band: name}),
                histogram => this.setState(({histograms}) =>
                    ({histograms: {
                        ...histograms,
                        [name]: histogram
                    }})
                )
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

    save() {
        const {activatable: {deactivate}} = this.props
        // TODO: Implement...
        console.log('Save')
        deactivate()
    }
}

const policy = () => ({
    _: 'allow'
})

export const VisParamsPanel = compose(
    _VisParamsPanel,
    form({fields}),
    activatable({id: 'visParams', policy}),
)

class BandForm extends React.Component {
    render() {
        const {type} = this.props
        const singleBand = type === 'single'
        return (
            <Layout type={'vertical'}>
                <Layout type={'horizontal'}>
                    {this.renderBand()}
                    <Layout type={'horizontal-nowrap'}>
                        {this.renderRange()}
                        {singleBand ? null : this.renderGamma()}
                    </Layout>
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
                chromeless={!(inverted.value || []).length}
                shape={'pill'}
                air={'less'}
                size={'x-small'}
                options={[
                    {value: 'inverted', label: 'REV'}
                ]}
                multiple
            />
        )
    }

    renderPalette() {
        const {inputs: {palette}} = this.props
        return <Palette input={palette} className={styles.gammaOrPalette}/>
    }

    renderRange() {
        const {inputs: {min, max}} = this.props
        return (
            <Widget
                layout={'horizontal-nowrap'}
                label={msg('map.visParams.form.range.label')}>
                <Form.Input
                    input={min}
                    className={[styles.minMax, styles.min].join(' ')}
                />
                <Label msg={<>&hellip;</>}/>
                <Form.Input
                    input={max}
                    className={styles.minMax}
                />
            </Widget>
        )
    }

    renderBand() {
        const {onBandSelected, bands, label, inputs: {name, inverted}} = this.props
        const options = (bands || []).map(band => ({value: band, label: band}))
        return (
            <Form.Combo
                label={label}
                className={styles.band}
                placeholder={'Select band...'}
                input={name}
                options={options}
                disabled={!bands}
                busyMessage={!bands && msg('map.visParams.bands.loading')}
                additionalButtons={[this.renderInverted()]}
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
                <Form.Input input={gamma}/>
            </Widget>
        )
    }
}

function isNumeric(n) {
    return !isNaN(parseFloat(n)) && isFinite(n)
}
