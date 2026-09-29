import React from 'react'

import {compose} from '~/compose'
import {connect} from '~/connect'
import {msg} from '~/translate'
import {removeSshKey$, sshKeys$} from '~/user'
import {withActivatable} from '~/widget/activation/activatable'
import {withActivators} from '~/widget/activation/activator'
import {CrudItem} from '~/widget/crudItem'
import {Layout} from '~/widget/layout'
import {ListItem} from '~/widget/listItem'
import {Message} from '~/widget/message'
import {NoData} from '~/widget/noData'
import {Notifications} from '~/widget/notifications'
import {Panel} from '~/widget/panel/panel'

import styles from './sshKeys.module.css'

// The user module refuses a key beyond this; the panel stops offering Add at the same point.
const MAX_KEYS = 20

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
                        {this.renderIntro()}
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
        const {activatable: {deactivate}} = this.props
        deactivate()
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

    renderIntro() {
        return (
            <Message type='info' icon='comment' iconSize='2x'>
                {msg('user.sshKeys.intro')}
            </Message>
        )
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
                    description={this.renderDescription(key)}
                    timestamp={key.creationTime}
                    removeMessage={msg('user.sshKeys.remove.message', {name: key.name})}
                    removeTooltip={msg('user.sshKeys.remove.tooltip')}
                    removePending={this.isRemoving(key)}
                    onRemove={() => this.remove(key)}
                />
            </ListItem>
        )
    }

    renderDescription(key) {
        return (
            <Layout type='vertical' spacing='none'>
                <div>
                    {key.type}
                </div>
                <div>
                    {key.fingerprint}
                </div>
            </Layout>
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
    connect(),
    withActivators('addSshKey'),
    withActivatable({id: 'sshKeys', policy, alwaysAllow: true})
)

SshKeys.propTypes = {}
