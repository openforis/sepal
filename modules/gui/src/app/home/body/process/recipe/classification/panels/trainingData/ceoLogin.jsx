import PropTypes from 'prop-types'
import React from 'react'

import {actionBuilder} from '~/action-builder'
// import {withForm} from '~/widget/form/form'
// import {Panel} from '~/widget/panel/panel'
// import {withRecipe} from '~/app/home/body/process/recipeContext'
import {compose} from '~/compose'
// import {compose} from '~/compose'
import {msg} from '~/translate'
import {Form} from '~/widget/form'
import {withForm} from '~/widget/form/form'
import {Layout} from '~/widget/layout'

const fields = {
    email: new Form.Field()
        .notBlank('user.userDetails.form.name.required')
        .match(/^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}$/, 'user.userDetails.form.email.invalid'),
    password: new Form.Field()
        .notBlank('user.userDetails.form.email.required'),
}

// const mapStateToProps = state => ({
//     email: state.ceo.email,
//     password: state.ceo.password,
// })

export class _CeoLogin extends React.Component {
    render() {

        const {inputs} = this.props
        const {email, password} = inputs

        // const {email, password} = this.props
        return (

            <Layout>
                <Form.Input
                    label={msg('process.classification.panel.trainingData.form.ceo.email.label')}
                    autoFocus
                    input={email}
                    spellCheck={false}
                />
                <Form.Input
                    label={msg('process.classification.panel.trainingData.form.ceo.password.label')}
                    input={password}
                    type='password'
                    spellCheck={false}
                />
                <button
                    className="your-button-class"
                    onClick={() => this.handleLogin()}
                >
                    {msg('process.classification.panel.trainingData.form.ceo.submitButton')}
                </button>

            </Layout>

        )
    }

    handleLogin() {
        const {inputs} = this.props
        const email = inputs.email.value()
        const password = inputs.password.value()
      
        // Dispatch an action using actionBuilder
        actionBuilder('USER_CEO_LOGIN')
            .set('ceo.login.email', email)
            .set('ceo.login.password', password)
            .dispatch()
    }

}

export const CeoLogin = compose(
    _CeoLogin,
    withForm({fields}),
)

CeoLogin.propTypes = {
    inputs: PropTypes.object.isRequired,
}
