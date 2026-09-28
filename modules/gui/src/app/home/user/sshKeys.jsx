import PropTypes from 'prop-types'
import React from 'react'

import {compose} from '~/compose'
import {connect} from '~/connect'
import {msg} from '~/translate'
import {currentUser, removeSshKey$, sshKeys$} from '~/user'
import {withActivatable} from '~/widget/activation/activatable'
import {withActivators} from '~/widget/activation/activator'
import {Button} from '~/widget/button'
import {CrudItem} from '~/widget/crudItem'
import {Layout} from '~/widget/layout'
import {ListItem} from '~/widget/listItem'
import {NoData} from '~/widget/noData'
import {Notifications} from '~/widget/notifications'
import {Panel} from '~/widget/panel/panel'

import styles from './sshKeys.module.css'

// The user module refuses a key beyond this; the panel stops offering Add at the same point.
const MAX_KEYS = 20

const mapStateToProps = () => ({
    username: currentUser()?.username
})

class _SshKeys extends React.Component {
    state = {
        keys: null
    }

    constructor(props) {
        super(props)
        this.close = this.close.bind(this)
        this.add = this.add.bind(this)
    }

    render() {
        return (
            <Panel className={styles.panel} placement='modal' onBackdropClick={this.close}>
                <Panel.Header icon='terminal' title={msg('user.sshKeys.title')}/>
                <Panel.Content scrollable>
                    <Layout type='vertical'>
                        <div>{this.renderHowTo()}</div>
                        {this.renderKeys()}
                    </Layout>
                </Panel.Content>
                <Panel.Buttons>
                    <Panel.Buttons.Main>
                        <Panel.Buttons.Close keybinding='Escape' onClick={this.close}/>
                    </Panel.Buttons.Main>
                    <Panel.Buttons.Extra>
                        <Panel.Buttons.Add disabled={!this.canAdd()} onClick={this.add}/>
                    </Panel.Buttons.Extra>
                </Panel.Buttons>
            </Panel>
        )
    }

    componentDidMount() {
        this.load()
    }

    close() {
        const {activator: {activatables: {userDetails}}} = this.props
        userDetails.activate()
    }

    add() {
        const {activator: {activatables: {addSshKey}}} = this.props
        addSshKey.activate()
    }

    remove(key) {
        const {stream} = this.props
        stream(`REMOVE_SSH_KEY_${key.id}`,
            removeSshKey$(key.id),
            () => this.setState(({keys}) => ({keys: keys.filter(({id}) => id !== key.id)})),
            error => Notifications.error({message: msg('user.sshKeys.remove.error'), error})
        )
    }

    renderHowTo() {
        const {username} = this.props
        return msg('user.sshKeys.howTo', {
            generate: 'ssh-keygen -t ed25519',
            publicKeyFile: '~/.ssh/id_ed25519.pub',
            login: `ssh ${username}@${window.location.hostname}`
        })
    }

    renderKeys() {
        const {keys} = this.state
        if (!keys) {
            return null
        }
        return keys.length
            ? (
                <Layout type='vertical' spacing='tight'>
                    {keys.map(key => this.renderKey(key))}
                </Layout>
            )
            : <NoData message={msg('user.sshKeys.none')}/>
    }

    renderKey(key) {
        return (
            <ListItem key={key.id}>
                <CrudItem
                    title={key.name}
                    description={`${key.type} · ${key.fingerprint}`}
                    timestamp={key.creationTime}
                    removeMessage={msg('user.sshKeys.remove.message', {name: key.name})}
                    removeTooltip={msg('user.sshKeys.remove.tooltip')}
                    removePending={this.isRemoving(key)}
                    onRemove={() => this.remove(key)}
                />
            </ListItem>
        )
    }

    isRemoving(key) {
        const {stream} = this.props
        return stream(`REMOVE_SSH_KEY_${key.id}`).active
    }

    canAdd() {
        const {keys} = this.state
        return keys !== null && keys.length < MAX_KEYS
    }

    load() {
        const {stream} = this.props
        stream('LOAD_SSH_KEYS',
            sshKeys$(),
            keys => this.setState({keys}),
            error => Notifications.error({message: msg('user.sshKeys.load.error'), error})
        )
    }
}

const policy = () => ({
    _: 'disallow',
    userDetails: 'allow-then-deactivate',
    addSshKey: 'allow-then-deactivate'
})

export const SshKeys = compose(
    _SshKeys,
    connect(mapStateToProps),
    withActivators('userDetails', 'addSshKey'),
    withActivatable({id: 'sshKeys', policy, alwaysAllow: true})
)

SshKeys.propTypes = {}

class _SshKeysButton extends React.Component {
    render() {
        const {disabled, activator: {activatables: {sshKeys: {activate, canActivate}}}} = this.props
        return (
            <Button
                icon='terminal'
                label={msg('user.sshKeys.label')}
                disabled={!canActivate || disabled}
                onClick={activate}/>
        )
    }
}

export const SshKeysButton = compose(
    _SshKeysButton,
    withActivators('sshKeys')
)

SshKeysButton.propTypes = {
    disabled: PropTypes.any
}
