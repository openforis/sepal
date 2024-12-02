import React from 'react'

import {compose} from '~/compose'
import {msg} from '~/translate'
import {Form} from '~/widget/form'
import {withForm} from '~/widget/form/form'

const fields = {
    email: new Form.Field()
        .notBlank('user.userDetails.form.name.required'),
    password: new Form.Field()
        .notBlank('user.userDetails.form.email.required'),
}

const mapStateToProps = state => {
    return {
        values: {
            name: state.ceo.name,
            email: state.ceo.email,
        }
    }
}
const CeoCredentials = compose(
    CeoLogin,
    withForm({fields, mapStateToProps}),
)

CeoCredentials.propTypes = {}

export class CeoLogin extends React.Component {
    render() {
        const {email, password} = this.props
        return (

            <Panel.Content>
                <Layout>
                    <Form.Input
                        label={msg('user.userDetails.form.name.label')}
                        autoFocus
                        input={email}
                        spellCheck={false}
                    />
                    <Form.Input
                        label={msg('user.userDetails.form.email.label')}
                        input={password}
                        type='password'
                        spellCheck={false}
                    />
                    <Form.Buttons
                        label={msg('user.userDetails.form.manualMapRendering.label')}
                        tooltip={msg('user.userDetails.form.manualMapRendering.tooltip')}
                        // input={manualMapRenderingEnabled}
                        multiple={false}
                        options={[{
                            value: true,
                            label: msg('user.userDetails.form.manualMapRendering.enabled.label'),
                            tooltip: msg('user.userDetails.form.manualMapRendering.enabled.tooltip')
                        }, {
                            value: false,
                            label: msg('user.userDetails.form.manualMapRendering.disabled.label'),
                            tooltip: msg('user.userDetails.form.manualMapRendering.disabled.tooltip')
                        }]}
                        type='horizontal-nowrap'
                    />
                </Layout>
            
            </Panel.Content>

        )
    }
}
