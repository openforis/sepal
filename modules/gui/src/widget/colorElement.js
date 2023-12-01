import {Button} from 'widget/button'
import {HexColorPicker} from 'react-colorful'
import {isMobile} from 'widget/userAgent'
import {msg} from 'translate'
import FloatingBox from 'widget/floatingBox'
import Icon from 'widget/icon'
import Keybinding from 'widget/keybinding'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'
import _css from './colorElement.css'
import styles from './colorElement.module.css'

export class ColorElement extends React.Component {
    ref = React.createRef()

    state = {
        edit: false,
        color: null
    }

    constructor() {
        super()
        this.onBlur = this.onBlur.bind(this)
        this.onClick = this.onClick.bind(this)
        this.onChange = this.onChange.bind(this)
    }

    render() {
        const {invalid} = this.props
        const {edit} = this.state
        return (
            <div className={styles.container}>
                {this.renderButton()}
                {invalid ? this.renderWarning() : null}
                {edit ? this.renderColorPicker() : null}
            </div>
        )
    }

    renderButton() {
        const {className, tooltip, tooltipPlacement} = this.props
        const {color} = this.state
        return (
            <Button
                ref={this.ref}
                air='less'
                shape='rectangle'
                additionalClassName={[
                    color ? styles.color : styles.placeholder,
                    className
                ].join(' ')}
                style={{'--color': color}}
                tooltip={tooltip}
                tooltipClickTrigger={isMobile()}
                tooltipDelay={0}
                tooltipPlacement={tooltipPlacement}
                onClick={this.onClick}
            />
        )
    }

    renderColorPicker() {
        const {color} = this.props
        return (
            <Keybinding keymap={{'Escape': this.onBlur}}>
                <FloatingBox
                    element={this.ref.current}
                    className={[styles.colorPicker, 'colorPicker'].join(' ')}
                    onBlur={this.onBlur}>
                    <HexColorPicker
                        color={color}
                        onChange={this.onChange}
                    />
                </FloatingBox>
            </Keybinding>

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

    isInternallyControlled() {
        const {onChange, edit} = this.props
        return _.isNil(edit) && !_.isNil(onChange)
    }

    onClick() {
        const {onClick} = this.props
        this.isInternallyControlled() && this.showColorPicker()
        onClick && onClick()
    }

    onBlur() {
        this.updateColor()
        this.isInternallyControlled() && this.hideColorPicker()
    }

    onChange(color) {
        this.setState({color})
    }

    updateColor() {
        const {onChange} = this.props
        const {color} = this.state
        onChange && onChange(color)
    }

    toggleColorPicker() {
        this.setState(({edit}) => ({edit: !edit}))
    }
    
    showColorPicker() {
        this.setState({edit: true})
    }
    
    hideColorPicker() {
        this.setState({edit: false})
    }
    
    static getDerivedStateFromProps(props) {
        const {edit} = props
        return !_.isNil(edit) ? {edit} : null
    }

    componentDidMount() {
        const {color} = this.props
        this.setState({color})
    }

    componentDidUpdate({color: prevColor, edit: prevEdit}) {
        const {color, edit} = this.props
        if (color !== prevColor) {
            this.setState({color})
        }
        if (edit === false && prevEdit === true) {
            this.updateColor()
        }
    }
}

ColorElement.propTypes = {
    className: PropTypes.string,
    color: PropTypes.string,
    edit: PropTypes.any,
    invalid: PropTypes.any,
    tooltip: PropTypes.any,
    tooltipPlacement: PropTypes.any,
    onChange: PropTypes.func,
    onClick: PropTypes.func
}

ColorElement.defaultProps = {
    color: ''
}
