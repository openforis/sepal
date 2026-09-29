import React from 'react'
import {catchError, EMPTY, switchMap, throwError} from 'rxjs'

import {compose} from '~/compose'
import {msg} from '~/translate'
import {addSshKey$} from '~/user'
import {withActivatable} from '~/widget/activation/activatable'
import {withActivators} from '~/widget/activation/activator'
import {Form} from '~/widget/form'
import {withForm} from '~/widget/form/form'
import {Layout} from '~/widget/layout'
import {Message} from '~/widget/message'
import {Notifications} from '~/widget/notifications'
import {Panel} from '~/widget/panel/panel'
import {Widget} from '~/widget/widget'

import styles from './addSshKey.module.css'
import {hidePrivateKey, publicKeyField} from './publicKey'
import {SshKeyFileSelect} from './sshKeyFileSelect'

const fields = {
    publicKey: publicKeyField(),
    name: new Form.Field()
}

const mapStateToProps = () => ({values: {}})

class _AddSshKey extends React.Component {
    constructor(props) {
        super(props)
        this.close = this.close.bind(this)
        this.addKey$ = this.addKey$.bind(this)
    }

    render() {
        const {form} = this.props
        return (
            <Form.Panel
                className={styles.panel}
                placement='modal'
                form={form}
                isActionForm={true}
                onApply={this.addKey$}
                onClose={this.close}>
                <Panel.Header
                    icon='terminal'
                    title={msg('user.sshKeys.add.title')}/>
                <Panel.Content>
                    {this.renderForm()}
                </Panel.Content>
                <Form.PanelButtons applyLabel={msg('user.sshKeys.add.label')}/>
            </Form.Panel>
        )
    }

    close() {
        const {activator: {activatables: {sshKeys}}} = this.props
        sshKeys.activate()
    }

    // A refused key keeps the form open with the reason on the key field; the panel closes back to the
    // list, which reloads, only once the key is stored.
    addKey$({publicKey, name}) {
        return addSshKey$({publicKey, name}).pipe(
            catchError(error => {
                Notifications.error({message: msg('user.sshKeys.add.error.failed'), error})
                return throwError(() => error)
            }),
            switchMap(response => {
                if (response?.code) {
                    this.props.inputs.publicKey.setInvalid(refusalMessage(response.code))
                    return throwError(() => new Error(response.code))
                }
                Notifications.success({message: msg('user.sshKeys.add.success')})
                return EMPTY
            })
        )
    }

    renderForm() {
        const {inputs: {publicKey, name}} = this.props
        return (
            <Layout type='vertical'>
                {this.renderHowTo()}
                <Widget className={styles.fileSelect} label={msg('user.sshKeys.add.form.file.label')}>
                    <SshKeyFileSelect
                        onLoad={key => publicKey.set(hidePrivateKey(key))}
                        onError={message => publicKey.setInvalid(message)}
                    />
                </Widget>
                <Form.Input
                    label={msg('user.sshKeys.add.form.publicKey.label')}
                    placeholder={msg('user.sshKeys.add.form.publicKey.placeholder')}
                    textArea
                    minRows={5}
                    maxRows={5}
                    autoFocus
                    input={publicKey}
                    onChange={value => publicKey.set(hidePrivateKey(value))}
                />
                <Form.Input
                    label={msg('user.sshKeys.add.form.name.label')}
                    placeholder={msg('user.sshKeys.add.form.name.placeholder')}
                    input={name}
                />
            </Layout>
        )
    }

    renderHowTo() {
        return (
            <Message type='info' icon='comment' iconSize='2x'>
                {msg('user.sshKeys.add.howTo')}
            </Message>
        )
    }
}

const policy = () => ({
    _: 'disallow',
    sshKeys: 'allow-then-deactivate'
})

export const AddSshKey = compose(
    _AddSshKey,
    withForm({fields, mapStateToProps}),
    withActivators('sshKeys'),
    withActivatable({id: 'addSshKey', policy, alwaysAllow: true})
)

AddSshKey.propTypes = {}

// Literal keys, so the translations test checks every one of them.
const refusalMessage = code => {
    switch (code) {
        case 'DUPLICATE_KEY':
            return msg('user.sshKeys.add.error.DUPLICATE_KEY')
        case 'KEY_TOO_WEAK':
            return msg('user.sshKeys.add.error.KEY_TOO_WEAK')
        case 'TOO_MANY_KEYS':
            return msg('user.sshKeys.add.error.TOO_MANY_KEYS')
        case 'UNSUPPORTED_TYPE':
            return msg('user.sshKeys.add.error.UNSUPPORTED_TYPE')
        default:
            return msg('user.sshKeys.add.error.INVALID_KEY')
    }
}
