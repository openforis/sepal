import {Button} from 'widget/button'
import {isMobile} from 'widget/userAgent'
import {msg} from 'translate'
import Icon from 'widget/icon'
import PropTypes from 'prop-types'
import React from 'react'
import styles from './legendColor.module.css'

export class LegendColor extends React.Component {
    colorInputRef = React.createRef()

    constructor() {
        super()
        this.onClick = this.onClick.bind(this)
        this.onChange = this.onChange.bind(this)
    }

    render() {
        const {invalid} = this.props
        return (
            <div className={styles.container}>
                {this.renderButton()}
                {invalid ? this.renderWarning() : null}
            </div>
        )
    }

    renderButton() {
        const {color, tooltip, tooltipPlacement, onTooltipVisibleCahange, onChange, onClick} = this.props
        return (
            <Button
                air='less'
                shape='rectangle'
                size='small'
                additionalClassName={styles.color}
                style={{'--color': color}}
                tooltip={tooltip}
                tooltipClickTrigger={isMobile()}
                tooltipDelay={0}
                tooltipPlacement={tooltipPlacement}
                tooltipVisible={onTooltipVisibleCahange}
                onClick={() => onChange ? this.showColorPicker() : onClick}
            >
                {this.renderInput()}
            </Button>
        )
    }

    renderInput() {
        const {color} = this.props
        return (
            <input
                ref={this.colorInputRef}
                className={styles.colorInput}
                type='color'
                value={color}
                onChange={this.onChange}
            />
        )
    }

    renderWarning() {
        return (
            <div className={styles.badgeContainer}>
                <Icon
                    className={styles.badge}
                    name='circle'
                    variant='error'
                />
                <Icon
                    className={styles.badge}
                    name='exclamation-circle'
                    tooltip={msg('map.legendBuilder.entry.error.invalidColor')}
                    tooltipPlacement='right'
                />
            </div>
        )
    }

    onClick() {
        this.showColorPicker()
    }

    onChange({target: {value}}) {
        const {onChange} = this.props
        onChange && onChange(value)
    }

    showColorPicker() {
        this.colorInputRef.current.focus()
        this.colorInputRef.current.click()
    }
}

LegendColor.propTypes = {
    color: PropTypes.string,
    invalid: PropTypes.any,
    tooltip: PropTypes.any,
    tooltipPlacement: PropTypes.any,
    onChange: PropTypes.func,
    onClick: PropTypes.func,
    onTooltipVisibleChange: PropTypes.func
}
