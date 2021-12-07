import {Button} from 'widget/button'
import {DraggableList} from 'widget/draggableList'
import {Layout} from 'widget/layout'
import {NoData} from 'widget/noData'
import {PaletteColor} from './paletteColor'
import {PalettePreSets} from './palettePreSets'
import {Textarea} from 'widget/input'
import {Widget} from 'widget/widget'
import {msg} from 'translate'
import Color from 'color'
import PropTypes from 'prop-types'
import React from 'react'
import guid from 'guid'

export class Palette extends React.Component {
    // drag$ = new Subject()
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
        const {edit, showTextInput} = this.state
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
                        disabled={edit}
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
        const {edit} = this.state
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
                    onChange={items => this.updatePalette(items)}
                    onRelease={id => this.removeColor(id)}>
                    {({color, id}, index) => (
                        <PaletteColor
                            id={id}
                            color={color}
                            onInsert={() => this.insertColor(index)}
                            onRemove={() => this.removeColor(id)}
                            onClick={() => this.setState(({edit}) => ({edit: edit ? null : id}))}
                            onChange={color => this.updateColor(color, id)}
                            edit={edit === id}
                        />
                    )}
                </DraggableList>
                {this.renderAddPaletteColorButton()}
            </Layout>
        )
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
                key={'add'}
                chromeless
                icon='plus'
                size='small'
                width='fill'
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
                key={'showHexColorCode'}
                look={showTextInput ? 'selected' : 'default'}
                size='small'
                shape='pill'
                air='less'
                label={'HEX'}
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
            id: guid(),
            color,
            edit,
        }
    }

    updatePalette(palette) {
        // this.setColors([...palette])
        this.setColors(palette)
    }

    addColor() {
        const {input} = this.props
        const palette = input.value || []
        const color = this.createColor()
        this.setColors([...palette, color])
        this.setState({edit: color.id})
    }

    insertColor(index) {
        const {input} = this.props
        const palette = input.value || []
        const color = this.createColor()
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

Palette.propTypes = {
    input: PropTypes.object.isRequired
}
