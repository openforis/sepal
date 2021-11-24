import {Button} from 'widget/button'
import {Input} from 'widget/input'
import {Layout} from 'widget/layout'
import {NoData} from 'widget/noData'
import {PaletteColor} from './paletteColor'
import {PalettePreSets} from './palettePreSets'
import {Widget} from 'widget/widget'
import {msg} from 'translate'
import Color from 'color'
import React from 'react'
import guid from 'guid'

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
        const {show} = this.state
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
                    {show === 'text' ? this.renderTextInput() : null}
                    <PalettePreSets onSelect={this.applyPreset} count={20}/>
                </Widget>
            </Layout>
        )
    }

    renderTextInput() {
        const {text} = this.state
        return (
            <Input
                value={text}
                placeholder={msg('map.visParams.form.palette.text.placeholder')}
                onChange={({target: {value}}) => this.updateText(value)}
            />
        )
    }

    renderPalette() {
        return (
            <Layout type='horizontal' spacing='tight' alignment='left' framed>
                {this.renderPaletteColors()}
                {this.renderAddPaletteColorButton()}
            </Layout>
        )
    }

    renderPaletteColors() {
        const {input} = this.props
        const colors = input.value || []
        return colors.length
            ? colors.map(({color, id}, index) => this.renderPaletteColor({color, id, index}))
            : <NoData message={msg('map.visParams.form.palette.empty')}/>
    }

    renderPaletteColor({color, id, index}) {
        const {edit} = this.state
        return (
            <PaletteColor
                key={id}
                color={color}
                onInsert={() => this.insertColor(index)}
                onRemove={() => this.removeColor(id)}
                onClick={() => this.setState(({edit}) => ({edit: edit ? null : id}))}
                onChange={color => this.updateColor(color, id)}
                edit={edit === id}
            />
        )
    }

    renderAddPaletteColorButton() {
        const {show} = this.state
        return (
            <Button
                key={'add'}
                icon='plus'
                chromeless
                shape='circle'
                size='small'
                disabled={show !== 'palette'}
                tooltip={msg('map.visParams.form.palette.add.tooltip')}
                onClick={() => this.addColor()}
            />
        )
    }

    renderInputModeButton() {
        const {show} = this.state
        const textMode = show === 'text'
        return (
            <Button
                key={'showHexColorCode'}
                look={textMode ? 'selected' : 'default'}
                size='small'
                shape='pill'
                air='less'
                label={'HEX'}
                tooltip={msg(textMode ? 'map.visParams.form.palette.tooltip' : 'map.visParams.form.palette.text.tooltip')}
                onClick={() => textMode ? this.showPalette() : this.showTextInput()}
            />
        )
    }

    showTextInput() {
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
