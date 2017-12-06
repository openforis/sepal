/**
 * @author Mino Togna
 */

var Sensors = {
    
    'LANDSAT': {
        'LANDSAT_8': {
            id       : 'LANDSAT_8',
            name     : 'Landsat 8',
            shortName: 'L8',
            selected : true
        },
        
        'LANDSAT_7': {
            id       : 'LANDSAT_7',
            name     : 'Landsat 7',
            shortName: 'L7',
            selected : true
        },
        
        'LANDSAT_TM': {
            id       : 'LANDSAT_TM',
            name     : 'Landsat 4-5',
            shortName: 'L4-5',
            selected : true
        },
      
        'LANDSAT_8_T2': {
            id       : 'LANDSAT_8_T2',
            name     : 'Landsat 8 Tier 2',
            shortName: 'L8 T2',
            selected : false
        },
        
        'LANDSAT_7_T2': {
            id       : 'LANDSAT_7_T2',
            name     : 'Landsat 7 Tier 2',
            shortName: 'L7 T2',
            selected : false
        },
        
        'LANDSAT_TM_T2': {
            id       : 'LANDSAT_TM_T2',
            name     : 'Landsat 4-5 Tier 2',
            shortName: 'L5 T2',
            selected : false
        }
    }
    
    , 'SENTINEL2': {
        'SENTINEL2A': {
            id       : 'SENTINEL2A',
            name     : 'SENTINEL-2A',
            shortName: 'S-2A',
            selected : true
        }
    }
    
}

module.exports = Sensors