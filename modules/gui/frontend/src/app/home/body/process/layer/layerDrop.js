import {compose} from 'compose'
import React from 'react'
import {fromEvent, merge} from 'rxjs'
import withSubscriptions from 'subscription'
import Portal from 'widget/portal'
import styles from './layerDrop.module.css'

class _LayerDrop extends React.Component {
    containerRef = React.createRef()
    state = {moved: Math.random()}

    render() {
        const {moved} = this.state
        return (
            <Portal type='global'>
                <div
                    ref={this.containerRef}
                    className={styles.container}>
                    {moved}
                </div>
            </Portal>
        )
    }

    componentDidMount() {
        const {addSubscription} = this.props
        const touchMove$ = fromEvent(this.containerRef.current, 'touchmove')
        const mouseMove$ = fromEvent(this.containerRef.current, 'mousemove')
        const move$ = merge(touchMove$, mouseMove$)
        addSubscription(
            move$.subscribe(e => this.setState({moved: Math.random()}))
        )
    }
}

const LayerDrop = compose(
    _LayerDrop,
    withSubscriptions()
)

export default LayerDrop
