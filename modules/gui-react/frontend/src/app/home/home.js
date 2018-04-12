import PropTypes from 'prop-types'
import React from 'react'
import {connect} from 'store'
import Body from './body/body'
import Footer from './footer/footer'
import Map from './map/map'
import Menu, {isFloating} from './menu/menu'
import styles from './home.module.css'

const mapStateToProps = () => ({
    floatingMenu: isFloating(),
    floatingFooter: false
})

const Home = ({user, floatingMenu, floatingFooter}) => {
    return (
        <div className={[
            styles.container, 
            floatingMenu && styles.floatingMenu,
            floatingFooter && styles.floatingFooter
        ].join(' ')}>
            <Map className={styles.map}/>
            <Menu className={styles.menu}/>
            <Footer className={styles.footer} user={user}/>
            <Body className={styles.body}/>
        </div>
    )
}

Home.propTypes = {
    user: PropTypes.object.isRequired,
    floatingMenu: PropTypes.bool.isRequired,
    floatingFooter: PropTypes.bool.isRequired,
}

export default connect(mapStateToProps)(Home)
