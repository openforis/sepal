/* eslint-disable */
const ee = require('#sepal/ee')

const pino26 = () =>
    image => image.addBandsReplace(process(image))

function process(image) {
    var BLU = image.select('blue').multiply(10000)
    var GREEN = image.select('green').multiply(10000)
    var RED = image.select('red').multiply(10000)
    var NIR = image.select('nir').multiply(10000)
    var NIRA = image.select('redEdge4').multiply(10000)
    var SWIR1 = image.select('swir1').multiply(10000)
    var SWIR2 = image.select('swir2').multiply(10000)

    var B1 = image.select('aerosol').multiply(10000)
    var B5 = image.select('redEdge1').multiply(10000)
    var B6 = image.select('redEdge2').multiply(10000)
    var B7 = image.select('redEdge3').multiply(10000)
    var B9 = image.select('waterVapor').multiply(10000)
    var B10 = image.select('cirrus').multiply(10000)
    var QA60 = image.select('qa')

    var QA60gt0 = QA60.gt(0)

    var max123457_TH = 2000
    var min1234_TH = 1500

    //var OUT=NIR.multiply(0)//.clip(image.Element.geometry().bounds());
    var OUT = NIR.multiply(0)
    //var OUT=ee.Image.constant(0).clip(image.geometry());

    var th_NDVI_MAX_WATER = 0.0
    var th_NDVI_SATURATION = 0.0037
    var th_NDVI_MIN_CLOUD_BARE = 0.35
    var th_NDVI_MIN_VEGE = 0.45

    var th_RANGELAND = 0.49
    var th_GRASS = 0.53
    var th_SHRUB = 0.63
    var th_TREES = 0.78

    var min123 = BLU.min(GREEN).min(RED)

    var min1234 = min123.min(NIR)
    var min12345 = min1234.min(SWIR1)
    var min123457 = min12345.min(SWIR2)

    //Map.addLayer(min123457,{},'min123457',true)

    var min234 = GREEN.min(RED).min(NIR)

    var max234 = GREEN.max(RED).max(NIR)
    var max1234 = max234.max(BLU)

    var max57 = SWIR1.max(SWIR2)
    //var max457=max57.max(NIR);  2020

    var max123457 = max1234.max(max57)

    var BLUgtGREEN = BLU.gt(GREEN)
    var BLUgteGREEN = BLU.gte(GREEN)
    var BLUlteNIR = BLU.lte(NIR)

    var GREENgtRED = GREEN.gt(RED)
    var GREENlteRED = GREEN.lte(RED.multiply(1.1))
    var GREENgteRED = GREEN.gte(RED)
    var REDlteNIR = RED.lte(NIRA)

    var REDsubtractGREEN = (RED.subtract(GREEN)).abs()
    var REDsubtractBLU = (RED.subtract(BLU)).abs()
    var BLUsubtractNIR = BLU.subtract(NIR)

    var BLUgtGREENgtRED = BLUgtGREEN.and(GREENgtRED)

    var growing13 = (BLU.lte(GREEN)).and(GREENlteRED)
    var growing24 = GREENlteRED.and(REDlteNIR)
    var growing14 = (BLU.lte(GREEN)).and(GREENlteRED).and(REDlteNIR)
    var growing15 = growing14.and(NIR.lte(SWIR1))

    var decreasing123 = BLUgtGREEN.and(GREENgteRED)
    var decreasing234 = (GREENgteRED).and(RED.gte(NIR))
    var decreasing2345 = decreasing234.and(NIR.gte(SWIR2)) // DS

    var decreasing3457 = RED.gt(NIR).and(NIR.gt(SWIR1)).and(SWIR1.gte(SWIR2)) // DS

    var SATURATION = (max234.subtract(min234)).divide(max234)

    // var WETNESS= (BLU.multiply(0.15092*10000)).add(GREEN.multiply(0.19733*10000)).add(RED.multiply(0.32794*10000)).add(NIR.multiply(0.34068*10000)).subtract(SWIR1.multiply(0.711211*10000)).subtract(SWIR2.multiply(0.457212*10000))
    //var WETNESS= ((BLU.multiply(0.15092)).add(GREEN.multiply(0.19733)).add(RED.multiply(0.32794)).add(NIR.multiply(0.34068)).subtract(SWIR1.multiply(0.711211)).subtract(SWIR2.multiply(0.457212))).divide(10000)
    var NDVI = (NIR.subtract(RED)).divide(NIR.add(RED))
    var NDWI = (GREEN.subtract(SWIR1)).divide(GREEN.add(SWIR1))
    var WATERSHAPE = ((BLU.subtract(GREEN)).gt(-2000)).and(decreasing2345) //add other cond
    var OTHERWATERSHAPE = decreasing123.and(NIR.gte(RED)).and(SWIR1.lt(NIR)).and(SWIR2.lte(SWIR1)).and(NIR.lt((RED).multiply(1.3)).and(NIR.lt(1200)).and(SWIR1.lt(RED)).and(NIR.lte(GREEN)).and(NIR.gt(390))) //add other cond  07/10 (add replaced with and  :) and(NIR.lte(GREEN))

    // SNOWSHAPE = null;
    //decreasing2345=0
    // main groups based on ndvi
    var ndvi_1 = NDVI.lte(th_NDVI_MAX_WATER)
    var ndvi_2 = NDVI.lt(th_NDVI_MIN_VEGE).and(ndvi_1.eq(0))
    var ndvi_3 = NDVI.gte(th_NDVI_MIN_VEGE)

    // Map.addLayer(NDVI,{},'NDVI',0);
    // Map.addLayer(NDWI,{},'NDWI',0);

    var EsaMask = (QA60.eq(2048)).and(BLU.gt(1300)).and(B10.gt(150))
    // B9 400 lowered in Feb 2020 core clouds missing
    var cloudMask = (B1.gt(2000).and(B9.gt(400)))
        .or(B1.gt(2200).and(B9.gt(340)))
        .or(B1.gt(2200).and(B9.gt(280)).and(BLU.gt(2000)))
        .or(B1.gt(3000))
    //.or(EsaMask)

    var SNOWSHAPE = ((min1234.gt(3000)).and(NDWI.gt(0.65))).and(WATERSHAPE.eq(0)).and(QA60.eq(0))

    // -------------------------------------------------------------------------------------------------------------
    //                 -----------------------    SNOW    -----------------------
    //--------------------------------------------------------------------------------------------------------------
    OUT = OUT.where(SNOWSHAPE, 100)
    SNOWSHAPE = null

    // -------------------------------------------------------------------------------------------------------------
    //                 -----------------------    LAVA    -----------------------
    //--------------------------------------------------------------------------------------------------------------
    OUT = OUT.where((NDVI.lt(0.3)).and(max1234.lt(5000)).and(SWIR1.gt(10000)), 110) //

    //-------------------------------------------------------------------------------------------------------------
    //----------------------  SECTION 0 : BASIC CLOUD MASK --------------------------------------------------------
    //-------------------------------------------------------------------------------------------------------------
    //OUT = OUT.where(cloudMask.and(SOILandMORE.not()),98);
    //OUT = OUT.where(cloudMask.and(SOILandMORE).and(NDVI.gt(0.05)),98);

    OUT = OUT.where((OUT.eq(0)).and(QA60.eq(2048).and(B1.gt(4000))), 1) // add ESA to cover holes
    OUT = OUT.where((OUT.eq(0)).and(QA60.eq(1024).and(B1.gt(2400))), 1) // add ESA to cover holes

    // missing core clouds on soil
    OUT = OUT.where((OUT.eq(0)).and(min1234.gt(2700)).and(B1.gt(2700)).and(B9.gt(300)), 1) //  over water
    OUT = OUT.where((OUT.eq(0)).and(min1234.gt(2200)).and(B1.gt(2200)).and(B9.gt(500)), 1) //

    OUT = OUT.where(cloudMask.and(NDVI.gt(0.12)), 2) // cirrus clous over forest
    cloudMask = null

    OUT = OUT.where(OUT.eq(0).and(B1.gt(1850)).and(NDVI.gt(0.26)).and(RED.gt(1000)), 2) // cirrus clous over forest

    OUT = OUT.where(OUT.eq(0).and(QA60gt0).and(NIRA.gt(3000)).and(B1.gt(2500)), 2) // Dec 2019 EX 6

    OUT = OUT.where(OUT.eq(0).and(EsaMask.or(B10.gt(180))).and(B1.gt(1400)), 2) //.and(SOILandMORE.not())

    OUT = OUT.where(OUT.eq(0).and(QA60gt0).and(B1.gt(1500)).and(NIRA.gt(3500)).and(RED.gt(1000)), 8) // Dec 2019

    OUT = OUT.where(OUT.eq(0).and(B1.gt(2000)).and(NDVI.gt(0.2)).and(BLU.gt(2000)).and(B9.gt(350)), 2) // some noise IN

    OUT = OUT.where(OUT.eq(1).and(QA60.eq(0)).and(B10.lt(50)).and(B9.lt(800)).and(NDVI.gt(-0.008)).and(growing15).and(SWIR1.gt(NIRA)).and(
        (SWIR1.gt(4500)).and(B1.lt(2500))
            .or(SWIR1.gt(6000).and(B1.gt(4000)))

    ), 50) // bright soil  in Est Afr

    // -------------------------------------------------------------------------------------------------------------
    // ----------------------------------   CLOUDS over WATER ------------------------------------------------------
    // ------------------------------ - + fuzzy bluesh edges on soil   ---------------------------------------------
    // -------------------------------------------------------------------------------------------------------------

    var CLOUDS_ON_WATER = OUT.eq(0).and(ndvi_1).and(decreasing2345).and(B1.gt(1800)).and(SWIR1.gt(700))
    OUT = OUT.where(CLOUDS_ON_WATER.and(B9.gt(350)).and(B10.gt(15)), 3) // sunglints
    OUT = OUT.where(CLOUDS_ON_WATER.and(SWIR1.gt(NIR)).and(B9.gt(150)), 3) // small clouds

    OUT = OUT.where(OUT.eq(0).and(ndvi_1).and(decreasing2345).and(BLU.gt(1100)).and(
        ((BLU.gt(1350)).and(B9.gt(350)).and(B10.gt(50)))
            .or((B1.gt(1550)).and(B9.gt(150)).and(SWIR1.gt(500)))

    ), 3)

    OUT = OUT.where(OUT.eq(0).and(ndvi_1).and(B1.gt(2000)).and(SWIR1.gt(2000)), 3)
    OUT = OUT.where(OUT.eq(3).and(B10.lt(15)), 50) // soil or roofs

    // -------------------------------------------------------------------------------------------------------------
    //                 -----------------------  WATER and SHADOWS                  -----------------------
    //--------------------------------------------------------------------------------------------------------------

    // -------------------------------------------------------------------------------------------------------------
    //                 -----------------------    SHADOWS on SOIL    -----------------------
    //--------------------------------------------------------------------------------------------------------------
    OUT = OUT.where(OUT.eq(0).and(ndvi_1).and(decreasing234).and(SWIR1.gt(400)), 43) // shadows with negative NDVI

    OUT = OUT.where((OUT.eq(0).and(ndvi_2).and(BLU.lt(1300)).and(BLUgtGREENgtRED).and(RED.lt(500)).and(BLUsubtractNIR.lt(1000))), 41) //similar 2 cl 42 simplify

    //REM
    //OUT=OUT.where(( OUT.eq(0).and(ndvi_2).and(B9.lt(150))),111   ); //WATER only at this point to avoid confusion with shadows

    // Feb 2020 test on missing water on small rivers central AFR

    // Feb 2020 OK
    OUT = OUT.where((OUT.eq(0).and(NDVI.lt(0.2).and(BLUgtGREENgtRED).and(RED.lt(800)).and(NIR.lt(900)).and(SWIR2.lt(200)))), 37) //
    // 2020 test to convert water to shadow // Gabon
    OUT = OUT.where(OUT.eq(37).and(NIRA.subtract(RED).gt(500)), 40)

    // WETNESS = null;

    OUT = OUT.where(OUT.eq(0).and(ndvi_2).and(BLUgtGREENgtRED).and(

        ((BLU.lt(1300)).and(RED.lt(600)).and(BLUsubtractNIR.lt(300)))
            .or((BLU.lt(1000)).and(RED.lt(500)).and(BLUsubtractNIR.lt(380)).and(B9.lt(100)))
            .or((NIR.subtract(GREEN).abs().lte(100)).add(BLUsubtractNIR.gte(100)).and(NIR.gte(600)).and(SWIR1.lt(500)))

    ), 41)

    //                 -----------------------    SHADOWS on SOIL with NEG NDVI   -----------------------

    OUT = OUT.where(OUT.eq(0).and(NDVI.gt(-0.08)).and(WATERSHAPE).and(NIRA.gt(NIR)), 41)
    WATERSHAPE = null

    // -------------------------------------------------------------------------------------------------------------
    //                 -----------------------    SHADOWS on VEGETATION    -----------------------
    //--------------------------------------------------------------------------------------------------------------

    OUT = OUT.where(NDVI.gt(0.4).and(RED.lt(350)).and(NIR.lt(2000)).and(SWIR2.lt(300)), 40) // no eq(0)  // to be tested
    // change class 41 shadow on soil to shadow on veg if NDVI is > 0.4
    OUT = OUT.where(OUT.eq(41).and(NDVI.gt(0.4)), 40)

    var MyCOND = OUT.eq(0).and(ndvi_3).and(NDVI.lt(th_RANGELAND))
    OUT = OUT.where(MyCOND.and(NIR.lt(1500)), 40)
    MyCOND = (ndvi_3).and(OUT.eq(0)).and(NDVI.lt(th_GRASS))
    OUT = OUT.where(MyCOND.and(BLUlteNIR).and(NIR.lt(1400)), 40)
    OUT = OUT.where(MyCOND.and(BLU.gt(NIR)), 40)

    // remove very dark forest in shadows (some EVG forest is masked but only in some dates)
    OUT = OUT.where(OUT.eq(0).and(B1.lt(1200)).and(NDVI.gt(0.6)).and(NDWI.gt(-0.3)).and(RED.lt(400)).and(B9.lt(300)).and(NIRA.lt(2500)).and(SWIR1.lt(850)), 40) // shadows on dense veg

    // Jan 2020 with NDSI
    // add shadow from old PINO
    OUT = OUT.where(((OUT.eq(0)).and(ndvi_1.not()).and(NDWI.lt(0.25)).and(
        ((BLU.lt(1400)).and(BLU.gt(800)).and(BLUgtGREENgtRED).and(RED.lt(700)).and(NIR.lt(1450)).and(((NIR).subtract(BLU)).lt(300)))
    )), 41)

    // feb 2020
    OUT = OUT.where((OUT.eq(41)).and(ndvi_1.not()).and(SWIR2.gt(RED)).and(SWIR2.gt(600)), 51) // BURNT or soil

    // Feb 2020
    MyCOND = OUT.eq(0).and(B1.gt(1200)).and(B9.gt(600)).and(RED.lt(1000))
    OUT = OUT.where(MyCOND.and(B10.gt(100)).and(BLU.gt(1000)).and(
        ((NIRA.gt(2000)).and(QA60gt0))
            .or((NIRA.gt(2300)).and(B9.gt(800)))
            .or((NIRA.gt(1800)).and(B9.gt(650)))

    ), 6)

    OUT = OUT.where(MyCOND.and(BLU.gt(2000)).and(NIRA.gt(3500)).and(B10.gt(80)), 6)
    MyCOND = null
    // ----------------------------  extra clouds 2020 ----------------------------
    // convert soil to clouds
    // cloud holes/edges supported by QA60 can be moved up  // OK tested
    OUT = OUT.where(OUT.eq(0).and(QA60gt0).and(B1.gt(1500)).and(RED.lt(1000)), 6) //?
    OUT = OUT.where(OUT.eq(55).and(QA60gt0).and(B1.gt(2000)), 6)

    // Feb 2020
    OUT = OUT.where(OUT.eq(6).and(NDVI.gt(0.45)).and(RED.lt(900)).and(SWIR2.lt(1100)), 60) // veget

    ////////////////////////////////////////////////////////////////////
    // Jan 2020 ,missing shadows on Veg

    OUT = OUT.where(OUT.eq(0).and(BLUgtGREENgtRED).and(NDVI.gt(0.3)).and(NDWI.gt(0)).and(B10.gt(45)), 40)
    OUT = OUT.where(OUT.eq(0).and(NDVI.gt(0.2)).and(NDWI.gt(0.1)).and(RED.lt(1000)), 40)
    OUT = OUT.where(OUT.eq(0).and(BLUgtGREENgtRED).and(NDVI.gt(0.2)).and(NDWI.gt(0)).and(B1.gt(1300)).and(RED.gt(800)).and(B9.gt(350)).and(B10.gt(45)).and(NIRA.gt(2000)).and(SWIR1.gt(1100)).and(SWIR2.gt(500)), 40)

    //Jan 2020
    // thin/opaque clouds edge on forest but also shadow on soil OK
    OUT = OUT.where(OUT.eq(0).and(B1.gt(1800)).and(BLUgtGREENgtRED).and(RED.gt(1000)).and(NIRA.gt(RED)).and(SWIR2.lt(RED)), 6)
    OUT = OUT.where(OUT.eq(0).and(QA60gt0).and(B1.gt(1400)).and(NDVI.gt(0.5)).and(B9.gt(500)).and(B10.gt(100)).and(NIRA.gt(2500)).and(SWIR1.gt(1500)), 6)
    OUT = OUT.where(OUT.eq(0).and(BLUgtGREENgtRED).and(QA60gt0).and(B10.gt(150)), 6)

    OUT = OUT.where(OUT.eq(41).and(NIR.gt(1200)).and(SWIR2.gt(350)), 0) // swamp or water edge

    OUT = OUT.where(OUT.eq(6).and(SWIR2.lt(600)).and(QA60gt0.not()), 41) // shadow

    // Feb 2020 missing shadow
    OUT = OUT.where(OUT.eq(0).and(ndvi_2).and(decreasing123).and(SWIR2.lt(300)).and(RED.lt(1000)), 40)

    OUT = OUT.where(OUT.eq(0).and(NDVI.gt(0.40)).and(NDVI.lt(0.55)).and(decreasing123).and(SWIR2.lt(600)).and(RED.lt(600)).and(NIR.lt(2000)).and(SWIR1.lt(850)), 40)

    // cleaning
    OUT = OUT.where((OUT.eq(40)).and(SWIR1.gt(1000)), 0)
    //OUT=OUT.where((OUT.eq(37)).or(OUT.eq(38)),0)
    OUT = OUT.where(OUT.eq(37), 0)
    OUT = OUT.where(OUT.gte(50), 0)

    return image.select('cloud').or(OUT.neq(0).rename('cloud'))
}

module.exports = pino26
