/**
 * @author Mino Togna
 */

var Sensors = {
    
    'LANDSAT': {
        'LANDSAT_8': {
            id       : 'LANDSAT_8',
            name     : 'Landsat 8 OLI/TIRS',
            shortName: 'L8'
        },
        
        'LANDSAT_ETM_SLC_OFF': {
            id       : 'LANDSAT_ETM_SLC_OFF',
            name     : 'Landsat 7 ETM+ (SLC-off)',
            shortName: 'L7 SLC-off'
        },
        
        'LANDSAT_ETM': {
            id       : 'LANDSAT_ETM',
            name     : 'Landsat 7 ETM+ (SLC-on)',
            shortName: 'L7 SLC-on'
        },
        
        'LANDSAT_TM': {
            id       : 'LANDSAT_TM',
            name     : 'Landsat 4-5 TM',
            shortName: 'L4-5 TM'
        },
        
        'LANDSAT_MSS': {
            id       : 'LANDSAT_MSS',
            name     : 'Landsat 1-5 MSS',
            shortName: 'L1-5 MSS'
        }
    }
    
    , 'SENTINEL2': {
        'SENTINEL2A': {
            id       : 'SENTINEL2A',
            name     : 'SENTINEL-2A',
            shortName: 'S-2A'
        }
    }
    
}

module.exports = Sensors