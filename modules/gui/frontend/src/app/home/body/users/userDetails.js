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
    instanceSpending: new Form.Field()
        .notBlank('user.userDetails.form.monthlyBudget.instanceSpending.atLeast1')
        .int('user.userDetails.form.monthlyBudget.instanceSpending.atLeast1')
        .min(1, 'user.userDetails.form.monthlyBudget.instanceSpending.atLeast1'),
    storageSpending: new Form.Field()
        .notBlank('user.userDetails.form.monthlyBudget.storageSpending.atLeast1')
        .int('user.userDetails.form.monthlyBudget.storageSpending.atLeast1')
        .min(1, 'user.userDetails.form.monthlyBudget.storageSpending.atLeast1'),
    storageQuota: new Form.Field()
        .notBlank('user.userDetails.form.monthlyBudget.storageQuota.atLeast1')
        .int('user.userDetails.form.monthlyBudget.storageQuota.atLeast1')
        .min(1, 'user.userDetails.form.monthlyBudget.storageQuota.atLeast1'),
    userRequestInstanceSpendingState: new Form.Field().notNil(),
    userRequestStorageSpendingState: new Form.Field().notNil(),
    userRequestStorageQuotaState: new Form.Field().notNil()
}

const mapStateToProps = (state, ownProps) => {
    const {userDetails} = ownProps
    const {newUser, username, name, email, organization, admin = false} = userDetails
    const {quota: {budget: {instanceSpending, storageSpending, storageQuota}, budgetUpdateRequest}} = userDetails
    const userRequestInstanceSpendingState = budgetUpdateRequest ? null : false
    const userRequestStorageSpendingState = budgetUpdateRequest ? null : false
    const userRequestStorageQuotaState = budgetUpdateRequest ? null : false

    return {
        values: {
            newUser, username, name, email, organization, admin, instanceSpending, storageSpending, storageQuota,
            userRequestInstanceSpendingState, userRequestStorageSpendingState, userRequestStorageQuotaState
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
        const {form, inputs: {username, name, email, organization, instanceSpending, storageSpending, storageQuota}} = this.props
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
                    label={this.renderUserRoleButtons()}
                />
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
                            tooltip={msg('user.userDetails.form.monthlyLimits.tooltip')}
                            tooltipPlacement='topLeft'
                            errorMessage={[instanceSpending, storageSpending, storageQuota]}>
                            <Form.Input
                                label={msg('user.userDetails.form.monthlyBudget.instanceSpending.label')}
                                type='number'
                                input={instanceSpending}
                                spellCheck={false}
                                prefix='US$/mo.'
                                onChange={e => this.onChangeInstanceSpending(e.target.value)}
                            />
                            <Form.Input
                                label={msg('user.userDetails.form.monthlyBudget.storageSpending.label')}
                                type='number'
                                input={storageSpending}
                                spellCheck={false}
                                prefix='US$/mo.'
                                onChange={e => this.onChangeStorageSpending(e.target.value)}
                            />
                            <Form.Input
                                label={msg('user.userDetails.form.monthlyBudget.storageQuota.label')}
                                type='number'
                                input={storageQuota}
                                spellCheck={false}
                                prefix='GB'
                                onChange={e => this.onChangeStorageQuota(e.target.value)}
                            />
                        </Form.FieldSet>
                        {this.isUserRequest() ? this.renderUserRequest() : null}
                    </Layout>
                </Panel.Content>
                <Form.PanelButtons/>
            </Form.Panel>
        )
    }

    onChangeInstanceSpending(instanceSpending) {
        const {userDetails: {quota: {budgetUpdateRequest}}, inputs: {userRequestInstanceSpendingState}} = this.props
        if (budgetUpdateRequest) {
            const approved = instanceSpending >= budgetUpdateRequest.instanceSpending
            userRequestInstanceSpendingState.set(approved)
        }
    }

    onChangeStorageSpending(storageSpending) {
        const {userDetails: {quota: {budgetUpdateRequest}}, inputs: {userRequestStorageSpendingState}} = this.props
        if (budgetUpdateRequest) {
            const approved = storageSpending >= budgetUpdateRequest.storageSpending
            userRequestStorageSpendingState.set(approved)
        }
    }

    onChangeStorageQuota(storageQuota) {
        const {userDetails: {quota: {budgetUpdateRequest}}, inputs: {userRequestStorageQuotaState}} = this.props
        if (budgetUpdateRequest) {
            const approved = storageQuota >= budgetUpdateRequest.storageQuota
            userRequestStorageQuotaState.set(approved)
        }
    }

    renderUserRoleButtons() {
        const {inputs: {admin}} = this.props
        return (
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
        )
    }

    renderUserRequest() {
        const {userDetails: {quota: {budgetUpdateRequest}}, inputs} = this.props
        const {instanceSpending, storageSpending, storageQuota, userRequestInstanceSpendingState, userRequestStorageSpendingState, userRequestStorageQuotaState} = inputs
        return (
            <Form.FieldSet
                className={styles.monthlyLimits}
                layout='horizontal'
                label={msg('user.userDetails.form.budgetUpdateRequest.label')}>
                <div className={styles.message}>
                    {budgetUpdateRequest.message}
                </div>
                <Layout type='horizontal'>
                    <Layout type='vertical'>
                        <Input
                            label={msg('user.userDetails.form.monthlyBudget.instanceSpending.label')}
                            type='number'
                            value={budgetUpdateRequest.instanceSpending}
                            readOnly
                            prefix='US$/mo.'
                        />
                        {this.renderAcceptDeclineButtons(userRequestInstanceSpendingState, instanceSpending, budgetUpdateRequest.instanceSpending)}
                    </Layout>
                    <Layout type='vertical'>
                        <Input
                            label={msg('user.userDetails.form.monthlyBudget.storageSpending.label')}
                            type='number'
                            value={budgetUpdateRequest.storageSpending}
                            readOnly
                            prefix='US$/mo.'
                        />
                        {this.renderAcceptDeclineButtons(userRequestStorageSpendingState, storageSpending, budgetUpdateRequest.storageSpending)}
                    </Layout>
                    <Layout type='vertical'>
                        <Input
                            label={msg('user.userDetails.form.monthlyBudget.storageQuota.label')}
                            type='number'
                            value={budgetUpdateRequest.storageQuota}
                            readOnly
                            prefix='GB'
                        />
                        {this.renderAcceptDeclineButtons(userRequestStorageQuotaState, storageQuota, budgetUpdateRequest.storageQuota)}
                    </Layout>
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
                alignment='distribute'
                layout='horizontal-wrap'
                options={options}
                input={input}
                onChange={value => value
                    ? valueInput.set(userRequestValue)
                    : valueInput.resetValue()
                }
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
