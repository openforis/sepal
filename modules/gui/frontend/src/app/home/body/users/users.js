import {Button} from 'widget/button'
import {compose} from 'compose'
import {connect} from 'store'
import {forkJoin, map, zip} from 'rxjs'
import {msg} from 'translate'
import Notifications from 'widget/notifications'
import React from 'react'
import UserDetails from './userDetails'
import UserList from './userList'
import _ from 'lodash'
import api from 'api'
import styles from './users.module.css'

const getUserList$ = () => forkJoin(
    api.user.getUserList$(),
    api.user.getBudgetReport$()
).pipe(
    map(([users, budget]) =>
        _.map(users, user => ({
            ...user,
            quota: budget[user.username || {}]
        }))
    )
)

class Users extends React.Component {
    state = {
        users: [],
        userDetails: null
    }

    componentDidMount() {
        this.props.stream('LOAD_USER_LIST',
            getUserList$(),
            users => this.setState({users})
        )
    }

    render() {
        const {users} = this.state
        return (
            <div className={styles.container}>
                <UserList users={users} onSelect={user => this.editUser(user)}/>
                {this.renderInviteUser()}
                {this.renderUserDetails()}
            </div>
        )
    }

    renderInviteUser() {
        return (
            <Button
                additionalClassName={styles.inviteUser}
                look='add'
                size='xx-large'
                shape='circle'
                icon='plus'
                tooltip={msg('users.invite.label')}
                tooltipPlacement='left'
                onClick={() => this.inviteUser()}/>
        )
    }

    renderUserDetails() {
        const {userDetails} = this.state
        return userDetails ? (
            <UserDetails
                userDetails={userDetails}
                onCancel={() => this.cancelUser()}
                onSave={userDetails => this.updateUser(userDetails)}/>
        ) : null
    }

    editUser(user) {
        const {username, name, email, organization, admin, quota} = user
        this.setState({
            userDetails: {
                username,
                name,
                email,
                organization,
                admin,
                // monthlyBudgetInstanceSpending: budget.instanceSpending,
                // monthlyBudgetStorageSpending: budget.storageSpending,
                // monthlyBudgetStorageQuota: budget.storageQuota,
                quota
            }
        })
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
                // monthlyBudgetInstanceSpending: 1,
                // monthlyBudgetStorageSpending: 1,
                // monthlyBudgetStorageQuota: 20
            }
        })
    }

    updateUser(userDetails) {
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

        const updateUserDetails$ = ({newUser, username, name, email, organization, admin}) =>
            newUser
                ? api.user.inviteUser$({username, name, email, organization, admin})
                : api.user.updateUser$({username, name, email, organization, admin})

        const updateUserBudget$ = ({username, instanceSpending, storageSpending, storageQuota}) =>
            api.user.updateUserBudget$({username, instanceSpending, storageSpending, storageQuota})

        const updateLocalState = userDetails =>
            this.setState(({users}) => {
                if (userDetails) {
                    const index = users.findIndex(({username}) => username === userDetails.username)
                    index === -1
                        ? users.push(userDetails)
                        : users[index] = {
                            ...userDetails,
                            // Make sure current spending is taken from previous details if not provided in the update.
                            quota: _.merge(users[index].quota, userDetails.quota)
                        }
                }
                return {users}
            })

        const removeFromLocalState = userDetails =>
            this.setState(({users}) => {
                if (userDetails) {
                    _.remove(users, ({username}) => username === userDetails.username)
                }
                return {users}
            })

        this.cancelUser()

        updateLocalState({
            username: userDetails.username,
            name: userDetails.name,
            email: userDetails.email,
            organization: userDetails.organization,
            quota: {
                budget: {
                    instanceSpending: userDetails.monthlyBudgetInstanceSpending,
                    storageSpending: userDetails.monthlyBudgetStorageSpending,
                    storageQuota: userDetails.monthlyBudgetStorageQuota
                }
            }
        })

        this.props.stream('UPDATE_USER',
            update$(userDetails),
            userDetails => {
                updateLocalState(userDetails)
                Notifications.success({message: msg('user.userDetails.update.success')})
            },
            error => {
                removeFromLocalState(userDetails)
                Notifications.error({message: msg('user.userDetails.update.error'), error})
            }
        )
    }

    cancelUser() {
        this.setState({
            userDetails: null
        })
    }
}

Users.propTypes = {}

export default compose(
    Users,
    connect()
)
