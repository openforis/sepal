import {fromEvent, merge, timer} from 'rxjs'
import {switchMap, take, takeUntil} from 'rxjs/operators'
import Icon from 'widget/icon'
import PropTypes from 'prop-types'
import React from 'react'
import styles from './holdButton.module.css'

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
                onClick={e => e.stopPropagation()}
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
            const {onClickHold, disabled} = this.props
            if (onClickHold && !disabled)
                onClickHold()
        })

    }
}

HoldButton.propTypes = {
    children: PropTypes.any,
    className: PropTypes.string,
    disabled: PropTypes.bool,
    icon: PropTypes.string,
    tabIndex: PropTypes.number,
    onClickHold: PropTypes.func
}
