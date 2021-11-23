import {Button} from 'widget/button'
import {ButtonGroup} from 'widget/buttonGroup'
import {ColorElement} from 'widget/colorElement'
import {msg} from 'translate'
import PropTypes from 'prop-types'
import React from 'react'

export class PaletteColor extends React.Component {
    render() {
        const {color, edit, onClick, onBlur, onChange} = this.props
        return (
            <ColorElement
                color={color}
                size='large'
                autoPicker
                tooltip={this.renderTooltip()}
                tooltipPlacement='top'
                edit={edit}
                onClick={onClick}
                onBlur={onBlur}
                onChange={value => onChange(value)}
            />
        )
    }

    renderTooltip() {
        return (
            <ButtonGroup layouy='horizontal-nowrap'>
                {this.renderAddButton()}
                {this.renderRemoveButton()}
            </ButtonGroup>
        )
    }

    renderAddButton() {
        const {onInsert} = this.props
        return (
            <Button
                icon='plus'
                chromeless
                shape='circle'
                size='small'
                tooltip={msg('map.visParams.form.palette.color.insert.tooltip')}
                onClick={onInsert}
            />
        )
    }

    renderRemoveButton() {
        const {onRemove} = this.props
        return (
            <Button
                icon='trash'
                chromeless
                shape='circle'
                size='small'
                tooltip={msg('map.visParams.form.palette.color.remove.tooltip')}
                onClick={onRemove}
            />
        )
    }
}

PaletteColor.poropTypes = {
    color: PropTypes.string,
    edit: PropTypes.any,
    onBlur: PropTypes.func,
    onClick: PropTypes.func,
    onChange: PropTypes.func,
    onInsert: PropTypes.func,
    onRemove: PropTypes.func
}
