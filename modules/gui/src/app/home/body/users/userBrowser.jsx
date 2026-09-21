import _ from 'lodash'
import memoizeOne from 'memoize-one'
import React from 'react'
import {catchError, finalize, forkJoin, map, of, switchMap, tap, timer} from 'rxjs'

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
        // Rows held back until the admin asks for them, latest per user, each newer than shown.
        pending: {},
        saving: false
    }

    constructor(props) {
        super(props)
        this.editUser = this.editUser.bind(this)
        this.cancelUser = this.cancelUser.bind(this)
        this.updateUser = this.updateUser.bind(this)
        this.lockUser = this.lockUser.bind(this)
        this.unlockUser = this.unlockUser.bind(this)
        this.applyUpdates = this.applyUpdates.bind(this)
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

    applyUpdates(usernames = Object.keys(this.state.pending)) {
        const {pending} = this.state
        this.writeRows(usernames.map(username => pending[username]))
    }

    rows() {
        const {users, budgets, activities} = this.props
        return combineRows(users, budgets, activities)
    }

    openUser() {
        const {userId} = this.state
        return this.rows().find(({id}) => id === userId)
    }

    // The change waiting for the open record, if any. None while saving: the echo of the admin's
    // own save is on its way and the response will settle it.
    openRecordUpdate() {
        const {pending, saving} = this.state
        const user = this.openUser()
        return user && !saving ? pending[user.username] : undefined
    }

    renderLoading() {
        return (
            <div className={styles.container}>
                <Icon name='spinner' size='2x'/>
            </div>
        )
    }

    renderLoaded() {
        const {pending} = this.state
        return (
            <UserList
                users={this.rows()}
                updateCount={_.size(pending)}
                onUpdate={() => this.applyUpdates()}
                onSelect={this.editUser}/>
        )
    }

    render() {
        const {stream} = this.props
        return (
            <div className={styles.container}>
                {stream('LOAD_USER_LIST').active ? this.renderLoading() : this.renderLoaded()}
                {this.renderUserDetails()}
                {this.renderRecordChangedWarning()}
            </div>
        )
    }

    renderUserDetails() {
        const {saving} = this.state
        const user = this.openUser()
        return user ? (
            <UserDetails
                userDetails={user}
                locked={saving || !!this.openRecordUpdate()}
                onCancel={this.cancelUser}
                onLock={this.lockUser}
                onSave={this.updateUser}
                onUnlock={this.unlockUser}
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
        this.setState({userId})
    }

    updateUser(userDetails) {
        const updateUserDetails$ = ({username, name, email, organization, intendedUse, admin, revision}) =>
            api.user.updateUser$({username, name, email, organization, intendedUse, admin, revision}).pipe(
                tap(() => publishEvent('user_updated'))
            )

        const updateUserBudget$ = ({username, instanceSpending, storageSpending, storageQuota}) =>
            api.user.updateUserBudget$({username, instanceSpending, storageSpending, storageQuota})

        // Details first: a save rejected as stale must not write the budget either.
        const update$ = userDetails =>
            updateUserDetails$(userDetails).pipe(
                switchMap(updatedDetails =>
                    updateUserBudget$(userDetails).pipe(
                        map(budget => ({updatedDetails, budget}))
                    )
                )
            )

        // Handed to the details panel, which waits on it: the list takes the saved row from the
        // response, never ahead of it.
        this.setState({saving: true})
        return update$(userDetails).pipe(
            tap({
                next: ({updatedDetails, budget}) => this.onUpdated(updatedDetails, budget),
                error: error => this.onUpdateFailed(error)
            }),
            finalize(() => this.setState({saving: false}))
        )
    }

    onUpdated(updatedDetails, budget) {
        const {budgets} = this.props
        const {username} = updatedDetails
        this.writeRows([updatedDetails])
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

    cancelUser() {
        this.setState({
            userId: null
        })
    }
}

_UserBrowser.propTypes = {}

export const UserBrowser = compose(
    _UserBrowser,
    connect(mapStateToProps),
    withSubscriptions()
)
