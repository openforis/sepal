import {Subject} from 'rxjs'
import {debounceTime, distinctUntilChanged} from 'rxjs/operators'
import React from 'react'
import ReactResizeDetector from 'react-resize-detector'
import actionBuilder from 'action-builder'

const resize$ = new Subject()
const UPDATE_DEBOUNCE_MS = 100

export default class ViewportResizeSensor extends React.Component {
    subscriptions = []

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
        this.subscriptions.push(
            resize$.pipe(
                debounceTime(UPDATE_DEBOUNCE_MS),
                distinctUntilChanged()
            ).subscribe(
                ({width, height}) => this.updateDimensions({width, height})
            )
        )
    }

    componentWillUnmount() {
        this.subscriptions.map(subscription => subscription.unsubscribe())
    }

    updateDimensions({width, height}) {
        actionBuilder('SET_APP_DIMENSIONS')
            .set('dimensions', {width, height})
            .dispatch()
    }
}

ViewportResizeSensor.propTypes = {}
