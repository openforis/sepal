import {v4 as uuid} from 'uuid'
import React from 'react'
import _ from 'lodash'

export const withUniqueIds = (...ids) =>
    WrappedComponent =>
        class WithUniqueHOC extends React.Component {
            constructor() {
                super()
                this.uniqueIds = _.transform(
                    ids,
                    (acc, id) => acc[id] = uuid(),
                    {}
                )
            }

            render() {
                return React.createElement(WrappedComponent, {
                    ...this.props,
                    uniqueIds: this.uniqueIds
                })
            }
        }
