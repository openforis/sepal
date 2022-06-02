import {Subject, distinctUntilChanged, throttleTime} from 'rxjs'
import {compose} from 'compose'
import PropTypes from 'prop-types'
import React from 'react'
import ReactResizeDetector from 'react-resize-detector'
import _ from 'lodash'
import withSubscriptions from 'subscription'

const UPDATE_DEBOUNCE_MS = 250

export class _ElementResizeDetector extends React.Component {
    size$ = new Subject()

    state = {
        width: null,
        height: null
    }

    render() {
        return (
            <ReactResizeDetector
                handleHeight
                handleWidth
                onResize={(width, height) => this.size$.next({width, height})}>
                {this.renderContent()}
            </ReactResizeDetector>
        )
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
        const {debounce, onResize, addSubscription} = this.props
        addSubscription(
            this.size$.pipe(
                throttleTime(debounce, null, {leading: true, trailing: true}),
                distinctUntilChanged()
            ).subscribe(
                ({width, height}) => {
                    this.setState({width, height})
                    onResize && onResize({width, height})
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
    onResize: PropTypes.func
}

ElementResizeDetector.defaultProps = {
    debounce: UPDATE_DEBOUNCE_MS
}
