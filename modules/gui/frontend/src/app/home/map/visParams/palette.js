import {Button} from 'widget/button'
import {ButtonGroup} from 'widget/buttonGroup'
import {Input} from 'widget/input'
import {Layout} from 'widget/layout'
import {PalettePreSets} from './palettePreSets'
import {Widget} from 'widget/widget'
import {isMobile} from 'widget/userAgent'
import {msg} from 'translate'
import Color from 'color'
import React from 'react'
import Tooltip from 'widget/tooltip'
import guid from 'guid'
import styles from './palette.module.css'

export class Palette extends React.Component {
    state = {
        text: null,
        edit: null,
        show: 'palette'
    }

    constructor(props) {
        super(props)
        this.applyPreset = this.applyPreset.bind(this)
    }

    render() {
        const {className} = this.props
        return (
            <Widget
                label={msg('map.visParams.form.palette.label')}
                labelButtons={this.labelButtons()}
                layout={'vertical'}
                className={className}>
                <Layout className={styles.paletteRow}>
                    {this.renderPalette()}
                    {this.renderText()}
                </Layout>
                <PalettePreSets onSelect={this.applyPreset} count={20}/>
            </Widget>
        )
    }

    renderText() {
        const {show, text} = this.state
        if (show !== 'text') {
            return null
        }
        return (
            <Input
                className={styles.widget}
                value={text}
                placeholder={msg('map.visParams.form.palette.text.placeholder')}
                onChange={({target: {value}}) => this.updateText(value)}
            />
        )
    }

    renderPalette() {
        const {edit, show} = this.state
        if (show !== 'palette') {
            return null
        }
        const {input} = this.props
        const colorInputs = (input.value || []).map(({color, id}, i) =>
            <ColorInput
                key={id}
                color={color}
                onInsert={() => this.insertColor(i)}
                onRemove={() => this.removeColor(id)}
                onBlur={() => {
                    this.setState({edit: null})
                }}
                onChange={color => {
                    this.updateColor(color, id)
                }}
                onEdit={() => this.setState({edit: id})}
                edit={edit === id}
            />
        )
        const noColors =
            <div className={styles.noData}>
                Empty palette, using gray scale.
            </div>
        return (
            <div className={styles.palette}>
                {colorInputs.length
                    ? colorInputs
                    : noColors}
            </div>
        )
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
                tooltip={msg('map.visParams.form.palette.add.tooltip')}
                onClick={() => this.addColor()}
            />,
            show === 'palette'
                ? (
                    <Button
                        key={'text'}
                        icon='font'
                        chromeless
                        shape='circle'
                        size='small'
                        tooltip={msg('map.visParams.form.palette.text.tooltip')}
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
                        tooltip={msg('map.visParams.form.palette.palette.tooltip')}
                        onClick={() => this.showPalette()}
                    />
                )
        ]
    }

    showText() {
        const {input} = this.props
        this.setText(input.value || [])
        this.setState({show: 'text'})
    }

    showPalette() {
        this.setState({show: 'palette'})
    }

    createColor(color, edit) {
        return {
            id: guid(),
            color,
            edit,
        }
    }

    addColor() {
        const {input} = this.props
        const palette = input.value || []
        const color = this.createColor('#000000')
        this.setColors([...palette, color])
        this.setState({edit: color.id})
    }

    insertColor(index) {
        const {input} = this.props
        const palette = input.value || []
        const color = this.createColor('#000000')
        this.setColors([...palette.slice(0, index), color, ...palette.slice(index)])
        this.setState({edit: color.id})
    }

    removeColor(idToRemove) {
        const {input} = this.props
        const palette = input.value || []
        this.setColors(palette.filter(({id}) => id !== idToRemove))
    }

    updateColor(color, idToUpdate) {
        const {input} = this.props
        const palette = input.value || []
        this.setColors(
            palette.map(colorEntry => ({
                ...colorEntry,
                color: colorEntry.id === idToUpdate ? color : colorEntry.color
            }))
        )
        this.setState({edit: null})
    }

    setColors(colors) {
        const {input} = this.props
        input.set(colors)
        this.setText(colors)
    }

    setText(colors) {
        const text = colors
            .map(({color}) => color)
            .join(', ')
        this.setState({text, edit: null})
    }

    applyPreset(colors) {
        this.setColors(colors.map(color => this.createColor(color)))
    }

    updateText(value) {
        const {input} = this.props
        this.setState({text: value})
        if (value) {
            const colors = value
                .replace(/[^\w,#]/g, '')
                .split(',')
                .map(color => {
                    try {
                        return this.createColor(Color(color.trim()).hex())
                    } catch(_error) {
                        return null // Malformatted color
                    }
                })
                .filter(color => color)
            input.set(colors)
        } else {
            input.set([])
        }
    }
}

class ColorInput extends React.Component {
    element = null

    constructor(props) {
        super(props)
        this.initRef = this.initRef.bind(this)
    }

    render() {
        const {color, onBlur, onChange} = this.props
        return (
            <div className={styles.colorContainer}>
                <input
                    type='color'
                    className={styles.colorInput}
                    value={Color(color).hex()}
                    onChange={({target: {value}}) => onChange(value)}
                    onBlur={() => onBlur()}
                    ref={this.initRef}
                />
                <Tooltip
                    msg={this.renderColorButtons()}
                    delay={0}
                    placement={'bottom'}
                    clickTrigger={isMobile()}>
                    <div
                        className={styles.color}
                        style={{'--color': Color(color).hex()}}
                    />
                </Tooltip>
            </div>
        )
    }

    renderColorButtons() {
        const {onEdit, onInsert, onRemove} = this.props
        return (
            <ButtonGroup layouy='horizontal-nowrap'>
                <Button
                    icon='plus'
                    chromeless
                    shape='circle'
                    size='small'
                    tooltip={msg('map.visParams.form.palette.color.insert.tooltip')}
                    onClick={() => onInsert()}
                />
                <Button
                    icon='pen'
                    chromeless
                    shape='circle'
                    size='small'
                    tooltip={msg('map.visParams.form.palette.color.edit.tooltip')}
                    onClick={() => {
                        onEdit()
                        this.element.focus()
                        this.element.click()
                    }}
                />
                <Button
                    icon='trash'
                    chromeless
                    shape='circle'
                    size='small'
                    tooltip={msg('map.visParams.form.palette.color.remove.tooltip')}
                    onClick={() => onRemove()}
                />
            </ButtonGroup>)
    }

    initRef(element) {
        this.element = element
        const {edit} = this.props
        if (edit) {
            setTimeout(
                () => this.element && this.element.click()
            )
        }
    }
}
