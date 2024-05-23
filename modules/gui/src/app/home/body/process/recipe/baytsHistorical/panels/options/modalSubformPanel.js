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
                        type='modal'
                        className={toClassName()}
                        form={form}
                        onApply={this.update}
                        onCancel={this.cancel}>
                        <Panel.Header title={toTitle()}/>
                        <Panel.Content>
                            {React.createElement(WrappedComponent, {...this.props})}
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

