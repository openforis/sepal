import {Subject, distinctUntilChanged, throttleTime} from 'rxjs'
import {compose} from '~/compose'
import {withSubscriptions} from '~/subscription'
import PropTypes from 'prop-types'
import React from 'react'
import ReactResizeDetector from 'react-resize-detector'
import _ from 'lodash'

const UPDATE_DEBOUNCE_MS = 250

export class _ElementResizeDetector extends React.Component {
    size$ = new Subject()

    state = {
        width: null,
        height: null
    }

    constructor() {
        super()
        this.onResize = this.onResize.bind(this)
    }

    render() {
        return (
            <ReactResizeDetector
                handleHeight
                handleWidth
                onResize={this.onResize}>
                {this.renderContent()}
            </ReactResizeDetector>
        )
    }

    onResize(width, height) {
        this.size$.next({width, height})
    }

    renderContent() {
        const {children} = this.props
        if (_.isFunction(children)) {
            const {width, height} = this.state
            return (width && height) ? children({width, height}) : null
        } else {
            return children
        }
    }

    componentDidMount() {
        const {debounce, resize$, onResize, addSubscription} = this.props
        addSubscription(
            this.size$.pipe(
                throttleTime(debounce, null, {leading: true, trailing: true}),
                distinctUntilChanged()
            ).subscribe(
                size => {
                    this.setState(size)
                    resize$ && resize$.next(size)
                    onResize && onResize(size)
                }
            )
        )
    }
}

export const ElementResizeDetector = compose(
    _ElementResizeDetector,
    withSubscriptions()
)

ElementResizeDetector.propTypes = {
    children: PropTypes.any,
    debounce: PropTypes.number,
    resize$: PropTypes.object,
    onResize: PropTypes.func,
}

ElementResizeDetector.defaultProps = {
    debounce: UPDATE_DEBOUNCE_MS
}
