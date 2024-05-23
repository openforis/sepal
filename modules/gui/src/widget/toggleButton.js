import _ from 'lodash'
import PropTypes from 'prop-types'
import React from 'react'

import {Button} from '~/widget/button'

export class ToggleButton extends React.Component {
    constructor() {
        super()
        this.onChange = this.onChange.bind(this)
    }

    render() {
        const {chromeless} = this.props
        return chromeless
            ? this.renderChromelessButton()
            : this.renderStandardButton()
    }

    renderChromelessButton() {
        const {icon, label, content, tooltip, tooltipPlacement, disabled, look, shape, air, size, tabIndex, width, selected} = this.props
        return (
            <Button
                chromeless
                look={selected ? (look || 'transparent') : 'transparent'}
                shape={shape || 'pill'}
                size={size}
                air={air}
                disabled={disabled}
                icon={icon}
                label={label}
                labelStyle={selected ? 'smallcaps-highlight' : 'smallcaps'}
                content={content}
                tooltip={tooltip}
                tooltipPlacement={tooltipPlacement}
                tabIndex={tabIndex}
                width={width}
                onClick={this.onChange}
            />
        )
    }

    renderStandardButton() {
        const {icon, label, content, tooltip, tooltipPlacement, disabled, look, shape, air, size, tabIndex, width, selected} = this.props
        return (
            <Button
                look={selected ? (look || 'highlight') : look || 'default'}
                shape={shape}
                size={size}
                air={air}
                disabled={disabled}
                icon={icon}
                label={label}
                labelStyle='smallcaps'
                content={content}
                tooltip={tooltip}
                tooltipPlacement={tooltipPlacement}
                tabIndex={tabIndex}
                width={width}
                onClick={this.onChange}
            />
        )
    }

    onChange() {
        const {selected, onChange} = this.props
        onChange(!selected)
    }
}

ToggleButton.propTypes = {
    onChange: PropTypes.any.isRequired,
    air: PropTypes.any,
    chromeless: PropTypes.any,
    disabled: PropTypes.any,
    label: PropTypes.any,
    look: PropTypes.string,
    selected: PropTypes.any,
    shape: PropTypes.string,
    size: PropTypes.string,
    tabIndex: PropTypes.number,
    tooltip: PropTypes.any,
    tooltipPlacement: PropTypes.string,
    width: PropTypes.any,
}
