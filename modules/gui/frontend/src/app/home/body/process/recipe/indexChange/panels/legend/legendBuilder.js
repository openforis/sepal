import {Button} from 'widget/button'
import {ButtonGroup} from 'widget/buttonGroup'
import {Form, form} from 'widget/form/form'
import {Layout} from 'widget/layout'
import {PalettePreSets, pickColors} from 'app/home/map/visParams/palettePreSets'
import {compose} from 'compose'
import {isMobile} from 'widget/userAgent'
import {msg} from 'translate'
import Color from 'color'
import React from 'react'
import RemoveButton from 'widget/removeButton'
import Tooltip from 'widget/tooltip'
import _ from 'lodash'
import styles from './legendBuilder.module.css'

export class LegendBuilder extends React.Component {
    state = {
        invalidEntries: {}
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
            <div className={styles.noEntries}>
                {msg('map.legendBuilder.noEntries')}
            </div>
        )
    }

    renderEntries() {
        const {entries} = this.props
        return (
            <div className={styles.entries}>
                <Layout type='vertical' spacing='compact'>
                    {entries.map((entry, i) => this.renderEntry(entry, i === entries.length - 1))}
                </Layout>
                <PalettePreSets onSelect={this.applyPreset} count={entries.length} className={styles.palettePreSets} autoFocus={false}/>
            </div>
        )
    }

    renderEntry(entry, last) {
        const {colorMode, entries, locked} = this.props
        return <Layout key={entry.id} type={'horizontal-nowrap'}>
            <Entry
                mode={colorMode}
                entry={entry}
                entries={entries}
                onChange={this.updateEntry}
                onValidate={this.updateValidation}
                onSwap={color => this.swap(color, entry.color)}
                locked={locked}
                autoFocus={last}
            />
            <RemoveButton
                message={msg('map.legendBuilder.entry.confirmation')}
                size='small'
                disabled={locked}
                onRemove={() => this.removeEntry(entry)}/>
        </Layout>
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
            return invalid
                ? {invalidEntries: {...invalidEntries, ...{[entry.id]: invalid}}}
                : {invalidEntries: _.omit(invalidEntries, entry.id)}
        }, () => onChange(entries, this.hasInvalidEntries()))

    }

    hasInvalidEntries() {
        const {invalidEntries} = this.state
        return !!Object.keys(invalidEntries).length
    }

    removeEntry(entry) {
        const {entries, onChange} = this.props
        onChange(entries.filter(({id}) => id !== entry.id), this.hasInvalidEntries())
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
        .notBlank(),
    from: new Form.Field()
        .number(),
    to: new Form.Field()
        .number()
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
        return (
            <Layout type='vertical' spacing='compact'>
                {this.renderBasics()}
                {this.renderRange()}
            </Layout>
        )
    }

    renderRange() {
        const {inputs: {from, to}} = this.props
        return (
            <Layout type='horizontal-nowrap' className={styles.range}>
                <Form.Input
                    placeholder={'From'}
                    input={from}
                    errorMessage
                    autoComplete={false}
                    onChange={e => this.notifyChange({from: e.target.value})}
                />

                <Form.Input
                    placeholder={'To'}
                    input={to}
                    errorMessage
                    autoComplete={false}
                    onChange={e => this.notifyChange({to: e.target.value})}
                />
            </Layout>
        )
    }

    renderBasics() {
        const {form, entry, entries, mode, locked, inputs: {value, color, label}, onSwap} = this.props
        const otherColors = entries
            .filter(({id}) => entry.id !== id)
            .map(({color}) => color)
        return (
            <Layout type='horizontal-nowrap' className={styles.basics}>
                {mode === 'palette'
                    ? (
                        <ColorInput
                            input={color}
                            otherColors={otherColors}
                            onChange={color => this.notifyChange({color})}
                            onSwap={color => onSwap(color)}
                            invalid={!!form.errors.colorUnique}
                            disabled={locked}
                        />
                    )
                    : (
                        <Form.Input
                            className={styles.colorText}
                            input={color}
                            errorMessage={[color, 'colorUnique']}
                            autoComplete={false}
                            disabled={locked}
                            onChange={e => this.notifyChange({color: e.target.value})}
                        />
                    )}

                <Form.Input
                    className={styles.value}
                    input={value}
                    errorMessage={[value, 'valueUnique']}
                    autoComplete={false}
                    disabled={locked}
                    onChange={e => this.notifyChange({value: e.target.value})}
                />

                <Form.Input
                    className={styles.label}
                    input={label}
                    placeholder={msg('map.legendBuilder.entry.classLabel.placeholder')}
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
        inputs.from.set(entry.from)
        inputs.to.set(entry.to)
    }

    notifyChange({color, value, label, from, to}) {
        const {entry, onChange, inputs, form} = this.props
        const updatedEntry = {
            id: entry.id,
            color: color === undefined ? inputs.color.value : color,
            value: toInt(value === undefined ? inputs.value.value : value),
            label: label === undefined ? inputs.label.value : label,
            from: toInt(from === undefined ? inputs.from.value : from),
            to: toInt(to === undefined ? inputs.to.value : to)
        }
        onChange(updatedEntry, form.isInvalid())
    }
}

const toInt = s => {
    return _.isFinite(parseInt(s)) ? parseInt(s) : undefined
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
                    autoFocus={true}
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

const COLORS = [
    '#FFB300',  // Vivid Yellow
    '#803E75',  // Strong Purple
    '#FF6800',  // Vivid Orange
    '#A6BDD7',  // Very Light Blue
    '#C10020',  // Vivid Red
    '#CEA262',  // Grayish Yellow
    '#817066',  // Medium Gray
    '#007D34',  // Vivid Green
    '#F6768E',  // Strong Purplish Pink
    '#00538A',  // Strong Blue
    '#FF7A5C',  // Strong Yellowish Pink
    '#53377A',  // Strong Violet
    '#FF8E00',  // Vivid Orange Yellow
    '#B32851',  // Strong Purplish Red
    '#F4C800',  // Vivid Greenish Yellow
    '#7F180D',  // Strong Reddish Brown
    '#93AA00',  // Vivid Yellowish Green
    '#593315',  // Deep Yellowish Brown
    '#F13A13',  // Vivid Reddish Orange
    '#232C16'  // Dark Olive Green
]
export const defaultColor = i => i < COLORS.length ? COLORS[i] : COLORS[COLORS.length - 1]
