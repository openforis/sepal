import React from 'react'

export default class CreateRecipeRLCMS extends React.Component {
    render() {
        return (
            <div style={{margin: '1rem 2rem', display: 'grid', gridGap: '1rem', color: '#ccc'}}>
                <div>
                    Monitoring land cover and land use change is important for land resource planning and for ecosystem services
                    including biodiversity conservation and resilience to climate change. However, data updates are infrequent and
                    classification systems do not always serve key user groups. At the regional level, the only maps currently
                    available are those extracted from global land cover maps, which lack some of the typological resolution
                    (i.e., there are two few land cover classes or the classes are not the most appropriate for the region)
                    needed for many regional applications and decision-making contexts.
                </div>
                <div style={{textAlign: 'center'}}>
                    THE REGIONAL LAND COVER MONITORING SYSTEM IS AN INITIATIVE OF
                </div>
                <div style={{textAlign: 'center'}}>
                    <img style={{maxWidth: '80%', maxHeight: '8vh'}} alt='SERVIR logo'
                        src='http://servir-rlcms.appspot.com/static/img/servir-hires.png'/>
                </div>
                <div style={{textAlign: 'center'}}>
                    a partnership between
                </div>
                <div style={{textAlign: 'center'}}>
                    <div>
                        <img style={{maxWidth: '30%', maxHeight: '8vh'}} alt='USAID logo'
                            src='http://servir-rlcms.appspot.com/static/img/USAID_Logo_Color.png'/>
                        <img style={{maxWidth: '30%', maxHeight: '8vh'}} alt='NASA logo'
                            src='http://servir-rlcms.appspot.com/static/img/NASA_Logo_Color.png'/>
                    </div>
                </div>
                <div style={{textAlign: 'right'}}>
                    <a href='http://servir-rlcms.appspot.com/' rel='noopener noreferrer' target='_blank'>http://servir-rlcms.appspot.com/</a>
                </div>
            </div>
        )
    }
}
