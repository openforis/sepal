import PropTypes from 'prop-types'
import React from 'react'
import {connect} from 'store'
import Body from './body/body'
import Footer from './footer/footer'
import styles from './home.module.css'
import Map from './map/map'
import Menu, {isFloating} from './menu/menu'

const mapStateToProps = () => ({
    floatingMenu: isFloating()
})

const Home = ({user, floatingMenu}) => {
    return (
        <div className={styles.homeContainer}>
            <Map className={styles.map}/>
            <div className={[styles.home, floatingMenu && styles.floatingMenu].join(' ')}>
                <Menu className={styles.menu}/>
                <Footer className={styles.footer} user={user}/>
                <Body className={styles.body}/>
            </div>
        </div>
    )
}

Home.propTypes = {
    user: PropTypes.object.isRequired,
    floatingMenu: PropTypes.bool.isRequired
}

export default connect(mapStateToProps)(Home)
