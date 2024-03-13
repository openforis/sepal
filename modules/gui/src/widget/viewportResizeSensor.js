import {ElementResizeDetector} from 'widget/elementResizeDetector'
import {actionBuilder} from 'action-builder'
import React from 'react'

export class ViewportResizeSensor extends React.Component {
    constructor() {
        super()
        this.updateDimensions = this.updateDimensions.bind(this)
    }

    render() {
        return (
            <ElementResizeDetector
                debounce={100}
                onResize={this.updateDimensions}
            />
        )
    }

    updateDimensions({width, height}) {
        actionBuilder('SET_APP_DIMENSIONS')
            .set('dimensions', {width, height})
            .dispatch()
    }
}

ViewportResizeSensor.propTypes = {}
