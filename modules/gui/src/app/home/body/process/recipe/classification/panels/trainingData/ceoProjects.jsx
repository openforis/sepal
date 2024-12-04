/* eslint-disable no-console */
// import PropTypes from 'prop-types'
import React from 'react'

// import {actionBuilder} from '~/action-builder'
// import {withForm} from '~/widget/form/form'
// import {Panel} from '~/widget/panel/panel'
// import {withRecipe} from '~/app/home/body/process/recipeContext'
import {compose} from '~/compose'
// import {compose} from '~/compose'
// import {msg} from '~/translate'
// import {withActivatable} from '~/widget/activation/activatable'
import {withActivators} from '~/widget/activation/activator'
import {Layout} from '~/widget/layout'

// import {Form} from '~/widget/form'
// import {withForm} from '~/widget/form/form'
// import {Layout} from '~/widget/layout'
// import {Panel} from '~/widget/panel/panel'
import {CeoLogin, CeoLoginButton} from './ceoLogin'

// const fields = {
//     email: new Form.Field()
//         .notBlank('user.userDetails.form.name.required')
//         .match(/^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}$/, 'user.userDetails.form.email.invalid'),
//     password: new Form.Field()
//         .notBlank('user.userDetails.form.email.required'),
// }

// const mapStateToProps = state => ({
//     email: state.ceo.email,
//     password: state.ceo.password,
// })

export class _CeoProjects extends React.Component {
    
    render() {
        // const {form} = this.props

        // Activate this component

        console.log('############################### projects props', this.props)

        const {activator} = this.props
        const activateCeoLogin = activator.activatables.ceoLogin.activate
        
        return (
            <Layout>
                <CeoLogin/>
                <CeoLoginButton disabled={false} onClick={activateCeoLogin}/>
            </Layout>
        )
    }
    
}

// const policy = () => ({
//     _: 'disallow',
//     ceoCredentials: 'allow-then-deactivate',
// })

export const CeoProjects = compose(
    _CeoProjects,
    withActivators('ceoLogin')          // Get activator for ceoLogin
    // withActivatable({id: 'ceoProjects'})
)

CeoProjects.propTypes = {}
