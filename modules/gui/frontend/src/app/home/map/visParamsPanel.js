import {Form, form} from 'widget/form/form'
import {Layout} from 'widget/layout'
import {Panel} from 'widget/panel/panel'
import {activatable} from 'widget/activation/activatable'
import {compose} from 'compose'
import {msg} from 'translate'
import ButtonSelect from 'widget/buttonSelect'
import Icon from 'widget/icon'
import React from 'react'
import styles from './visParamsPanel.module.css'

const fields = {
    type: new Form.Field(),

    name1: new Form.Field(),
    min1: new Form.Field(),
    max1: new Form.Field(),
    inverted1: new Form.Field(),
    palette1: new Form.Field(),
    gamma1: new Form.Field(),

    name2: new Form.Field(),
    min2: new Form.Field(),
    max2: new Form.Field(),
    inverted2: new Form.Field(),
    palette2: new Form.Field(),
    gamma2: new Form.Field(),

    name3: new Form.Field(),
    min3: new Form.Field(),
    max3: new Form.Field(),
    inverted3: new Form.Field(),
    palette3: new Form.Field(),
    gamma3: new Form.Field(),
}

class _VisParamsPanel extends React.Component {
    render() {
        const {activatable: {deactivate}} = this.props
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
                        options={[
                            {value: '100', label: '100%'},
                            {value: '98', label: '98%'},
                            {value: '90', label: '90%'},
                        ]}
                        onSelect={option => console.log('Selected')}
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
        const bandInputs = i => ({
            name: inputs[`name${i + 1}`],
            min: inputs[`min${i + 1}`],
            max: inputs[`max${i + 1}`],
            inverted: inputs[`inverted${i + 1}`],
            palette: inputs[`palette${i + 1}`],
            gamma: inputs[`gamma${i + 1}`]
        })
        if (inputs.type.value === 'single') {
            return (
                <BandForm inputs={bandInputs(0)} label={'Band'}/>
            )
        } else if (inputs.type.value === 'rgb') {
            return (
                <Layout>
                    <BandForm inputs={bandInputs(0)} label={'Red channel'}/>
                    <BandForm inputs={bandInputs(1)} label={'Green channel'}/>
                    <BandForm inputs={bandInputs(2)} label={'Blue channel'}/>
                </Layout>
            )
        } else {
            return (
                <Layout>
                    <BandForm inputs={bandInputs(0)} label={'Hue'}/>
                    <BandForm inputs={bandInputs(1)} label={'Saturation'}/>
                    <BandForm inputs={bandInputs(2)} label={'Value'}/>
                </Layout>
            )
        }
    }

    componentDidMount() {
        const {inputs, activatable: {source, visParams}} = this.props
        if (visParams) {
            inputs.type.set(visParams.type)
            const initBand = ({name, min, max, inverted, palette, gamma}, i) => {
                inputs[`name${i + 1}`].set(name)
                inputs[`min${i + 1}`].set(min)
                inputs[`max${i + 1}`].set(max)
                inputs[`inverted${i + 1}`].set(inverted)
                inputs[`palette${i + 1}`].set(palette)
                inputs[`gamma${i + 1}`].set(gamma)
            }
            visParams.bands.forEach(initBand)
        } else {
            inputs.type.set('rgb')
            inputs.gamma1.set(1)
            inputs.gamma2.set(1)
            inputs.gamma3.set(1)
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
        const {label, inputs: {name, gamma, min, max, inverted}} = this.props
        return (
            <div className={styles.bandForm}>
                <Form.Combo
                    className={styles.name}
                    label={label}
                    input={name}
                    options={[]}
                />
                <div className={styles.gammaOrPalette}>
                    <Form.Slider
                        label={msg('map.visParams.form.gamma.label')}
                        input={gamma}
                        minValue={0}
                        maxValue={5}
                        decimals={1}
                        ticks={[0, 0.5, 1, 1.5, 3, 5]}
                        scale='log'
                        info={gamma => msg('map.visParams.form.gamma.info', {gamma})}
                    />
                </div>
                <Form.Input
                    label={msg('map.visParams.form.min.label')}
                    input={min}
                    className={styles.min}
                />
                <Form.Buttons
                    input={inverted}
                    options={[
                        {value: 'inverted', label: <Icon name='exchange-alt'/>}
                    ]}
                    multiple
                    className={styles.inverted}
                />
                <Form.Input
                    label={msg('map.visParams.form.max.label')}
                    input={max}
                    className={styles.max}
                />
                <div className={styles.histogram}/>
            </div>
        )
    }
}
