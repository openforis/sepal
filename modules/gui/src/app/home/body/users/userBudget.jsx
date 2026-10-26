import PropTypes from 'prop-types'
import React from 'react'

import {UsageStatistics} from '~/app/home/user/usageStatistics'
import {compose} from '~/compose'
import {msg} from '~/translate'
import {currentUser, requestPasswordReset$} from '~/user'
import {Button} from '~/widget/button'
import {Form} from '~/widget/form'
import {withForm} from '~/widget/form/form'
import {Input} from '~/widget/input'
import {Layout} from '~/widget/layout'
import {ModalConfirmationButton} from '~/widget/modalConfirmationButton'
import {Notifications} from '~/widget/notifications'
import {Panel} from '~/widget/panel/panel'
import {Tag} from '~/widget/tag'

import {UserActivity} from './userActivity'
import styles from './userBudget.module.css'
import {UserStatus} from './userStatus'

const fields = {
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
    const {userDetails: {quota: {budget: {instanceSpending, storageSpending, storageQuota} = {}, budgetUpdateRequest}}} = ownProps
    const userRequestInstanceSpendingState = budgetUpdateRequest ? null : false
    const userRequestStorageSpendingState = budgetUpdateRequest ? null : false
    const userRequestStorageQuotaState = budgetUpdateRequest ? null : false
    return {
        values: {
            instanceSpending, storageSpending, storageQuota,
            userRequestInstanceSpendingState, userRequestStorageSpendingState, userRequestStorageQuotaState
        }
    }
}

// The user panel: the user's details read-only, and the budget module's side of the user — limits
// and any pending budget update request — editable. Applying saves the budget alone; the details are
// edited in their own form, opened from the footer.
class _UserBudget extends React.Component {
    constructor(props) {
        super(props)
        this.onChangeInstanceSpending = this.onChangeInstanceSpending.bind(this)
        this.onChangeStorageSpending = this.onChangeStorageSpending.bind(this)
        this.onChangeStorageQuota = this.onChangeStorageQuota.bind(this)
    }

    // Returns the save observable: the panel waits for the backend, spinning its Apply button, and
    // closes on completion. On failure it stays open with the edits, for another try.
    save({instanceSpending, storageSpending, storageQuota}) {
        const {userDetails: {username}, onSave} = this.props
        return onSave({username, instanceSpending, storageSpending, storageQuota})
    }

    cancel() {
        const {onCancel} = this.props
        onCancel()
    }

    isLocked() {
        const {locked} = this.props
        return !!locked
    }

    render() {
        const {form} = this.props
        const locked = this.isLocked()
        return (
            <Form.Panel
                className={styles.panel}
                placement='modal'
                form={form}
                locked={locked}
                statePath='userBudget'
                onApply={budget => this.save(budget)}
                onClose={() => this.cancel()}>
                <Panel.Header
                    icon='user'
                    title={msg('user.userBudget.title')}
                    label={this.renderHeaderPills()}
                />
                <Panel.Content>
                    <Layout>
                        {this.renderSummary()}
                        {this.renderLimits()}
                        {this.renderUsage()}
                        {this.isUserRequest() ? this.renderUserRequest() : null}
                    </Layout>
                </Panel.Content>
                <Form.PanelButtons>
                    {this.renderEditDetailsButton()}
                    {this.renderLockUnlockButton()}
                    {this.renderResetPasswordButton()}
                </Form.PanelButtons>
            </Form.Panel>
        )
    }

    renderHeaderPills() {
        return (
            <Layout type='horizontal-nowrap' spacing='compact'>
                <Tag look='default' size='small'>{this.renderStatus()}</Tag>
                <Tag look='default' size='small'>{this.renderActivity()}</Tag>
                {this.renderRole()}
            </Layout>
        )
    }

    renderRole() {
        const {userDetails: {admin}} = this.props
        return (
            <Tag
                look='highlight'
                size='small'
                label={msg(`user.role.${admin ? 'admin' : 'user'}`)}
            />
        )
    }

    renderSummary() {
        const {userDetails: {username, name, email, organization, intendedUse}} = this.props
        return (
            <Layout type='vertical' spacing='compact' framed>
                <div className={styles.summary}>
                    <div className={styles.name}>
                        {name}
                        <span className={styles.username}>{username}</span>
                    </div>
                    <div className={styles.contact}>
                        {[email, organization].filter(Boolean).join(' · ')}
                    </div>
                    {intendedUse ? <div className={styles.intendedUse} title={intendedUse}>{intendedUse}</div> : null}
                </div>
            </Layout>
        )
    }

    renderUsage() {
        const {userDetails: {username}} = this.props
        return (
            <UsageStatistics username={username}/>
        )
    }

    renderLimits() {
        const {inputs: {instanceSpending, storageSpending, storageQuota}} = this.props
        const locked = this.isLocked()
        return (
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
                    disabled={locked}
                    spellCheck={false}
                    prefix='US$/mo.'
                    errorMessage={false}
                    autoFocus
                    onChange={this.onChangeInstanceSpending}
                />
                <Form.Input
                    label={msg('user.userDetails.form.monthlyBudget.storageSpending.label')}
                    type='number'
                    input={storageSpending}
                    disabled={locked}
                    spellCheck={false}
                    prefix='US$/mo.'
                    errorMessage={false}
                    onChange={this.onChangeStorageSpending}
                />
                <Form.Input
                    label={msg('user.userDetails.form.monthlyBudget.storageQuota.label')}
                    type='number'
                    input={storageQuota}
                    disabled={locked}
                    spellCheck={false}
                    prefix='GB'
                    errorMessage={false}
                    onChange={this.onChangeStorageQuota}
                />
            </Form.FieldSet>
            
        )
    }

    // Opening the details replaces this panel, so it is only offered while there are no budget edits
    // to lose.
    renderEditDetailsButton() {
        const {form, onEditDetails} = this.props
        return (
            <Button
                label={msg('user.userBudget.editDetails.label')}
                icon='pen-to-square'
                tooltip={msg('user.userBudget.editDetails.tooltip')}
                disabled={this.isLocked() || form.isDirty()}
                onClick={onEditDetails}
            />
        )
    }

    renderResetPasswordButton() {
        const {userDetails: {status, email}, form} = this.props
        return (
            <ModalConfirmationButton
                label={msg('user.userDetails.resetPassword.label')}
                icon='key'
                tooltip={msg('user.userDetails.resetPassword.tooltip')}
                message={msg('user.userDetails.resetPassword.message')}
                disabled={this.isLocked() || UserStatus.isLocked(status) || form.isDirty()}
                onConfirm={() => this.requestPasswordReset(email)}
            />
        )
    }

    renderLockUnlockButton() {
        const {userDetails: {status}} = this.props
        return UserStatus.isLocked(status)
            ? this.renderUnlockButton()
            : this.renderLockButton()
    }

    // Locking ends every session of the account, so the current user must not be able to lock
    // (and thereby be unable to unlock) their own.
    isCurrentUser() {
        const {userDetails: {username}} = this.props
        return username === currentUser()?.username
    }

    renderLockButton() {
        const {form} = this.props
        return (
            <ModalConfirmationButton
                label={msg('user.userDetails.lock.label')}
                icon='lock'
                tooltip={msg('user.userDetails.lock.tooltip')}
                message={msg('user.userDetails.lock.message')}
                disabled={this.isLocked() || this.isCurrentUser() || form.isDirty()}
                onConfirm={() => this.lock()}
            />
        )
    }

    renderUnlockButton() {
        const {form} = this.props
        return (
            <ModalConfirmationButton
                label={msg('user.userDetails.unlock.label')}
                icon='lock-open'
                tooltip={msg('user.userDetails.unlock.tooltip')}
                message={msg('user.userDetails.unlock.message')}
                disabled={this.isLocked() || this.isCurrentUser() || form.isDirty()}
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

    renderStatus() {
        const {userDetails: {status, googleUser}} = this.props
        return (
            <UserStatus status={status} googleUser={googleUser} showLabel={true}/>
        )
    }

    renderActivity() {
        const {userDetails} = this.props
        return (
            <UserActivity user={userDetails}/>
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
                disabled={this.isLocked()}
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

export const UserBudget = compose(
    _UserBudget,
    withForm({fields, mapStateToProps})
)

UserBudget.propTypes = {
    userDetails: PropTypes.object.isRequired,
    onCancel: PropTypes.func.isRequired,
    onEditDetails: PropTypes.func.isRequired,
    onLock: PropTypes.func.isRequired,
    onSave: PropTypes.func.isRequired,
    onUnlock: PropTypes.func.isRequired,
    locked: PropTypes.any
}
