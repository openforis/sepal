import _ from 'lodash'
import React from 'react'

import {compose} from '~/compose'
import {withActivatable} from '~/widget/activation/activatable'
import {Form} from '~/widget/form'
import {withForm} from '~/widget/form/form'
import {Panel} from '~/widget/panel/panel'

export const modalSubformPanel = ({id, toTitle, toClassName, fields}) =>
    WrappedComponent => {
        class ModalSubformPanel extends React.Component {
            constructor(props) {
                super(props)
                this.update = this.update.bind(this)
                this.cancel = this.cancel.bind(this)
            }
    
            render() {
                const {form} = this.props
                return (
                    <Form.Panel
                        className={toClassName()}
                        placement='modal'
                        form={form}
                        onApply={this.update}
                        onCancel={this.cancel}>
                        <Panel.Header title={toTitle()}/>
                        <Panel.Content>
                            {React.createElement(WrappedComponent, {...this.props, inputs: this.presentedInputs()})}
                        </Panel.Content>
                        <Form.PanelButtons/>
                    </Form.Panel>
                )
            }
    
            componentDidMount() {
                const {inputsToUpdate, inputs} = this.props
                Object.keys(inputsToUpdate)
                    .filter(name => Object.keys(inputs).includes(name))
                    .forEach(name => inputs[name].set(inputsToUpdate[name].value))
            }
    
            // A setting the source recipe's reference owns stays its current value, as the outer form presents it.
            componentDidUpdate() {
                const {inputsToUpdate, inputs} = this.props
                Object.entries(inputsToUpdate).forEach(([name, source]) => {
                    if (source.referenceOwned && inputs[name] && !_.isEqual(inputs[name].value, source.value)) {
                        inputs[name].setInitialValue(source.value)
                    }
                })
            }

            // Each field as the outer form presents it: one the reference owns is that outer input, read-only, and one
            // the recipe owns is edited here, said as the outer form says it.
            presentedInputs() {
                const {inputs, inputsToUpdate} = this.props
                return Object.fromEntries(Object.entries(inputs).map(([name, input]) => {
                    const source = inputsToUpdate[name]
                    return [name, source?.referenceOwned ? source : {...input, presentation: source?.presentation}]
                }))
            }

            update(values) {
                const {inputsToUpdate, activatable: {deactivate}} = this.props
                Object.keys(inputsToUpdate)
                    .forEach(name => inputsToUpdate[name].set(values[name]))
                deactivate()
            }
    
            cancel() {
                const {activatable: {deactivate}} = this.props
                deactivate()
            }
        }
    
        const policy = () => ({
            _: 'allow'
        })

        return compose(
            ModalSubformPanel,
            withForm({fields}),
            withActivatable({id, policy, alwaysAllow: true})
        )
    }

