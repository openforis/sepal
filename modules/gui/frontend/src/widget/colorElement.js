import {Button} from 'widget/button'
import {isMobile} from 'widget/userAgent'
import {msg} from 'translate'
import Icon from 'widget/icon'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'
import styles from './colorElement.module.css'

export class ColorElement extends React.Component {
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
        const {color, size, tooltip, tooltipPlacement, onTooltipVisibleChange, onChange, onClick} = this.props
        return (
            <Button
                air='less'
                shape='rectangle'
                size={size}
                additionalClassName={styles.color}
                style={{'--color': color}}
                tooltip={tooltip}
                tooltipClickTrigger={isMobile()}
                tooltipDelay={0}
                tooltipPlacement={tooltipPlacement}
                tooltipVisible={onTooltipVisibleChange}
                onClick={() => onChange ? this.showColorPicker() : onClick}
            >
                {this.renderInput()}
            </Button>
        )
    }

    renderInput() {
        const {color, onFocus, onBlur} = this.props
        return (
            <input
                ref={this.colorInputRef}
                className={styles.colorInput}
                type='color'
                value={color}
                onFocus={onFocus}
                onBlur={onBlur}
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
    
    hideColorPicker() {
        this.colorInputRef.current.blur()
    }
    
    componentDidMount() {
        const {edit} = this.props
        if (!_.isNil(edit)) {
            edit ? this.showColorPicker() : this.hideColorPicker()
        }
    }
}

ColorElement.defaultProps = {
    color: '',
    size: 'normal'
}
 
ColorElement.propTypes = {
    color: PropTypes.string,
    edit: PropTypes.any,
    invalid: PropTypes.any,
    size: PropTypes.any,
    tooltip: PropTypes.any,
    tooltipPlacement: PropTypes.any,
    onBlur: PropTypes.func,
    onChange: PropTypes.func,
    onClick: PropTypes.func,
    onFocus: PropTypes.func,
    onTooltipVisibleChange: PropTypes.func
}
