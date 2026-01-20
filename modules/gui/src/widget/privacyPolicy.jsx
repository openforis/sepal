import _ from 'lodash'
import React from 'react'

import {compose} from '~/compose'
import {connect} from '~/connect'
import {msg} from '~/translate'
import {acceptPrivacyPolicy$, currentUser} from '~/user'
import {Notifications} from '~/widget/notifications'
import {Panel} from '~/widget/panel/panel'

import styles from './privacyPolicy.module.css'

const mapStateToProps = () => ({
    user: currentUser()
})

class _PrivacyPolicy extends React.Component {
    constructor(props) {
        super(props)
        this.acceptPrivacyPolicy = this.acceptPrivacyPolicy.bind(this)
    }

    state = {
        privacyPolicy: ''
    }

    // regular subscription to make sure backend request is not cancelled
    acceptPrivacyPolicy() {
        acceptPrivacyPolicy$().subscribe({
            error: error => Notifications.error({message: msg('user.privacyPolicy.accept.error'), error})
        })
    }

    renderPanel() {
        return (
            <React.Fragment>
                <Panel.Header
                    icon='scale-balanced'
                    title={msg('user.privacyPolicy.title')}
                />
                <Panel.Content>
                    <div className={styles.privacyPolicy}>
                        <div dangerouslySetInnerHTML={{__html: this.state.privacyPolicy}}/>
                    </div>
                </Panel.Content>
                <Panel.Buttons>
                    <Panel.Buttons.Main>
                        <Panel.Buttons.Apply
                            label={msg('user.privacyPolicy.accept.label')}
                            keybinding={['Enter', 'Escape']}
                            onClick={this.acceptPrivacyPolicy}
                        />
                    </Panel.Buttons.Main>
                </Panel.Buttons>
            </React.Fragment>
        )
    }

    render() {
        const {user} = this.props
        return user.privacyPolicyAccepted ?
            null
            : (
                <Panel
                    className={styles.panel}
                    placement='modal'>
                    {this.renderPanel()}
                </Panel>
            )
    }

    componentDidMount() {
        fetch('/privacy-policy')
            .then(response => response.text())
            .then(data => {
                this.setState({privacyPolicy: data})
            })
            .catch(error => {
                console.error('Error loading HTML snippet:', error)
            })
    }

}

export const PrivacyPolicy = compose(
    _PrivacyPolicy,
    connect(mapStateToProps)
)

PrivacyPolicy.propTypes = {}
