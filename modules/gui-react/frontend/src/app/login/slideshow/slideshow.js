import React from 'react'
import background1 from './background1.jpg'
import background2 from './background2.jpg'
import styles from './slideshow.module.css'

export default class Slideshow extends React.Component {
  render() {
    return (
      <div className={styles.slideshow}>
        <img src={background1} className={styles.image1}/>
        <img src={background2} className={styles.image2}/>
        <div className={styles.overlay}/>
      </div>
    )
  }
}
