import React from 'react'

export default class CreateRecipeRLCMS extends React.Component {
    render() {
        return (
            <div style={{'margin': '1rem 2rem', 'display': 'grid', 'grid-gap': '1rem'}}>
                <div>
                Monitoring land cover and land use change is important for land resource planning and for ecosystem services
                including biodiversity conservation and resilience to climate change. However, data updates are infrequent and
                classification systems do not always serve key user groups. At the regional level, the only maps currently
                available are those extracted from global land cover maps, which lack some of the typological resolution
                (i.e., there are two few land cover classes or the classes are not the most appropriate for the region)
                needed for many regional applications and decision-making contexts.
                </div>
                <div style={{'text-align': 'center'}}>
                THE REGIONAL LAND COVER MONITORING SYSTEM IS AN INITIATIVE OF
                </div>
                <div style={{'text-align': 'center'}}>
                    <img style={{'max-width': '80%', 'max-height': '8vh'}} alt='SERVIR logo'
                        src='http://servir-rlcms.appspot.com/static/img/servir-hires.png'/>
                </div>
                <div style={{'text-align': 'center'}}>
                a partnership between
                </div>
                <div style={{'text-align': 'center'}}>
                    <div>
                        <img style={{'max-width': '30%', 'max-height': '8vh'}} alt='USAID logo'
                            src='http://servir-rlcms.appspot.com/static/img/USAID_Logo_Color.png'/>
                        <img style={{'max-width': '30%', 'max-height': '8vh'}} alt='NASA logo'
                            src='http://servir-rlcms.appspot.com/static/img/NASA_Logo_Color.png'/>
                    </div>
                </div>
                <div style={{'text-align': 'right'}}>
                    <a href='http://servir-rlcms.appspot.com/' rel='noopener noreferrer' target='_blank'>http://servir-rlcms.appspot.com/</a>
                </div>
            </div>
        )
    }
}
