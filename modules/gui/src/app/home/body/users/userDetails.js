import {Form, withForm} from 'widget/form/form'
import {Input} from 'widget/input'
import {Layout} from 'widget/layout'
import {ModalConfirmationButton} from 'widget/modalConfirmationButton'
import {Panel} from 'widget/panel/panel'
import {UserStatus} from './userStatus'
import {compose} from 'compose'
import {msg} from 'translate'
import {requestPasswordReset$} from 'user'
import {select} from 'store'
import Confirm from 'widget/confirm'
import Notifications from 'widget/notifications'
import PropTypes from 'prop-types'
import React from 'react'
import styles from './userDetails.module.css'

const isUniqueUser = (id, check) => !(select('users.users') || []).find(user => user.id !== id && check(user))

const fields = {
    id: new Form.Field(),
    username: new Form.Field()
        .notBlank('user.userDetails.form.username.required')
        .match(/^[a-zA-Z_][a-zA-Z0-9]{0,29}$/, 'user.userDetails.form.username.format')
        .predicate((username, {id}) => isUniqueUser(id, user => user.username?.toLowerCase() === username?.toLowerCase()), 'user.userDetails.form.username.unique'),
    name: new Form.Field()
        .notBlank('user.userDetails.form.name.required'),
    email: new Form.Field()
        .notBlank('user.userDetails.form.email.required')
        .email('user.userDetails.form.email.required')
        .predicate((email, {id}) => isUniqueUser(id, user => user.email?.toLowerCase() === email?.toLowerCase()), 'user.userDetails.form.email.unique'),
    organization: new Form.Field()
        .notBlank('user.userDetails.form.organization.required'),
    intendedUse: new Form.Field(),
    // .notBlank('user.userDetails.form.intendedUse.required'),
    admin: new Form.Field(),
    instanceSpending: new Form.Field()
        .notBlank('user.userDetails.form.monthlyBudget.instanceSpending.atLeast1')
        .int('user.userDetails.form.monthlyBudget.instanceSpending.atLeast1')
        .min(0, 'user.userDetails.form.monthlyBudget.instanceSpending.atLeast1'),
    storageSpending: new Form.Field()
        .notBlank('user.userDetails.form.monthlyBudget.storageSpending.atLeast1')
        .int('user.userDetails.form.monthlyBudget.storageSpending.atLeast1')
        .min(0, 'user.userDetails.form.monthlyBudget.storageSpending.atLeast1'),
    storageQuota: new Form.Field()
        .notBlank('user.userDetails.form.monthlyBudget.storageQuota.atLeast1')
        .int('user.userDetails.form.monthlyBudget.storageQuota.atLeast1')
        .min(0, 'user.userDetails.form.monthlyBudget.storageQuota.atLeast1'),
    userRequestInstanceSpendingState: new Form.Field().notNil(),
    userRequestStorageSpendingState: new Form.Field().notNil(),
    userRequestStorageQuotaState: new Form.Field().notNil()
}

const mapStateToProps = (state, ownProps) => {
    const {userDetails} = ownProps
    const {id, newUser, username, name, email, organization, intendedUse, admin = false} = userDetails
    const {quota: {budget: {instanceSpending, storageSpending, storageQuota} = {}, budgetUpdateRequest}} = userDetails
    const userRequestInstanceSpendingState = budgetUpdateRequest ? null : false
    const userRequestStorageSpendingState = budgetUpdateRequest ? null : false
    const userRequestStorageQuotaState = budgetUpdateRequest ? null : false
    return {
        values: {
            id, newUser, username, name, email, organization, intendedUse, admin, instanceSpending, storageSpending, storageQuota,
            userRequestInstanceSpendingState, userRequestStorageSpendingState, userRequestStorageQuotaState
        }
    }
}

class UserDetails extends React.Component {
    constructor(props) {
        super(props)
        this.onChangeInstanceSpending = this.onChangeInstanceSpending.bind(this)
        this.onChangeStorageSpending = this.onChangeStorageSpending.bind(this)
        this.onChangeStorageQuota = this.onChangeStorageQuota.bind(this)
    }

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
        const {form, inputs: {username, name, email, organization, intendedUse, instanceSpending, storageSpending, storageQuota, admin}} = this.props
        const newUser = !this.props.userDetails.username
        return (
            <Form.Panel
                className={styles.panel}
                form={form}
                statePath='userDetails'
                modal
                confirmation={
                    admin.isDirty() ?
                        ({confirm, cancel}) =>
                            <Confirm
                                message={msg('user.userDetails.confirmation.message', {role: msg(`user.role.${admin.value ? 'admin' : 'user'}`)})}
                                onConfirm={confirm}
                                onCancel={cancel}
                            />
                        : null
                }
                onApply={userDetails => this.save(userDetails)}
                onClose={() => this.cancel()}>
                <Panel.Header
                    icon='user'
                    title={msg('user.userDetails.title')}
                    label={this.renderHeaderButtons()}
                />
                <Panel.Content>
                    <Layout>
                        <Form.Input
                            label={msg('user.userDetails.form.username.label')}
                            input={username}
                            disabled={!newUser}
                            autoComplete={false}
                            spellCheck={false}
                            autoFocus={newUser}
                        />
                        <Form.Input
                            label={msg('user.userDetails.form.name.label')}
                            input={name}
                            autoComplete={false}
                            spellCheck={false}
                            autoFocus={!newUser}
                        />
                        <Form.Input
                            label={msg('user.userDetails.form.email.label')}
                            input={email}
                            autoComplete={false}
                            spellCheck={false}
                        />
                        <Form.Input
                            label={msg('user.userDetails.form.organization.label')}
                            input={organization}
                            autoComplete={false}
                            spellCheck={false}
                        />
                        <Form.Input
                            label={msg('user.userDetails.form.intendedUse.label')}
                            input={intendedUse}
                            spellCheck={false}
                            textArea
                            minRows={4}
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
                                errorMessage={false}
                                onChange={this.onChangeInstanceSpending}
                            />
                            <Form.Input
                                label={msg('user.userDetails.form.monthlyBudget.storageSpending.label')}
                                type='number'
                                input={storageSpending}
                                spellCheck={false}
                                prefix='US$/mo.'
                                errorMessage={false}
                                onChange={this.onChangeStorageSpending}
                            />
                            <Form.Input
                                label={msg('user.userDetails.form.monthlyBudget.storageQuota.label')}
                                type='number'
                                input={storageQuota}
                                spellCheck={false}
                                prefix='GB'
                                errorMessage={false}
                                onChange={this.onChangeStorageQuota}
                            />
                        </Form.FieldSet>
                        {this.isUserRequest() ? this.renderUserRequest() : null}
                    </Layout>
                </Panel.Content>
                <Form.PanelButtons>
                    {this.renderLockUnlockButton()}
                    {this.renderResetPasswordButton()}
                </Form.PanelButtons>
            </Form.Panel>
        )
    }

    renderResetPasswordButton() {
        const {userDetails: {status}, inputs: {email}, form} = this.props
        return (
            <ModalConfirmationButton
                label={msg('user.userDetails.resetPassword.label')}
                icon='key'
                tooltip={msg('user.userDetails.resetPassword.tooltip')}
                message={msg('user.userDetails.resetPassword.message')}
                disabled={UserStatus.isLocked(status) || email.isInvalid() || form.isDirty()}
                onConfirm={() => this.requestPasswordReset(email.value)}
            />
        )
    }

    renderLockUnlockButton() {
        const {userDetails: {status}} = this.props
        return UserStatus.isLocked(status)
            ? this.renderUnlockButton()
            : this.renderLockButton()
    }

    renderLockButton() {
        const {form} = this.props
        return (
            <ModalConfirmationButton
                label={msg('user.userDetails.lock.label')}
                icon='lock'
                tooltip={msg('user.userDetails.lock.tooltip')}
                message={msg('user.userDetails.lock.message')}
                disabled={form.isDirty()}
                onConfirm={() => this.lock()}
            />
        )
    }

    renderUnlockButton() {
        const {inputs: {email}, form} = this.props
        return (
            <ModalConfirmationButton
                label={msg('user.userDetails.unlock.label')}
                icon='lock-open'
                tooltip={msg('user.userDetails.unlock.tooltip')}
                message={msg('user.userDetails.unlock.message')}
                disabled={email.isInvalid() || form.isDirty()}
                onConfirm={() => this.unlock()}
            />
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

    renderHeaderButtons() {
        return (
            <Layout type='horizontal-nowrap'>
                {this.renderStatus()}
                {this.renderUserRoleButtons()}
            </Layout>
        )
    }

    renderStatus() {
        const {userDetails: {status, googleTokens}} = this.props
        const isGoogleUser = !!googleTokens
        return (
            <UserStatus status={status} isGoogleUser={isGoogleUser}/>
        )
    }

    renderUserRoleButtons() {
        const {inputs: {admin}} = this.props
        return (
            <Form.Buttons
                input={admin}
                multiple={false}
                options={[{
                    value: false,
                    label: msg('user.role.user')
                }, {
                    value: true,
                    label: msg('user.role.admin')
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
                layout='vertical'
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

    requestPasswordReset(email) {
        this.props.stream('REQUEST_PASSWORD_RESET',
            requestPasswordReset$({email, optional: false}),
            () => Notifications.success({message: msg('landing.forgot-password.success', {email})})
        )
    }

    lock() {
        const {userDetails: {username}, onLock} = this.props
        onLock(username)
    }

    unlock() {
        const {userDetails: {username}, onUnlock} = this.props
        onUnlock(username)
    }
}

UserDetails.propTypes = {
    userDetails: PropTypes.object.isRequired,
    onCancel: PropTypes.func.isRequired,
    onLock: PropTypes.func.isRequired,
    onSave: PropTypes.func.isRequired,
    onUnlock: PropTypes.func.isRequired,
}

export default compose(
    UserDetails,
    withForm({fields, mapStateToProps})
)
