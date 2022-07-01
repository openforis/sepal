import {Button} from 'widget/button'
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
import styles from './users.module.css'

const mapStateToProps = state => ({
    users: state.users || []
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

class Users extends React.Component {
    state = {
        users: [],
        userDetails: null
    }

    constructor(props) {
        super(props)
        this.editUser = this.editUser.bind(this)
        this.cancelUser = this.cancelUser.bind(this)
        this.updateUser = this.updateUser.bind(this)
        this.inviteUser = this.inviteUser.bind(this)
    }

    componentDidMount() {
        this.props.stream('LOAD_USER_LIST',
            getUserList$(),
            users => this.updateUsers(users)
        )
    }

    updateUsers(users) {
        actionBuilder('UPDATE_USERS', {users})
            .set('users', users)
            .dispatch()
    }

    render() {
        const {users} = this.props
        return (
            <div className={styles.container}>
                <UserList
                    users={users}
                    onSelect={this.editUser}/>
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
                onClick={this.inviteUser}/>
        )
    }

    renderUserDetails() {
        const {userDetails} = this.state
        return userDetails ? (
            <UserDetails
                userDetails={userDetails}
                onCancel={this.cancelUser}
                onSave={this.updateUser}/>
        ) : null
    }

    editUser(user) {
        const {id, username, name, email, organization, intendedUse, admin, quota} = user
        this.setState({
            userDetails: {
                id,
                username,
                name,
                email,
                organization,
                intendedUse,
                admin,
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

        const updateUserDetails = userDetails => {
            const users = [...this.props.users || []]
            if (userDetails) {
                const index = users.findIndex(({username}) => username === userDetails.username)
                index === -1
                    ? users.push(userDetails)
                    : users[index] = {
                        ...userDetails,
                        // Make sure current spending is taken from previous details if not provided in the update.
                        quota: _.merge(users[index].quota, userDetails.quota)
                    }
                this.updateUsers(users)
            }
        }

        const removeFromLocalState = userDetails => {
            const users = {...this.props.users || {}}
            if (userDetails) {
                this.updateUsers(users.filter(({username}) => username !== userDetails.username))
            }
        }

        this.cancelUser()

        updateUserDetails({
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
                }
            }
        })

        this.props.stream('UPDATE_USER',
            update$(userDetails),
            userDetails => {
                updateUserDetails(userDetails)
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
    connect(mapStateToProps)
)
