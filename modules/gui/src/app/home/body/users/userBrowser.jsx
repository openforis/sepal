import _ from 'lodash'
import memoizeOne from 'memoize-one'
import React from 'react'
import {catchError, finalize, forkJoin, map, of, tap, timer} from 'rxjs'

import {actionBuilder} from '~/action-builder'
import api from '~/apiRegistry'
import {compose} from '~/compose'
import {connect} from '~/connect'
import {publishEvent} from '~/eventPublisher'
import {getLogger} from '~/log'
import {withSubscriptions} from '~/subscription'
import {msg} from '~/translate'
import {Button} from '~/widget/button'
import {Icon} from '~/widget/icon'
import {Notification} from '~/widget/notification'
import {Notifications} from '~/widget/notifications'

import {UserAccount} from './userAccount'
import styles from './userBrowser.module.css'
import {UserDetails} from './userDetails'
import {UserList} from './userList'
import {conflictingRecord, createUserWsHandler, newerRows, withoutStale, withPending, withRows} from './userListLive'

const log = getLogger('userBrowser')

const SPINNER_COMFORT_DELAY_MS = 500

// The user rows, their budgets and their latest activity come from three modules and are kept
// apart, so a user row pushed by the user module replaces the shown one outright.
const mapStateToProps = state => ({
    users: state?.users?.users || [],
    budgets: state?.users?.budgets || {},
    activities: state?.users?.activities || {}
})

const getUserList$ = () => forkJoin([
    api.user.getUserList$(),
    api.user.getBudgetReport$().pipe(
        catchError(() => of({}))
    ),
    api.storage.getMostRecentEvents$().pipe(
        catchError(() => of({}))
    ),
    timer(SPINNER_COMFORT_DELAY_MS)
]).pipe(
    map(([users, budgets, activities]) => ({users, budgets, activities}))
)

const combineRows = memoizeOne((users, budgets, activities) =>
    users.map(user => ({
        ...user,
        quota: budgets[user.username] || {},
        activity: activities[user.username] || {}
    }))
)

class _UserBrowser extends React.Component {
    state = {
        userId: null,
        editingDetails: false,
        // Rows held back until the admin asks for them, latest per user, each newer than shown.
        pending: {},
        saving: false,
        applyingUpdates: false
    }

    constructor(props) {
        super(props)
        this.editUser = this.editUser.bind(this)
        this.cancelUser = this.cancelUser.bind(this)
        this.editDetails = this.editDetails.bind(this)
        this.closeDetails = this.closeDetails.bind(this)
        this.updateUser = this.updateUser.bind(this)
        this.updateBudget = this.updateBudget.bind(this)
        this.lockUser = this.lockUser.bind(this)
        this.unlockUser = this.unlockUser.bind(this)
        this.applyUpdates = this.applyUpdates.bind(this)
        this.onUpdate = this.onUpdate.bind(this)
    }

    // Mounted on the first visit to the users section and kept, so the live subscription starts
    // with the first look at the list and follows it for the rest of the login.
    componentDidMount() {
        const {stream, addSubscription} = this.props
        stream('LOAD_USER_LIST',
            getUserList$(),
            loaded => this.setLoaded(loaded)
        )
        const onMessage = createUserWsHandler({
            onUser: user => this.holdRows([user]),
            onReconnect: () => this.reloadUsers()
        })
        addSubscription(
            api.user.ws().downstream$.subscribe({
                next: message => onMessage(message),
                error: error => log.error('downstream$ error', error),
                complete: () => log.error('downstream$ complete')
            })
        )
    }

    // Changes missed while disconnected: user rows are held back like pushed ones, while budgets
    // and activity, which no one edits here, are simply refreshed.
    reloadUsers() {
        const {stream} = this.props
        stream('RELOAD_USER_LIST',
            getUserList$(),
            ({users, budgets, activities}) => {
                this.holdRows(users)
                this.setStored({budgets, activities})
            }
        )
    }

    setLoaded({users, budgets, activities}) {
        this.setStored({users, budgets, activities})
        this.setState({pending: {}})
    }

    setStored(stored) {
        const builder = actionBuilder('UPDATE_USERS', stored)
        Object.entries(stored).forEach(([key, value]) => builder.set(['users', key], value))
        builder.dispatch()
    }

    holdRows(rows) {
        const {users} = this.props
        this.setState(({pending}) => ({pending: withPending(pending, newerRows(users, rows))}))
    }

    writeRows(rows) {
        const {users} = this.props
        this.setStored({users: withRows(users, rows)})
        this.setState(({pending}) => ({pending: withoutStale(pending, rows)}))
    }

    onUpdate() {
        this.setState({applyingUpdates: true})
        setImmediate(() => this.applyUpdates())
    }

    applyUpdates(usernames = Object.keys(this.state.pending)) {
        const {pending} = this.state
        this.writeRows(usernames.map(username => pending[username]))
        this.setState({applyingUpdates: false})
    }

    rows() {
        const {users, budgets, activities} = this.props
        return combineRows(users, budgets, activities)
    }

    openUser() {
        const {userId} = this.state
        return this.rows().find(({id}) => id === userId)
    }

    // The account panel shows the details read-only, so it takes a waiting change as it comes; only the
    // details form, which edits them, holds it back.
    latestOpenUser() {
        const {pending} = this.state
        const user = this.openUser()
        return user && {...user, ...pending[user.username]}
    }

    // The change waiting for the details form's record, if any. None while saving: the echo of the
    // admin's own save is on its way and the response will settle it.
    openRecordUpdate() {
        const {pending, saving, editingDetails} = this.state
        const user = this.openUser()
        return user && editingDetails && !saving ? pending[user.username] : undefined
    }

    renderLoading() {
        return (
            <div className={styles.container}>
                <Icon name='spinner' size='2x'/>
            </div>
        )
    }

    renderLoaded() {
        const {pending, applyingUpdates} = this.state
        return (
            <UserList
                users={this.rows()}
                updatePending={!_.isEmpty(pending) && !applyingUpdates}
                onUpdate={this.onUpdate}
                onSelect={this.editUser}/>
        )
    }

    render() {
        const {stream} = this.props
        return (
            <div className={styles.container}>
                {stream('LOAD_USER_LIST').active ? this.renderLoading() : this.renderLoaded()}
                {this.renderUserPanel()}
                {this.renderRecordChangedWarning()}
            </div>
        )
    }

    renderUserPanel() {
        const {editingDetails} = this.state
        return editingDetails
            ? this.renderUserDetails()
            : this.renderUserAccount()
    }

    renderUserAccount() {
        const {saving} = this.state
        const user = this.latestOpenUser()
        return user ? (
            <UserAccount
                userDetails={user}
                locked={saving}
                onCancel={this.cancelUser}
                onEditDetails={this.editDetails}
                onLock={this.lockUser}
                onSave={this.updateBudget}
                onUnlock={this.unlockUser}
            />
        ) : null
    }

    renderUserDetails() {
        const {saving} = this.state
        const user = this.openUser()
        return user ? (
            <UserDetails
                userDetails={user}
                locked={saving || !!this.openRecordUpdate()}
                onCancel={this.closeDetails}
                onSave={this.updateUser}
            />
        ) : null
    }

    // Up while the open record has a change waiting; only Update, or closing the panel, take it
    // down, so a locked form keeps its reason in view.
    renderRecordChangedWarning() {
        const row = this.openRecordUpdate()
        return row ? (
            <Notification
                id='users.record.changed'
                level='warning'
                message={msg('users.record.changed')}
                content={() =>
                    <Button
                        look='add'
                        shape='pill'
                        label={msg('users.record.update')}
                        width='max'
                        onClick={() => this.applyUpdates([row.username])}
                    />
                }
            />
        ) : null
    }

    editUser({id: userId}) {
        this.setState({userId, editingDetails: false})
    }

    // The details form starts from the record as it is now, not from a warning that it changed.
    editDetails() {
        const {pending} = this.state
        const {username} = this.openUser()
        pending[username] && this.applyUpdates([username])
        this.setState({editingDetails: true})
    }

    closeDetails() {
        this.setState({editingDetails: false})
    }

    // Handed to the details form, which waits on it: the list takes the saved row from the response,
    // never ahead of it.
    updateUser({username, name, email, organization, intendedUse, admin, revision}) {
        this.setState({saving: true})
        return api.user.updateUser$({username, name, email, organization, intendedUse, admin, revision}).pipe(
            tap({
                next: updatedDetails => {
                    publishEvent('user_updated')
                    this.writeRows([updatedDetails])
                },
                error: error => this.onUpdateFailed(error)
            }),
            finalize(() => this.setState({saving: false}))
        )
    }

    updateBudget({username, instanceSpending, storageSpending, storageQuota}) {
        this.setState({saving: true})
        return api.user.updateUserBudget$({username, instanceSpending, storageSpending, storageQuota}).pipe(
            tap({
                next: budget => this.onBudgetUpdated(username, budget),
                error: error => Notifications.error({message: msg('user.userDetails.update.error'), error})
            }),
            finalize(() => this.setState({saving: false}))
        )
    }

    onBudgetUpdated(username, budget) {
        const {budgets} = this.props
        this.setStored({
            budgets: {...budgets, [username]: {...budgets[username], budget, budgetUpdateRequest: null}}
        })
    }

    onUpdateFailed(error) {
        const current = conflictingRecord(error)
        if (current) {
            this.holdRows([current])
            Notifications.error({message: msg('user.userDetails.update.conflict')})
        } else {
            Notifications.error({message: msg('user.userDetails.update.error'), error})
        }
    }

    lockUser(username) {
        this.props.stream('LOCK_USER',
            api.user.lockUser$(username),
            userDetails => {
                this.writeRows([userDetails])
                Notifications.success({message: msg('user.userDetails.lock.success')})
            },
            error => {
                Notifications.error({message: msg('user.userDetails.lock.error'), error})
            }
        )
    }

    unlockUser(username) {
        this.props.stream('UNLOCK_USER',
            api.user.unlockUser$(username),
            userDetails => {
                this.writeRows([userDetails])
                Notifications.success({message: msg('user.userDetails.unlock.success')})
            },
            error => {
                Notifications.error({message: msg('user.userDetails.unlock.error'), error})
            }
        )
    }

    // The account panel's form cancels itself as it unmounts, which it also does when the details form
    // replaces it.
    cancelUser() {
        this.state.editingDetails || this.setState({userId: null})
    }
}

_UserBrowser.propTypes = {}

export const UserBrowser = compose(
    _UserBrowser,
    connect(mapStateToProps),
    withSubscriptions()
)
