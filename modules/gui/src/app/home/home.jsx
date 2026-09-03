import PropTypes from 'prop-types'
import React from 'react'

import {compose} from '~/compose'
import {connect} from '~/connect'
import {ActivationContext} from '~/widget/activation/activationContext'
import {Assets} from '~/widget/assets'
import {BudgetMonitor} from '~/widget/budgetMonitor'
import {GoogleAccountConnection} from '~/widget/googleAccountConnection'
import {MessagesMonitor} from '~/widget/messagesMonitor'
import {PortalContainer} from '~/widget/portal'
import {PrivacyPolicy} from '~/widget/privacyPolicy'
import {SessionExpiryMonitor} from '~/widget/sessionExpiryMonitor'
import {SessionMonitor} from '~/widget/sessionMonitor'
import {TaskMonitor} from '~/widget/taskMonitor'
import {User} from '~/widget/user'
import {VersionCheck} from '~/widget/versionCheck'
import {WebSocketConnection} from '~/widget/webSocketConnection'

import {AppSessionMonitor} from './body/apps/appSessionMonitor'
import {Body} from './body/body'
import {Footer} from './footer/footer'
import styles from './home.module.css'
import {Menu} from './menu/menu'
import {isFloating} from './menu/menuMode'

const mapStateToProps = () => ({
    floatingMenu: isFloating(),
    floatingFooter: false
})

class _Home extends React.Component {
    render() {
        const {floatingMenu, floatingFooter} = this.props
        return (
            <ActivationContext id='root'>
                <div className={[
                    styles.container,
                    floatingMenu && styles.floatingMenu,
                    floatingFooter && styles.floatingFooter
                ].join(' ')}>
                    <Menu className={styles.menu}/>
                    <div className={styles.main}>
                        <Body className={styles.body}/>
                        <Footer className={styles.footer}/>
                    </div>
                    <PortalContainer/>
                    <WebSocketConnection/>
                    <TaskMonitor/>
                    <BudgetMonitor/>
                    <SessionMonitor/>
                    <MessagesMonitor/>
                    <User/>
                    <AppSessionMonitor/>
                    <SessionExpiryMonitor/>
                    <Assets/>
                    <GoogleAccountConnection/>
                    <VersionCheck/>
                    <PrivacyPolicy/>
                </div>
            </ActivationContext>
        )
    }
}

export const Home = compose(
    _Home,
    connect(mapStateToProps)
)

Home.propTypes = {
    floatingFooter: PropTypes.bool,
    floatingMenu: PropTypes.bool
}
