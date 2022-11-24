import React from 'react'

export const withContext = (Context, prop, required = false) =>
    () => // wrapped with apparently useless function for consistency with other "with*" wrappers
        WrappedComponent =>
            class WithContextHOC extends React.Component {
                constructor() {
                    super()
                    this.wrap = this.wrap.bind(this)
                }

                render() {
                    return (
                        <Context.Consumer>
                            {this.wrap}
                        </Context.Consumer>
                    )
                }

                wrap(context) {
                    if (required && !context) {
                        throw Error(`Component has no ${prop}: ${WrappedComponent}`)
                    }
                    const props = prop
                        ? this.assign(context)
                        : this.merge(context)
                    return React.createElement(WrappedComponent, props)
                }

                assign(context) {
                    return {
                        ...this.props,
                        [prop]: context
                    }
                }

                merge(context) {
                    return {
                        ...this.props,
                        ...context
                    }
                }
            }
