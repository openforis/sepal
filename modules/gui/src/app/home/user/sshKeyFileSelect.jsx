import PropTypes from 'prop-types'
import React from 'react'

import {msg} from '~/translate'
import {FileSelect} from '~/widget/fileSelect'

// The picker filters on these; a drop is checked against the extension, whatever type the browser reports.
const ACCEPT = {
    'application/vnd.ms-publisher': ['.pub'],
    'application/x-mspublisher': ['.pub']
}

// Far beyond the longest public key (a 16384-bit RSA key is under 3 KB).
const MAX_SIZE = 16 * 1024

export class SshKeyFileSelect extends React.Component {
    state = {
        name: null
    }

    render() {
        const {name} = this.state
        return (
            <FileSelect
                single
                accept={ACCEPT}
                onSelect={file => this.onSelect(file)}
                onReject={() => this.onReject()}>
                {name || msg('user.sshKeys.add.form.file.dropOrClick')}
            </FileSelect>
        )
    }

    // The accept check is repeated here: accepting a type lets through any file the browser labels with it.
    async onSelect(file) {
        const {onLoad, onError} = this.props
        if (!file.name.toLowerCase().endsWith('.pub')) {
            this.onReject()
        } else if (file.size > MAX_SIZE) {
            onError(msg('user.sshKeys.add.form.file.tooLarge'))
        } else {
            const publicKey = (await file.text()).trim()
            this.setState({name: file.name})
            onLoad(publicKey)
        }
    }

    onReject() {
        const {onError} = this.props
        onError(msg('user.sshKeys.add.form.file.notPub'))
    }
}

SshKeyFileSelect.propTypes = {
    onError: PropTypes.func.isRequired,
    onLoad: PropTypes.func.isRequired
}
