import PropTypes from 'prop-types'
import React from 'react'

import {Assets} from '~/app/home/body/browse/assets/assets'
import {BudgetMonitor} from '~/app/home/monitoring/budgetMonitor'
import {GoogleAccountConnection} from '~/app/home/monitoring/googleAccountConnection'
import {LoginSessionMonitor} from '~/app/home/monitoring/loginSessionMonitor'
import {MessagesMonitor} from '~/app/home/monitoring/messagesMonitor'
import {SessionExpiryMonitor} from '~/app/home/monitoring/sessionExpiryMonitor'
import {SessionMonitor} from '~/app/home/monitoring/sessionMonitor'
import {TaskMonitor} from '~/app/home/monitoring/taskMonitor'
import {User} from '~/app/home/monitoring/user'
import {VersionCheck} from '~/app/home/monitoring/versionCheck'
import {WebSocketConnection} from '~/app/home/monitoring/webSocketConnection'
import {compose} from '~/compose'
import {connect} from '~/connect'
import {ActivationContext} from '~/widget/activation/activationContext'
import {PortalContainer} from '~/widget/portal'
import {PrivacyPolicy} from '~/widget/privacyPolicy'

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
                    <LoginSessionMonitor/>
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
