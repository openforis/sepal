import PropTypes from 'prop-types'
import React from 'react'
import {fromEvent, merge, timer} from 'rxjs'
import {switchMap, take, takeUntil} from 'rxjs/operators'
import Icon from 'widget/icon'
import styles from './button2.module.css'

export class HoldButton extends React.Component {
    constructor(props) {
        super(props)
        this.button = React.createRef()
    }

    render() {
        const {icon, tabIndex, className, onClickHold, ...props} = this.props
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
        const buttonMouseDown$ = fromEvent(button, 'mousedown')
        const buttonMouseLeave$ = fromEvent(button, 'mouseleave')
        const buttonMouseUp$ = fromEvent(button, 'mouseup')
        const windowMouseUp$ = fromEvent(window, 'mouseup')
        const cancel$ = merge(buttonMouseLeave$, windowMouseUp$)

        buttonMouseDown$.pipe(
            switchMap(() => {
                return timer(750).pipe(
                    takeUntil(cancel$),
                    switchMap(() =>
                        buttonMouseUp$.pipe(
                            takeUntil(cancel$),
                            take(1)
                        )
                    )
                )
            })
        ).subscribe(() => {
            if (this.props.onClickHold && !this.props.disabled)
                this.props.onClickHold()
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
