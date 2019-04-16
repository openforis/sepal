import {disableBodyScroll, enableBodyScroll} from 'body-scroll-lock'
import PropTypes from 'prop-types'
import React, {Component} from 'react'
import _ from 'lodash'
import flexy from './flexy.module.css'
import styles from './scrollable.module.css'

const Context = React.createContext()

export class ScrollableContainer extends React.Component {
    ref = React.createRef()
    state = {}

    render() {
        const {className, children} = this.props
        const {height} = this.state
        return (
            <div ref={this.ref} className={[flexy.container, className].join(' ')}>
                <Context.Provider value={{height}}>
                    {children}
                </Context.Provider>
            </div>
        )
    }

    update(height) {
        this.updateState({height})
    }

    componentDidMount() {
        this.update(0)
    }

    componentDidUpdate() {
        this.update(this.ref.current.clientHeight)
    }

    updateState(state, callback) {
        const updatedState = (prevState, state) =>
            _.isEqual(_.pick(prevState, _.keys(state)), state) ? null : state
        this.setState(
            prevState =>
                updatedState(prevState, _.isFunction(state) ? state(prevState) : state),
            callback
        )
    }

}

ScrollableContainer.propTypes = {
    children: PropTypes.any.isRequired,
    className: PropTypes.string
}

export const Unscrollable = ({className, children}) => {
    return (
        <div className={[flexy.rigid, className].join(' ')}>
            {children}
        </div>
    )
}

Unscrollable.propTypes = {
    children: PropTypes.any,
    className: PropTypes.string
}

export class Scrollable extends Component {
    targetRef = React.createRef()

    render() {
        return (
            <Context.Consumer>
                {({height}) => this.renderScrollable(height)}
            </Context.Consumer>
        )
    }

    renderScrollable(scrollableContainerHeight) {
        const {className, direction, children} = this.props
        return (
            <div
                ref={this.targetRef}
                className={[flexy.elastic, styles.scrollable, styles[direction], className].join(' ')}>
                {_.isFunction(children) ? children(scrollableContainerHeight) : children}
            </div>
        )
    }

    componentDidMount() {
        disableBodyScroll(this.targetRef.current)
    }

    componentWillUnmount() {
        enableBodyScroll(this.targetRef.current)
    }
}

Scrollable.defaultProps = {direction: 'y'}

Scrollable.propTypes = {
    children: PropTypes.any,
    className: PropTypes.string,
    direction: PropTypes.oneOf(['x', 'y', 'xy'])
}
