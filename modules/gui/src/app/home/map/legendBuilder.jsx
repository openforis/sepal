import Color from 'color'
import _ from 'lodash'
import React from 'react'

import {compose} from '~/compose'
import {msg} from '~/translate'
import {Button} from '~/widget/button'
import {Form} from '~/widget/form'
import {ColorInput} from '~/widget/form/colorInput'
import {withForm} from '~/widget/form/form'
import {Layout} from '~/widget/layout'
import {NoData} from '~/widget/noData'
import {RemoveButton} from '~/widget/removeButton'
import {Widget} from '~/widget/widget'

import styles from './legendBuilder.module.css'
import {PalettePreSets, pickColors} from './visParams/palettePreSets'

export class LegendBuilder extends React.Component {
    state = {
        invalidEntries: {},
        showHexColorCode: false
    }

    constructor(props) {
        super(props)
        this.applyPreset = this.applyPreset.bind(this)
        this.updateEntry = this.updateEntry.bind(this)
        this.updateValidation = this.updateValidation.bind(this)
    }

    render() {
        const {entries} = this.props
        return entries.length
            ? this.renderEntries()
            : this.renderNoEntries()
    }

    renderNoEntries() {
        return (
            <NoData message={msg('map.legendBuilder.noEntries')}/>
        )
    }

    renderEntries() {
        const {entries} = this.props
        return (
            <Layout type='vertical-fill'>
                <Widget
                    layout='vertical-scrollable'
                    spacing='compact'
                    label={msg('map.legendBuilder.label')}
                    labelButtons={this.renderLabelButtons()}
                    framed>
                    {entries.map((entry, i) => this.renderEntry(entry, i === entries.length - 1))}
                </Widget>
                <PalettePreSets
                    onSelect={this.applyPreset}
                    count={entries.length}
                    className={styles.palettePreSets}
                    autoFocus={false}
                />
            </Layout>
        )
    }

    renderEntry(entry, last) {
        const {entries, locked} = this.props
        const {showHexColorCode} = this.state
        return (
            <Layout key={entry.id} type='horizontal-nowrap'>
                <Entry
                    showHexColorCode={showHexColorCode}
                    entry={entry}
                    entries={entries}
                    onChange={this.updateEntry}
                    onValidate={this.updateValidation}
                    onSwap={color => this.swap(color, entry.color)}
                    locked={locked}
                    autoFocus={last}
                />
                {locked ? null : this.renderRemoveButton(entry)}
            </Layout>
        )
    }

    renderRemoveButton(entry) {
        const {locked} = this.props
        return (
            <RemoveButton
                chromeless
                shape='circle'
                size='small'
                disabled={locked}
                tooltip={msg('map.legendBuilder.entry.remove.tooltip')}
                tooltipPlacement='left'
                onRemove={() => this.removeEntry(entry)}
            />
        )
    }

    renderLabelButtons() {
        const {showHexColorCode} = this.state
        return [
            <Button
                key={'showHexColorCode'}
                look={showHexColorCode ? 'selected' : 'default'}
                size='small'
                shape='pill'
                air='less'
                label={'HEX'}
                onClick={() => this.toggleshowHexColorCode()}
            />
        ]
    }

    toggleshowHexColorCode() {
        this.setState(({showHexColorCode}) => ({showHexColorCode: !showHexColorCode}))
    }

    applyPreset(colors) {
        const {entries, onChange} = this.props
        const mappedColors = pickColors(entries.length, colors)
        onChange(entries.map((entry, i) => ({
            ...entry, color: mappedColors[i]
        })), this.hasInvalidEntries())
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
        ), this.hasInvalidEntries())
    }

    updateEntry(updatedEntry) {
        const {entries, onChange} = this.props
        onChange(entries.map(entry =>
            entry.id === updatedEntry.id
                ? updatedEntry
                : entry
        ), this.hasInvalidEntries())
    }

    updateValidation(entry, invalid) {
        const {entries, onChange} = this.props
        this.setState(({invalidEntries}) => {
            const filteredInvalidEntries = _.pickBy(invalidEntries, entries.map(({id}) => id))
            return invalid
                ? {invalidEntries: {...filteredInvalidEntries, ...{[entry.id]: invalid}}}
                : {invalidEntries: _.omit(filteredInvalidEntries, entry.id)}
        }, () => onChange(entries, this.hasInvalidEntries()))
    }

    hasInvalidEntries() {
        const {invalidEntries} = this.state
        return !!Object.keys(invalidEntries).length
    }

    removeEntry(entry) {
        const {entries, onChange} = this.props
        this.setState(({invalidEntries}) => {
            const filteredInvalidEntries = _.omit(invalidEntries, [entry.id])
            return {invalidEntries: filteredInvalidEntries}
        }, () => {
            onChange(entries.filter(({id}) => id !== entry.id), this.hasInvalidEntries())
        })
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
            } catch (_error) {
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
        const {showHexColorCode} = this.props
        return (
            <Layout type='horizontal-nowrap' className={styles.entry}>
                {this.renderColorPicker()}
                {showHexColorCode ? this.renderHexColor() : null}
                {this.renderValueInput()}
                {this.renderLabelInput()}
            </Layout>
        )
    }

    renderColorPicker() {
        const {form, entry, entries, locked, inputs: {color}, onSwap} = this.props
        const otherColors = entries
            .filter(({id}) => entry.id !== id)
            .map(({color}) => color)
        return (
            <ColorInput
                input={color}
                otherColors={otherColors}
                onChange={color => this.notifyChange({color})}
                onSwap={color => onSwap(color)}
                invalid={!!form.errors.colorUnique}
                disabled={locked}
            />
        )
    }

    renderHexColor() {
        const {inputs: {color}} = this.props
        return (
            <Form.Input
                className={styles.colorText}
                input={color}
                errorMessage={[color, 'colorUnique']}
                autoComplete={false}
                onChange={value => this.notifyChange({color: value})}
            />
        )
    }

    renderValueInput() {
        const {locked, inputs: {value}} = this.props
        return (
            <Form.Input
                className={styles.value}
                input={value}
                type='number'
                errorMessage={[value, 'valueUnique']}
                autoComplete={false}
                disabled={locked}
                onChange={value => this.notifyChange({value})}
            />
        )
    }

    renderLabelInput() {
        const {entry, inputs: {label}} = this.props
        return (
            <Form.Input
                className={styles.label}
                input={label}
                placeholder={msg('map.legendBuilder.entry.classLabel.placeholder')}
                autoFocus={!entry.label}
                errorMessage={[label, 'labelUnique']}
                autoComplete={false}
                onChange={value => this.notifyChange({label: value})}
            />
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
            ...entry,
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
    withForm({fields: entryFields, constraints: entryConstraints})
)
