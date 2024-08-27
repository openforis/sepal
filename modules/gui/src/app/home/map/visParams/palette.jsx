import Color from 'color'
import PropTypes from 'prop-types'
import React from 'react'

import {msg} from '~/translate'
import {uuid} from '~/uuid'
import {Button} from '~/widget/button'
import {ColorElement} from '~/widget/colorElement'
import {DraggableList} from '~/widget/draggableList'
import {Textarea} from '~/widget/input'
import {Layout} from '~/widget/layout'
import {NoData} from '~/widget/noData'
import {Widget} from '~/widget/widget'

import styles from './palette.module.css'
import {PalettePreSets} from './palettePreSets'

export class Palette extends React.Component {
    ref = React.createRef()

    state = {
        text: null,
        edit: null,
        showTextInput: false
    }

    constructor(props) {
        super(props)
        this.applyPreset = this.applyPreset.bind(this)
    }

    render() {
        const {showTextInput} = this.state
        return (
            <Layout type='vertical'>
                <Widget
                    label={msg('map.visParams.form.palette.label')}
                    tooltip={msg('map.visParams.form.palette.tooltip')}
                    labelButtons={[
                        this.renderInputModeButton()
                    ]}
                    spacing='compact'
                >
                    {this.renderPalette()}
                    {showTextInput ? this.renderTextInput() : null}
                    <PalettePreSets
                        onSelect={this.applyPreset} count={20}
                    />
                </Widget>
            </Layout>
        )
    }

    renderTextInput() {
        const {text} = this.state
        return (
            <Textarea
                value={text}
                placeholder={msg('map.visParams.form.palette.text.placeholder')}
                minRows={3}
                maxRows={3}
                onChange={({target: {value}}) => this.updateText(value)}
            />
        )
    }

    renderPalette() {
        const {input} = this.props
        const colors = input.value || []
        return (
            <Layout
                ref={this.ref}
                type='horizontal'
                spacing='tight'
                alignment='left'
                framed>
                <DraggableList
                    items={colors}
                    itemId={item => item.id}
                    containerElement={this.ref.current}
                    itemRenderer={(item, {original}) => this.renderPaletteItem(item, original)}
                    onDragStart={() => this.setState({edit: null})}
                    onChange={items => this.updatePalette(items)}
                    onReleaseOutside={id => this.removeColor(id)}
                />
                {this.renderAddPaletteColorButton()}
            </Layout>
        )
    }

    renderPaletteItem({color, id}, original) {
        const {edit} = this.state
        return original
            ? (
                <ColorElement
                    className={styles.element}
                    color={color}
                    edit={edit === id}
                    onClick={() => this.onClick(id)}
                    onChange={color => this.updateColor(color, id)}
                />
            )
            : (
                <ColorElement
                    className={styles.element}
                    color={color}
                    size='tall'
                />
            )
    }

    onClick(id) {
        this.setState(({edit}) => ({edit: edit === id ? null : id}))
    }

    renderNoData() {
        return (
            <NoData message={msg('map.visParams.form.palette.empty')}/>
        )
    }
    renderAddPaletteColorButton() {
        const {showTextInput} = this.state
        return (
            <Button
                key='add'
                chromeless
                additionalClassName={styles.element}
                icon='plus'
                air='none'
                disabled={showTextInput}
                tooltip={msg('map.visParams.form.palette.add.tooltip')}
                onClick={() => this.addColor()}
            />
        )
    }

    renderInputModeButton() {
        const {showTextInput} = this.state
        return (
            <Button
                key='showHexColorCode'
                look={showTextInput ? 'selected' : 'default'}
                size='small'
                shape='pill'
                air='less'
                label='HEX'
                tooltip={msg(showTextInput ? 'map.visParams.form.palette.tooltip' : 'map.visParams.form.palette.text.tooltip')}
                onClick={() => showTextInput ? this.showPalette() : this.showTextInput()}
            />
        )
    }

    isPaletteEmpty() {
        const {input} = this.props
        const colors = input.value || []
        return colors.length === 0
    }

    showTextInput() {
        const {input} = this.props
        this.setText(input.value || [])
        this.setState({showTextInput: true})
    }

    showPalette() {
        this.setState({showTextInput: false})
    }

    createColor(color = '#000000', edit) {
        return {
            id: uuid(),
            color,
            edit,
        }
    }

    updatePalette(palette) {
        this.setColors(palette)
    }

    addColor() {
        const {input} = this.props
        const palette = input.value || []
        const color = this.createColor()
        this.setColors([...palette, color])
        this.setState({edit: color.id})
    }

    removeColor(idToRemove) {
        const {input} = this.props
        const palette = input.value || []
        this.setColors(palette.filter(({id}) => id !== idToRemove))
    }

    updateColor(color, id) {
        const {input} = this.props
        const palette = input.value || []
        this.setColors(
            palette.map(colorEntry => ({
                ...colorEntry,
                color: colorEntry.id === id ? color : colorEntry.color
            }))
        )
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

Palette.propTypes = {
    input: PropTypes.object.isRequired
}
