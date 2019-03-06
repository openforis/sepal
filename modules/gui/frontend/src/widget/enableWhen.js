import React from 'react'

export const enabled = ({when, onDisable}) =>
    WrappedComponent => {
        class HigherOrderComponent extends React.Component {
            state = {enabled: true}

            static getDerivedStateFromProps(props) {
                return {enabled: when(props)}
            }


            render() {
                return this.state.enabled
                    ? React.createElement(WrappedComponent, this.props)
                    : null
            }

            componentDidUpdate(prevProps, prevState) {
                const wasDisabled = prevState.enabled && !this.state.enabled
                if (wasDisabled)
                    onDisable && onDisable(this.props)
            }
        }

        return HigherOrderComponent
    }
