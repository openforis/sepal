import {Button} from 'widget/button'
import {HexColorPicker} from 'react-colorful'
import {Subject, debounceTime} from 'rxjs'
import {compose} from 'compose'
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
import withSubscriptions from 'subscription'

const DEBOUNCE_TIME_MS = 50

class _ColorElement extends React.Component {
    ref = React.createRef()
    color$ = new Subject()

    state = {
        showColorPicker: false,
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
        const {showColorPicker} = this.state
        return (
            <div className={styles.container}>
                {this.renderButton()}
                {invalid ? this.renderWarning() : null}
                {showColorPicker ? this.renderColorPicker() : null}
            </div>
        )
    }

    renderButton() {
        const {color, size, tooltip, tooltipPlacement, onTooltipVisibleChange} = this.props
        return (
            <Button
                ref={this.ref}
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
        const {onClick, onBlur, edit} = this.props
        return _.isNil(onClick) || _.isNil(onBlur) || _.isNil(edit)
    }

    onClick() {
        const {onClick, onChange} = this.props
        this.isInternallyControlled() && onChange
            ? this.showColorPicker()
            : onClick && onClick()
    }

    onBlur() {
        const {onBlur, onChange} = this.props
        this.isInternallyControlled() && onChange
            ? this.hideColorPicker()
            : onBlur && onBlur()
    }

    onChange(value) {
        this.color$.next(value)
    }

    showColorPicker() {
        const {showColorPicker} = this.state
        showColorPicker || this.setState({showColorPicker: true})
    }
    
    hideColorPicker() {
        const {showColorPicker} = this.state
        showColorPicker && this.setState({showColorPicker: false})
    }
    
    static getDerivedStateFromProps(props) {
        const {edit} = props
        return _.isNil(edit)
            ? null
            : {showColorPicker: edit}
    }

    componentDidMount() {
        const {onChange, addSubscription} = this.props
        addSubscription(
            this.color$.pipe(
                debounceTime(DEBOUNCE_TIME_MS)
            ).subscribe(
                value => onChange && onChange(value)
            )
        )
    }
}

export const ColorElement = compose(
    _ColorElement,
    withSubscriptions()
)

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
    onTooltipVisibleChange: PropTypes.func
}
