import PropTypes from 'prop-types'
import React from 'react'

import {compose} from '~/compose'
import {connect} from '~/connect'
import {msg} from '~/translate'
import {logout$} from '~/user'
import {withActivators} from '~/widget/activation/activator'
import {ButtonSelect} from '~/widget/buttonSelect'

class _UserMenuButton extends React.Component {
    render() {
        const {className, username, googleAccount, hint} = this.props
        return (
            <ButtonSelect
                chromeless
                look='transparent'
                size='large'
                air='less'
                additionalClassName={className}
                icon={googleAccount ? 'google' : 'user'}
                iconType={googleAccount ? 'brands' : null}
                label={username}
                hint={hint}
                tooltip={msg('home.sections.user.profile')}
                tooltipPlacement='top'
                placement='above'
                hPlacement='over-left'
                noChevron
                options={this.getOptions()}
            />
        )
    }

    getOptions() {
        const {activator: {activatables: {userDetails, changePassword, googleAccount, sshKeys}}} = this.props
        return [
            this.option({value: 'userDetails', label: msg('user.userDetails.title'), icon: 'user'}, userDetails),
            this.option({value: 'changePassword', label: msg('user.changePassword.label'), icon: 'key'}, changePassword),
            this.option({value: 'googleAccount', label: msg('user.googleAccount.label'), icon: 'google', iconType: 'brands'}, googleAccount),
            this.option({value: 'sshKeys', label: msg('user.sshKeys.label'), icon: 'terminal'}, sshKeys),
            {key: 'separator', group: true},
            {value: 'logout', label: msg('home.sections.logout'), icon: 'sign-out-alt', onSelect: () => this.logout()}
        ]
    }

    logout() {
        const {stream} = this.props
        stream('LOGOUT', logout$())
    }

    option(entry, {activate, canActivate}) {
        return {
            ...entry,
            disabled: !canActivate,
            onSelect: () => activate()
        }
    }
}

export const UserMenuButton = compose(
    _UserMenuButton,
    connect(),
    withActivators('userDetails', 'changePassword', 'googleAccount', 'sshKeys')
)

UserMenuButton.propTypes = {
    className: PropTypes.string,
    googleAccount: PropTypes.any,
    hint: PropTypes.any,
    username: PropTypes.string
}
