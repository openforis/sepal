import React from 'react'
import Rx from 'rxjs'
import Icon from 'widget/icon'
import styles from './button2.module.css'
import PropTypes from 'prop-types'

export class HoldButton extends React.Component {
    constructor(props) {
        super(props)
        this.button = React.createRef()
    }
    render() {
        const {icon, tabIndex, className, ...props} = this.props
        return (
            <button
                ref={this.button}
                className={[styles.hold, className].join(' ')}
                tabIndex={tabIndex}
                {...props}>
                <Icon name={icon}/>
            </button>
        )
    }
    componentDidMount() {
        const button = this.button.current
        const buttonMouseDown$ = Rx.Observable.fromEvent(button, 'mousedown')
        const buttonMouseLeave$ = Rx.Observable.fromEvent(button, 'mouseleave')
        const buttonMouseUp$ = Rx.Observable.fromEvent(button, 'mouseup')
        const windowMouseUp$ = Rx.Observable.fromEvent(window, 'mouseup')
        const cancel$ = Rx.Observable.merge(buttonMouseLeave$, windowMouseUp$)
        
        buttonMouseDown$
            .switchMap(() => {
                return Rx.Observable.timer(750).takeUntil(cancel$)
                    .switchMap(() => {
                        return buttonMouseUp$.takeUntil(cancel$).take(1)
                    })
            })
            .subscribe(() => {
                if (this.props.onClickHold && !this.props.disabled) {
                    this.props.onClickHold()
                }
            })
        
    }
}

HoldButton.propTypes = {
    icon: PropTypes.string,
    // onClick: PropTypes.func,
    onClickHold: PropTypes.func,
    // clickHoldTime: PropTypes.number,
    tabIndex: PropTypes.number,
    disabled: PropTypes.bool,
    className: PropTypes.string,
    children: PropTypes.any
}
