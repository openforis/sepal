import {Form, form} from 'widget/form/form'
import {Input} from 'widget/input'
import {Layout} from 'widget/layout'
import {Panel} from 'widget/panel/panel'
import {compose} from 'compose'
import {msg} from 'translate'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'
import styles from './userDetails.module.css'

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
    admin: new Form.Field(),
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
        .min(1, 'user.userDetails.form.monthlyBudget.storageQuota.atLeast1'),
    userRequestInstanceSpendingState: new Form.Field().notNil(),
    userRequestStorageSpendingState: new Form.Field().notNil(),
    userRequestStorageQuotaState: new Form.Field().notNil()
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
            admin: userDetails.admin || false,
            monthlyBudgetInstanceSpending: userDetails.quota.budget.instanceSpending,
            monthlyBudgetStorageSpending: userDetails.quota.budget.storageSpending,
            monthlyBudgetStorageQuota: userDetails.quota.budget.storageQuota,
            userRequestInstanceSpendingState: null,
            userRequestStorageSpendingState: null,
            userRequestStorageQuotaState: null
        }
    }
}

class UserDetails extends React.Component {
    save(userDetails) {
        const {onSave, onCancel} = this.props
        onSave({...userDetails})
        onCancel()
    }

    cancel() {
        const {onCancel} = this.props
        onCancel()
    }

    render() {
        const {userDetails: {quota: {budgetUpdateRequest}}, form, inputs} = this.props
        const {username, name, email, organization, admin, monthlyBudgetInstanceSpending, monthlyBudgetStorageSpending, monthlyBudgetStorageQuota, userRequestInstanceSpendingState, userRequestStorageSpendingState, userRequestStorageQuotaState} = inputs
        const newUser = !this.props.userDetails.username
        return (
            <Form.Panel
                className={styles.panel}
                form={form}
                statePath='userDetails'
                modal
                onApply={userDetails => this.save(userDetails)}
                onClose={() => this.cancel()}>
                <Panel.Header
                    icon='user'
                    title={msg('user.userDetails.title')}
                    label={
                        <Form.Buttons
                            input={admin}
                            multiple={false}
                            options={[{
                                value: false,
                                label: msg('user.userDetails.form.user.label')
                            }, {
                                value: true,
                                label: msg('user.userDetails.form.admin.label')
                            }]}
                        />
                    }/>
                <Panel.Content>
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
                                onChange={({target: {value}}) => userRequestInstanceSpendingState.set(value == budgetUpdateRequest.instanceSpending)}
                            />
                            <Form.Input
                                label={msg('user.userDetails.form.monthlyBudget.storageSpending.label')}
                                type='number'
                                input={monthlyBudgetStorageSpending}
                                spellCheck={false}
                                onChange={({target: {value}}) => userRequestStorageSpendingState.set(value == budgetUpdateRequest.storageSpending)}
                            />
                            <Form.Input
                                label={msg('user.userDetails.form.monthlyBudget.storageQuota.label')}
                                type='number'
                                input={monthlyBudgetStorageQuota}
                                spellCheck={false}
                                onChange={({target: {value}}) => userRequestStorageQuotaState.set(value == budgetUpdateRequest.storageQuota)}
                            />
                        </Form.FieldSet>
                        {this.isUserRequest() ? this.renderUserRequest() : null}
                    </Layout>
                </Panel.Content>
                <Form.PanelButtons/>
            </Form.Panel>
        )
    }

    renderUserRequest() {
        const {userDetails: {quota: {budgetUpdateRequest}}, inputs} = this.props
        const {monthlyBudgetInstanceSpending, monthlyBudgetStorageSpending, monthlyBudgetStorageQuota, userRequestInstanceSpendingState, userRequestStorageSpendingState, userRequestStorageQuotaState} = inputs
        return (
            <Form.FieldSet
                className={styles.monthlyLimits}
                layout='horizontal'
                label={msg('user.userDetails.form.budgetUpdateRequest.label')}>
                <div className={styles.message}>
                    {budgetUpdateRequest.message}
                </div>
                <Layout type='vertical'>
                    <Input
                        label={msg('user.userDetails.form.monthlyBudget.instanceSpending.label')}
                        type='number'
                        value={budgetUpdateRequest.instanceSpending}
                        readOnly
                    />
                    {this.renderAcceptDeclineButtons(userRequestInstanceSpendingState, monthlyBudgetInstanceSpending, budgetUpdateRequest.instanceSpending)}
                </Layout>
                <Layout type='vertical'>
                    <Input
                        label={msg('user.userDetails.form.monthlyBudget.storageSpending.label')}
                        type='number'
                        value={budgetUpdateRequest.storageSpending}
                        readOnly
                    />
                    {this.renderAcceptDeclineButtons(userRequestStorageSpendingState, monthlyBudgetStorageSpending, budgetUpdateRequest.storageSpending)}
                </Layout>
                <Layout type='vertical'>
                    <Input
                        label={msg('user.userDetails.form.monthlyBudget.storageQuota.label')}
                        type='number'
                        value={budgetUpdateRequest.storageQuota}
                        readOnly
                    />
                    {this.renderAcceptDeclineButtons(userRequestStorageQuotaState, monthlyBudgetStorageQuota, budgetUpdateRequest.storageQuota)}
                </Layout>
            </Form.FieldSet>
        )
    }

    renderAcceptDeclineButtons(input, valueInput, userRequestValue) {
        const options = [{
            look: 'add',
            icon: 'check',
            value: true
        }, {
            look: 'cancel',
            icon: 'times',
            value: false
        }]
        return (
            <Form.Buttons
                alignment='fill'
                layout='horizontal-wrap'
                spacing='tight'
                options={options}
                input={input}
                onChange={value => {
                    if (value) {
                        valueInput.set(userRequestValue)
                    } else {
                        valueInput.resetValue()
                    }
                }}
            />
        )
    }

    isUserRequest() {
        const {userDetails: {quota: {budgetUpdateRequest}}} = this.props
        return budgetUpdateRequest
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
