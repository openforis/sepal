import {UserStatus} from './userStatus'
import {compose} from 'compose'
import {connect} from 'store'
import {forkJoin, map, tap, zip} from 'rxjs'
import {msg} from 'translate'
import {publishEvent} from 'eventPublisher'
import Notifications from 'widget/notifications'
import React from 'react'
import UserDetails from './userDetails'
import UserList from './userList'
import _ from 'lodash'
import actionBuilder from 'action-builder'
import api from 'api'
import styles from './userBrowser.module.css'

const mapStateToProps = state => ({
    users: state?.users?.users || []
})

const getUserList$ = () => forkJoin(
    api.user.getUserList$(),
    api.user.getBudgetReport$()
).pipe(
    map(([users, budget]) =>
        _.map(users, user => ({
            ...user,
            quota: budget[user.username] || {}
        }))
    )
)

class _UserBrowser extends React.Component {
    state = {
        userId: null
    }

    constructor(props) {
        super(props)
        this.editUser = this.editUser.bind(this)
        this.cancelUser = this.cancelUser.bind(this)
        this.updateUser = this.updateUser.bind(this)
        this.inviteUser = this.inviteUser.bind(this)
        this.lockUser = this.lockUser.bind(this)
        this.unlockUser = this.unlockUser.bind(this)
    }

    componentDidMount() {
        this.props.stream('LOAD_USER_LIST',
            getUserList$(),
            users => this.updateUsers(users)
        )
    }

    updateUsers(users) {
        actionBuilder('UPDATE_USERS', {users})
            .set('users.users', users)
            .dispatch()
    }

    render() {
        const {users} = this.props
        return (
            <div className={styles.container}>
                <UserList
                    users={users}
                    onSelect={this.editUser}/>
                {this.renderUserDetails()}
            </div>
        )
    }

    renderUserDetails() {
        const {users} = this.props
        const {userId} = this.state
        const user = users.find(({id}) => id === userId)
        return user ? (
            <UserDetails
                userDetails={user}
                onCancel={this.cancelUser}
                onLock={this.lockUser}
                onSave={this.updateUser}
                onUnlock={this.unlockUser}
            />
        ) : null
    }

    editUser({id: userId}) {
        this.setState({userId})
    }

    inviteUser() {
        this.setState({
            userDetails: {
                newUser: true,
                quota: {
                    budget: {
                        instanceSpending: 1,
                        storageSpending: 1,
                        storageQuota: 20
                    }
                }
            }
        })
    }

    updateUserDetails(userDetails, merge = false) {
        const users = [...this.props.users || []]
        if (userDetails) {
            const index = users.findIndex(({username}) => username === userDetails.username)
            if (index === -1) {
                users.push(userDetails)
            } else {
                const user = {
                    ...userDetails,
                    // Make sure current spending is taken from previous details if not provided in the update.
                    quota: _.merge(users[index].quota, userDetails.quota)
                }
                if (merge) {
                    users[index] = {
                        ...users[index],
                        ...user
                    }
                } else {
                    users[index] = user
                }

            }
            this.updateUsers(users)
        }
    }

    removeFromLocalState(usernameToRemove) {
        const users = [...this.props.users || []]
        if (usernameToRemove) {
            this.updateUsers(users.filter(({username}) => username !== usernameToRemove))
        }
    }

    updateUser(userDetails) {
        const updateUserDetails$ = ({newUser, username, name, email, organization, intendedUse, admin}) =>
            newUser
                ? api.user.inviteUser$({username, name, email, organization, intendedUse, admin}).pipe(
                    tap(() => publishEvent('user_invited'))
                )
                : api.user.updateUser$({username, name, email, organization, intendedUse, admin}).pipe(
                    tap(() => publishEvent('user_updated'))
                )

        const updateUserBudget$ = ({username, instanceSpending, storageSpending, storageQuota}) =>
            api.user.updateUserBudget$({username, instanceSpending, storageSpending, storageQuota})

        const update$ = userDetails =>
            zip(
                updateUserDetails$(userDetails),
                updateUserBudget$(userDetails)
            ).pipe(
                map(([userDetails, userBudget]) => ({
                    ...userDetails,
                    quota: {
                        budget: userBudget
                    }
                }))
            )

        this.cancelUser()

        this.updateUserDetails({
            username: userDetails.username,
            name: userDetails.name,
            email: userDetails.email,
            organization: userDetails.organization,
            intendedUse: userDetails.intendedUse,
            quota: {
                budget: {
                    instanceSpending: userDetails.monthlyBudgetInstanceSpending,
                    storageSpending: userDetails.monthlyBudgetStorageSpending,
                    storageQuota: userDetails.monthlyBudgetStorageQuota
                },
                budgetUpdateRequest: null
            }
        }, true)

        this.props.stream('UPDATE_USER',
            update$(userDetails),
            userDetails => {
                this.updateUserDetails(userDetails)
                Notifications.success({message: msg('user.userDetails.update.success')})
            },
            error => {
                Notifications.error({message: msg('user.userDetails.update.error'), error})
            }
        )
    }

    lockUser(username) {
        this.updateUserDetails({
            username,
            status: UserStatus.LOCKED
        }, true)

        this.props.stream('LOCK_USER',
            api.user.lockUser$(username),
            userDetails => {
                this.updateUserDetails(userDetails)
                Notifications.success({message: msg('user.userDetails.lock.success')})
            },
            error => {
                Notifications.error({message: msg('user.userDetails.lock.error'), error})
            }
        )
    }

    unlockUser(username) {
        this.updateUserDetails({
            username,
            status: UserStatus.PENDING
        }, true)

        this.props.stream('UNLOCK_USER',
            api.user.unlockUser$(username),
            userDetails => {
                this.updateUserDetails(userDetails)
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
    connect(mapStateToProps)
)
