import {actionBuilder} from '~/action-builder'
import {activationAllowed} from './activationPolicy'
import {collectActivatables} from './activation'
import {compose} from '~/compose'
import {connect} from '~/connect'
import {uuid} from '~/uuid'
import {withActivationContext} from './activationContext'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'

const mapStateToProps = (state, ownProps) => {
    const {activationContext: {pathList}} = ownProps
    const activatables = collectActivatables(state, pathList)
    return {activatables}
}

class _Activator extends React.Component {
    activatorId = uuid()

    render() {
        const {children} = this.props
        return children(this.getActivatorProps())
    }

    activatablePath(id) {
        const {activatables} = this.props
        return activatables[id].path
    }

    activate(id, activationProps) {
        const {activationContext: {pathList}} = this.props
        actionBuilder('ACTIVATE', {id, pathList})
            .assign(this.activatablePath(id), {
                active: true,
                justActivated: true,
                activationProps
            })
            .dispatch()
    }

    deactivate (id) {
        const {activationContext: {pathList}} = this.props
        actionBuilder('DEACTIVATE', {id, pathList})
            .assign(this.activatablePath(id), {
                active: false,
                justActivated: false
            })
            .dispatch()
    }

    getActivatorProps() {
        const {ids, activatables, activationContext: {pathList}} = this.props

        const props = id => {
            if (activatables[id]) {
                const active = activatables[id]?.active
                const canActivate = activationAllowed(id, activatables)
                return {
                    id,
                    activatorId: this.activatorId,
                    active,
                    canActivate,
                    activate: activationProps => canActivate && this.activate(id, activationProps),
                    deactivate: () => active && this.deactivate(id),
                    toggle: () => active && this.deactivate(id) || canActivate && this.activate(id)
                }
            }
            return {
                id,
                activatorId: this.activatorId
            }
        }

        const updateActivatables = updates => {
            const updatedActivatables = _.transform(updates, (activatables, {id, active}) => {
                const activatable = activatables[id]
                if (!activatable || activatable.active !== active) {
                    const updatedActive = active && activationAllowed(id, activatables)
                    activatable.active = updatedActive
                    activatable.justActivated = updatedActive
                }
            }, _.cloneDeep(activatables)) // TODO: our cloneDepp not working here!!
            if (!_.isEqual(updatedActivatables, activatables)) {
                actionBuilder('UPDATE_ACTIVATABLES', {pathList})
                    .set([pathList, 'activatables'], updatedActivatables)
                    .dispatch()
            }
            return {}
        }

        const processEntries = entries =>
            _.transform(entries, (acc, entry) => processEntry(acc, entry), {})

        const processEntry = (acc, entry, id) => {
            if (_.isFunction(entry)) {
                const activatableId = entry(this.props.otherProps, this.activatorId)
                acc[id || activatableId] = props(activatableId)
            } else if (_.isArray(entry)) {
                _.forEach(entry, value => {
                    processEntry(acc, value)
                })
            } else if (_.isObject(entry)) {
                _.forEach(entry, (value, id) => {
                    processEntry(acc, value, id)
                })
            } else if (_.isString(entry)) {
                acc[id || entry] = props(entry)
            } else {
                throw new Error('Unsupported activator argument:', entry)
            }
        }

        return {
            activatables: processEntries(_.isEmpty(ids) ? Object.keys(activatables) : ids),
            updateActivatables
        }
    }
}

const Activator = compose(
    _Activator,
    connect(mapStateToProps),
    withActivationContext()
)

Activator.propTypes = {
    children: PropTypes.func.isRequired,
    ids: PropTypes.array
}

export const withActivators = (...ids) =>
    WrappedComponent =>
        class ActivatorHoc extends React.Component {
            constructor() {
                super()
                this.renderActivator = this.renderActivator.bind(this)
            }

            render() {
                return (
                    <Activator ids={ids} otherProps={this.props}>
                        {this.renderActivator}
                    </Activator>
                )
            }

            renderActivator(activator) {
                return React.createElement(WrappedComponent, {activator, ...this.props})
            }
        }
