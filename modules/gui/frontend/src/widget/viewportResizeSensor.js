import {Subject} from 'rxjs'
import {compose} from 'compose'
import {debounceTime, distinctUntilChanged} from 'rxjs/operators'
import React from 'react'
import ReactResizeDetector from 'react-resize-detector'
import actionBuilder from 'action-builder'
import withSubscriptions from 'subscription'

const resize$ = new Subject()
const UPDATE_DEBOUNCE_MS = 100

class ViewportResizeSensor extends React.Component {
    render() {
        return (
            <ReactResizeDetector
                handleWidth
                handleHeight
                onResize={(width, height) => resize$.next({width, height})}
            />
        )
    }

    componentDidMount() {
        const {addSubscription} = this.props
        addSubscription(
            resize$.pipe(
                debounceTime(UPDATE_DEBOUNCE_MS),
                distinctUntilChanged()
            ).subscribe(
                ({width, height}) => this.updateDimensions({width, height})
            )
        )
    }

    updateDimensions({width, height}) {
        actionBuilder('SET_APP_DIMENSIONS')
            .set('dimensions', {width, height})
            .dispatch()
    }
}

export default compose(
    ViewportResizeSensor,
    withSubscriptions
)

ViewportResizeSensor.propTypes = {}
