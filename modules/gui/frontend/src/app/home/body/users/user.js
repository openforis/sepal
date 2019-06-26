import {Form, form} from 'widget/form/form'
import {Layout} from 'widget/layout'
import {PanelContent, PanelHeader} from 'widget/panel'
import {compose} from 'compose'
import {msg} from 'translate'
import PropTypes from 'prop-types'
import React from 'react'
import styles from './user.module.css'

const fields = {
    username: new Form.Field()
        .notBlank('user.userDetails.form.username.required')
        .match(/^[a-zA-Z_][a-zA-Z0-9]{0,29}$/, 'user.userDetails.form.username.format'),
    name: new Form.Field()
        .notBlank('user.userDetails.form.name.required'),
    email: new Form.Field()
        .notBlank('user.userDetails.form.email.required')
        .email('user.userDetails.form.email.required'),
    organization: new Form.Field()
        .notBlank('user.userDetails.form.organization.required'),
    monthlyBudgetInstanceSpending: new Form.Field()
        .notBlank('user.userDetails.form.monthlyBudget.instanceSpending.atLeast1')
        .int('user.userDetails.form.monthlyBudget.instanceSpending.atLeast1')
        .min(1, 'user.userDetails.form.monthlyBudget.instanceSpending.atLeast1'),
    monthlyBudgetStorageSpending: new Form.Field()
        .notBlank('user.userDetails.form.monthlyBudget.storageSpending.atLeast1')
        .int('user.userDetails.form.monthlyBudget.storageSpending.atLeast1')
        .min(1, 'user.userDetails.form.monthlyBudget.storageSpending.atLeast1'),
    monthlyBudgetStorageQuota: new Form.Field()
        .notBlank('user.userDetails.form.monthlyBudget.storageQuota.atLeast1')
        .int('user.userDetails.form.monthlyBudget.storageQuota.atLeast1')
        .min(1, 'user.userDetails.form.monthlyBudget.storageQuota.atLeast1')
}

const mapStateToProps = (state, ownProps) => {
    const userDetails = ownProps.userDetails
    return {
        values: {
            newUser: userDetails.newUser,
            username: userDetails.username,
            name: userDetails.name,
            email: userDetails.email,
            organization: userDetails.organization,
            monthlyBudgetInstanceSpending: userDetails.monthlyBudgetInstanceSpending,
            monthlyBudgetStorageSpending: userDetails.monthlyBudgetStorageSpending,
            monthlyBudgetStorageQuota: userDetails.monthlyBudgetStorageQuota
        }
    }
}

class UserDetails extends React.Component {
    save(userDetails) {
        this.props.onSave(userDetails)
    }

    cancel() {
        this.props.onCancel()
    }

    render() {
        const {form,
            inputs: {username, name, email, organization, monthlyBudgetInstanceSpending, monthlyBudgetStorageSpending, monthlyBudgetStorageQuota}
        } = this.props
        const newUser = !this.props.userDetails.username
        return (
            <Form.Panel
                className={[styles.panel, newUser ? styles.newUser : styles.existingUser].join(' ')}
                form={form}
                statePath='userDetails'
                modal
                onApply={userDetails => this.save(userDetails)}
                close={() => this.cancel()}>
                <PanelHeader
                    icon='user'
                    title={msg('user.userDetails.title')}/>
                <PanelContent>
                    <Layout>
                        <Form.Input
                            label={msg('user.userDetails.form.username.label')}
                            input={username}
                            disabled={!newUser}
                            spellCheck={false}
                            autoFocus={newUser}
                            errorMessage
                        />
                        <Form.Input
                            label={msg('user.userDetails.form.name.label')}
                            input={name}
                            spellCheck={false}
                            autoFocus={!newUser}
                            errorMessage
                        />
                        <Form.Input
                            label={msg('user.userDetails.form.email.label')}
                            input={email}
                            spellCheck={false}
                            errorMessage
                        />
                        <Form.Input
                            label={msg('user.userDetails.form.organization.label')}
                            input={organization}
                            spellCheck={false}
                            errorMessage
                        />
                        <Form.FieldSet
                            className={styles.monthlyLimits}
                            layout='horizontal'
                            label={msg('user.userDetails.form.monthlyLimits.label')}
                            errorMessage={[monthlyBudgetInstanceSpending, monthlyBudgetStorageSpending, monthlyBudgetStorageQuota]}
                        >
                            <Form.Input
                                label={msg('user.userDetails.form.monthlyBudget.instanceSpending.label')}
                                type='number'
                                input={monthlyBudgetInstanceSpending}
                                spellCheck={false}
                            />
                            <Form.Input
                                label={msg('user.userDetails.form.monthlyBudget.storageSpending.label')}
                                type='number'
                                input={monthlyBudgetStorageSpending}
                                spellCheck={false}
                            />
                            <Form.Input
                                label={msg('user.userDetails.form.monthlyBudget.storageQuota.label')}
                                type='number'
                                input={monthlyBudgetStorageQuota}
                                spellCheck={false}
                            />
                        </Form.FieldSet>
                    </Layout>
                </PanelContent>
                <Form.PanelButtons/>
            </Form.Panel>
        )
    }
}

UserDetails.propTypes = {
    userDetails: PropTypes.object.isRequired,
    onCancel: PropTypes.func.isRequired,
    onSave: PropTypes.func.isRequired,
}

export default compose(
    UserDetails,
    form({fields, mapStateToProps})
)
