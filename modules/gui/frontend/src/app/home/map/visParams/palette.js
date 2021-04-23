import {Button} from 'widget/button'
import {Input} from 'widget/input'
import {Widget} from 'widget/widget'
import Color from 'color'
import React from 'react'
import styles from './palette.module.css'

export class Palette extends React.Component {
    state = {
        edit: null
    }

    render() {
        const {edit} = this.state
        return edit === null
            ? this.renderPalette()
            : this.renderText()
    }

    renderText() {
        const {className} = this.props
        const {edit} = this.state
        return (
            <Input
                label={'Palette'}
                value={edit}
                className={className}
                autoFocus
                onChange={({target: {value}}) => this.updateEdit(value)}
                onBlur={({target: {value}}) => this.hideEdit(value)}
            />
        )
    }

    renderPalette() {
        const {className, input} = this.props
        const colorInputs = (input.value || []).map((color, i) =>
            <Input
                key={`color-${i}`}
                className={styles.color}
                type='color'
                value={Color(color).hex()}
                border={false}
                onChange={({target: {value}}) => this.updateColor(value, i)}
                tooltip={'test'}
            />
        )
        return (
            <Widget
                label={'Palette'}
                className={[className, styles.palette].join(' ')}
                layout='horizontal'>
                {colorInputs}
                <Button
                    icon='plus'
                    chromeless
                    shape='circle'
                    size='small'
                    onClick={() => this.addColor()}
                />
                <Button
                    icon='minus'
                    chromeless
                    shape='circle'
                    size='small'
                    disabled={!(input.value || []).length}
                    onClick={() => this.removeColor()}
                />
                <Button
                    icon='edit'
                    chromeless
                    shape='circle'
                    size='small'
                    onClick={() => this.showEdit()}
                />
            </Widget>
        )
    }

    addColor() {
        const {input} = this.props
        const palette = input.value || []
        input.set([...palette, '#000000'])
    }

    removeColor() {
        const {input} = this.props
        const palette = input.value || []
        input.set([...palette.slice(0, palette.length - 1)])
    }

    updateColor(color, index) {
        const {input} = this.props
        const palette = input.value || []
        input.set(palette.map((prevColor, i) =>
            i === index ? color : prevColor
        ))
    }

    showEdit() {
        const {input} = this.props
        const palette = input.value || []
        this.setState({edit: palette.join(', ')})
    }

    updateEdit(value) {
        this.setState({edit: value})
    }

    hideEdit(value) {
        const {input} = this.props
        input.set(value
            .split(',')
            .map(color => Color(color.trim()).hex()))
        this.setState({
            edit: null
        })

    }
}
