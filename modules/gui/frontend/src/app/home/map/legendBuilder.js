import {Button} from 'widget/button'
import {ButtonGroup} from 'widget/buttonGroup'
import {Form, form} from 'widget/form/form'
import {Layout} from 'widget/layout'
import {PalettePreSets, pickColors} from './visParams/palettePreSets'
import {Widget} from 'widget/widget'
import {compose} from 'compose'
import {isMobile} from 'widget/userAgent'
import {msg} from 'translate'
import Color from 'color'
import React from 'react'
import RemoveButton from 'widget/removeButton'
import Tooltip from 'widget/tooltip'
import _ from 'lodash'
import guid from 'guid'
import styles from './legendBuilder.module.css'

export class LegendBuilder extends React.Component {
    state = {
        show: 'palette'
    }

    constructor(props) {
        super(props)
        this.applyPreset = this.applyPreset.bind(this)
        this.updateEntry = this.updateEntry.bind(this)
        this.updateValidation = this.updateValidation.bind(this)
    }

    render() {
        const {entries} = this.props
        const {show} = this.state
        return (
            <Widget label={msg('map.legendBuilder.label')} labelButtons={this.labelButtons()}>
                <Layout type='vertical' spacing='compact'>
                    {entries.map(entry =>
                        <Layout key={entry.id} type={'horizontal-nowrap'}>
                            <Entry
                                mode={show}
                                entry={entry}
                                entries={entries}
                                onChange={this.updateEntry}
                                onValidate={this.updateValidation}
                                onSwap={color => this.swap(color, entry.color)}
                            />
                            <RemoveButton
                                message={msg('map.legendBuilder.entry.confirmation')}
                                size='small'
                                onRemove={() => this.removeEntry(entry)}/>
                        </Layout>
                    )}
                    <PalettePreSets onSelect={this.applyPreset} count={entries.length}/>
                </Layout>
            </Widget>
        )
    }

    applyPreset(colors) {
        const {entries, onChange} = this.props
        const mappedColors = pickColors(entries.length, colors)
        onChange(entries.map((entry, i) => ({
            ...entry, color: mappedColors[i]
        })))
    }

    swap(color1, color2) {
        const {entries, onChange} = this.props
        const entry1 = entries.find(({color}) => color === color1)
        const entry2 = entries.find(({color}) => color === color2)
        const updatedEntries = [
            {...entry1, color: color2},
            {...entry2, color: color1}
        ]

        onChange(entries.map(entry =>
            updatedEntries.find(({id}) => id === entry.id) || entry
        ))
    }

    labelButtons() {
        const {show} = this.state
        return [
            <Button
                key={'add'}
                icon='plus'
                chromeless
                shape='circle'
                size='small'
                disabled={show !== 'palette'}
                tooltip={msg('map.legendBuilder.addEntry.tooltip')}
                onClick={() => this.addEntry()}
            />,
            show === 'palette'
                ? (
                    <Button
                        key={'text'}
                        icon='font'
                        chromeless
                        shape='circle'
                        size='small'
                        tooltip={msg('map.legendBuilder.colors.text.tooltip')}
                        onClick={() => this.showText()}
                    />
                )
                : (
                    <Button
                        key={'palette'}
                        icon='palette'
                        chromeless
                        shape='circle'
                        size='small'
                        tooltip={msg('map.legendBuilder.colors.colorPicker.tooltip')}
                        onClick={() => this.showPalette()}
                    />
                )
        ]
    }

    showText() {
        this.setState({show: 'text'})
    }

    showPalette() {
        this.setState({show: 'palette'})
    }

    addEntry() {
        const {entries, onChange} = this.props
        const id = guid()
        const max = _.maxBy(entries, 'value')
        const value = max ? max.value + 1 : 1
        const color = '#000000'
        const label = ''
        onChange([...entries, {id, value, color, label}])
    }

    updateEntry(updatedEntry) {
        const {entries, onChange} = this.props
        onChange(entries.map(entry =>
            entry.id === updatedEntry.id
                ? updatedEntry
                : entry
        ))
    }

    updateValidation(entry, invalid) {
        const {entries, onChange} = this.props
        onChange(entries, invalid)
    }

    removeEntry(entry) {
        const {entries, onChange} = this.props
        onChange(entries.filter(({id}) => id !== entry.id))
    }
}

const isUnique = (key, value, entries) => !entries || entries.filter(entry => entry[key] === value).length <= 1

const entryFields = {
    entries: new Form.Field(),
    value: new Form.Field()
        .notBlank(),
    color: new Form.Field()
        .notBlank()
        .predicate(color => {
            try {
                Color(color).hex()
                return true
            } catch (e) {
                return false
            }
        }, 'map.legendBuilder.entry.error.invalidColor'),
    label: new Form.Field()
        .notBlank()
}

const entryConstraints = {
    valueUnique: new Form.Constraint(['value', 'entries'])
        .predicate(({
            value,
            entries
        }) => isUnique('value', value, entries), 'map.legendBuilder.entry.error.duplicateValue'),
    colorUnique: new Form.Constraint(['color', 'entries'])
        .predicate(({
            color,
            entries
        }) => isUnique('color', color, entries), 'map.legendBuilder.entry.error.duplicateColor'),
    labelUnique: new Form.Constraint(['label', 'entries'])
        .predicate(({
            label,
            entries
        }) => {
            return isUnique('label', label, entries)
        }, 'map.legendBuilder.entry.error.duplicateLabel')
}

class _Entry extends React.Component {
    state = {invalid: true}

    render() {
        const {form, entry, entries, mode, hasTrainingData, inputs: {value, color, label}, onSwap} = this.props
        const otherColors = entries
            .filter(({id}) => entry.id !== id)
            .map(({color}) => color)
        return (
            <Layout type={'horizontal-nowrap'} className={styles.entry}>
                {mode === 'palette'
                    ? (
                        <ColorInput
                            input={color}
                            otherColors={otherColors}
                            onChange={color => this.notifyChange({color})}
                            onSwap={color => onSwap(color)}
                            invalid={!!form.errors.colorUnique}
                        />
                    )
                    : (
                        <Form.Input
                            className={styles.colorText}
                            input={color}
                            errorMessage={[color, 'colorUnique']}
                            autoComplete={false}
                            onChange={e => this.notifyChange({color: e.target.value})}
                        />
                    )}

                <Form.Input
                    className={styles.value}
                    input={value}
                    errorMessage={[value, 'valueUnique']}
                    autoComplete={false}
                    disabled={hasTrainingData}
                    onChange={e => this.notifyChange({value: e.target.value})}
                />

                <Form.Input
                    className={styles.label}
                    input={label}
                    placeholder={'Class label'}
                    autoFocus={!entry.label}
                    errorMessage={[label, 'labelUnique']}
                    autoComplete={false}
                    onChange={e => {
                        this.notifyChange({label: e.target.value})
                    }}
                />
            </Layout>
        )
    }

    componentDidMount() {
        const {form, entry, onValidate} = this.props
        this.update()
        const invalid = form.isInvalid()
        onValidate(entry, invalid)
    }

    componentDidUpdate(prevProps) {
        const {entry: prevEntry, entries: prevEntries} = prevProps
        const {entry, entries, form, onValidate} = this.props
        const {invalid: prevInvalid} = this.state
        const invalid = form.isInvalid()
        if (invalid !== prevInvalid) {
            this.setState({invalid})
            onValidate(entry, invalid)
        }
        if (entry !== prevEntry || entries !== prevEntries) {
            this.update()
        }
    }

    update() {
        const {entry, entries, inputs} = this.props
        inputs.entries.set(entries)
        inputs.value.set(entry.value)
        inputs.color.set(entry.color)
        inputs.label.set(entry.label)
    }

    notifyChange({color, value, label}) {
        const {entry, onChange, inputs, form} = this.props
        const updatedEntry = {
            id: entry.id,
            color: color === undefined ? inputs.color.value : color,
            value: parseInt(value === undefined ? inputs.value.value : value),
            label: label === undefined ? inputs.label.value : label
        }
        onChange(updatedEntry, form.isInvalid())
    }
}

const Entry = compose(
    _Entry,
    form({fields: entryFields, constraints: entryConstraints})
)

class ColorInput extends React.Component {
    state = {swap: false}
    colorInputRef = React.createRef()

    render() {
        const {input, invalid, onChange} = this.props
        const {swap} = this.state
        return (
            <div className={styles.colorContainer}>
                <input
                    type='color'
                    className={styles.colorInput}
                    value={input.value}
                    onChange={({target: {value}}) => {
                        input.set(value)
                        onChange(value)
                    }}
                    ref={this.colorInputRef}
                />
                <Tooltip
                    msg={this.renderTooltip()}
                    delay={0}
                    placement='top'
                    clickTrigger={isMobile()}
                    onVisibleChange={visible => swap && !visible && this.setState({swap: false})}>
                    <div
                        className={[styles.color, invalid ? styles.invalid : ''].join(' ')}
                        style={{'--color': input.value}}
                    />
                </Tooltip>
            </div>
        )
    }

    renderTooltip() {
        const {swap} = this.state
        return swap
            ? this.renderSwap()
            : this.renderColorButtons()
    }

    renderColorButtons() {
        return (
            <ButtonGroup layouy='horizontal-nowrap'>
                <Button
                    icon='pen'
                    chromeless
                    shape='circle'
                    size='small'
                    tooltip={msg('map.legendBuilder.colors.edit.tooltip')}
                    onClick={() => {
                        this.colorInputRef.current.focus()
                        this.colorInputRef.current.click()
                    }}
                />
                <Button
                    icon='exchange-alt'
                    chromeless
                    shape='circle'
                    size='small'
                    tooltip={msg('map.legendBuilder.colors.swap.tooltip')}
                    onClick={() => this.setState({swap: true})}
                />
            </ButtonGroup>)
    }

    renderSwap() {
        const {otherColors, onSwap} = this.props
        return (
            <div className={styles.palette}>
                {otherColors.map((c, i) =>
                    <div
                        key={i}
                        className={[styles.color, styles.swapColor].join(' ')}
                        style={{'--color': c}}
                        onClick={() => {
                            this.setState({swap: false})
                            onSwap(c)
                        }}
                    />
                )}
            </div>
        )
    }
}
