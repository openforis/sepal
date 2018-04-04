import React from 'react'
// import styles from './process.module.css'
import LandCover from 'landCover/landCover'

export default class Process extends React.Component {
    render() {
        return <LandCover/>
        // return (
        //     <div>
        //         <div className={styles.tabBar}>
        //             <Tab title="Foo"/>
        //             <Tab title="Bar"/>
        //             <Tab title="Baz"/>
        //             <NewTab/>
        //         </div>
        //
        //         <div className={styles.content}>
        //             Contents
        //         </div>
        //     </div>
        //     )
    }
}

// const Tab = ({title}) =>
//     <div className={styles.tab}>
//         {title}
//     </div>
//
// const NewTab = () =>
//     <div className={styles.newTab}>
//         +
//     </div>