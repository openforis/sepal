import React from 'react'
// import _ from 'lodash'

export const withContext = (context, prop, required = false) => () =>
    WrappedComponent =>
        class WithContextHOC extends React.Component {
            constructor() {
                super()
                this.wrap = this.wrap.bind(this)
            }

            render() {
                return (
                    <context.Consumer>
                        {this.wrap}
                    </context.Consumer>
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

            // assertNoCollisions(props) {
            //     const collisions = _.intersection(Object.keys(this.props), props)
            //     if (collisions.length) {
            //         throw new Error(`Cannot pass properties already injected by HoC: ${collisions.join(', ')}`)
            //     }
            // }

            assign(context) {
                // this.assertNoCollisions([prop])
                return {
                    ...this.props,
                    [prop]: context
                }
            }

            merge(context) {
                // this.assertNoCollisions(Object.keys(context))
                return {
                    ...this.props,
                    ...context
                }
            }
        }
