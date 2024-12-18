import React from 'react'

import {ceoLogout} from '~/ceo'
import {compose} from '~/compose'
import {msg} from '~/translate'
import {withActivators} from '~/widget/activation/activator'
import {Button} from '~/widget/button'
import {Icon} from '~/widget/icon'
import {Layout} from '~/widget/layout'

import styles from './ceoConnection.module.css'

export class _CeoConnection extends React.Component {
    constructor(props) {
        super(props)
        this.disconnect = this.disconnect.bind(this)
    }

    render() {
        const {token} = this.props
        return token ? this.renderConnected() : this.renderDisconnected()
    }

    disconnect() {
        const {inputs: {project, institution, csvType}} = this.props
        
        institution.setInitialValue('')
        project.setInitialValue('')
        csvType.setInitialValue(null)

        ceoLogout()
    }
    
    renderConnected() {
        return (
            <Layout type='horizontal-nowrap'>
                <Layout type='horizontal' className={styles.connected}>
                    <Icon name='smile' size='2x'/>
                    <div>
                        {msg('process.classification.panel.trainingData.form.ceo.login.connected.title')}
                    </div>
                </Layout>
                {this.renderDisconnectButton()}
            </Layout>
        )
    }
    
    renderDisconnected() {
        return (
            <>
                <Layout type='horizontal-nowrap' >
                    <Layout type='horizontal' className={styles.disconnected}>
                        <Icon name={'meh'} size='2x'/>
                        <div>
                            {msg('process.classification.panel.trainingData.form.ceo.login.disconnected.title')}
                        </div>
                        <div>
                        </div>
                    </Layout>
                    {this.renderConnectButton()}
                </Layout>
                <div type='horizontal'>
                    {msg('process.classification.panel.trainingData.form.ceo.disconnected.description')}
                </div>
            </>
        )
    }

    renderDisconnectButton() {
        return (
            <Button
                icon={'key'}
                label={msg('process.classification.panel.trainingData.form.ceo.login.disconnect.label')}
                disabled={false}
                onClick={this.disconnect}/>
        )
    }

    renderConnectButton() {
        const {activator: {activatables: {ceoLogin: {activate}}}} = this.props
        return (
            <Button
                icon={'key'}
                label={msg('process.classification.panel.trainingData.form.ceo.login.connect.label')}
                disabled={false}
                onClick={activate}/>
        )
    }
}

export const CeoConnection = compose(
    _CeoConnection,
    withActivators('ceoLogin')
)
