/**
 * @require d3 3.0
 * @require queue 1.0
 * @require solarnetwork-d3 0.0.3
 * @require solarnetwork-d3-chart-energy-io 1.0.0
 * @require solarnetwork-d3-chart-pie-io 1.0.0
 */

sn.config.debug = true;
//sn.config.host = 'localhost:8680';

(function(window) {
'use strict';

var app;

/**
 * Schoolgen school app. Displays a set of charts and data related to a single school.
 * 
 * @param {object} nodeUrlHelper - A {@link sn.datum.nodeUrlHelper} configured with the school's SolarNetwork node ID.
 * @param {string} barEnergyChartSelector - A CSS selector to display the energy bar chart within.
 * @param {string} pieEnergyChartSelector - A CSS selector to display the energy pie chart within.
 * @class
 */
var sgSchoolApp = function(nodeUrlHelper, barEnergyChartSelector, pieEnergyChartSelector) {
	var self = { version : '1.0.0' };
	var urlHelper = nodeUrlHelper;

	// auto-refresh settings
	var refreshMs = 60000,
		refreshTimer;
	
	// configuration
	var consumptionSources = [],
		generationSources = [],
		forcedDisplayFactor = 1000,
		hours = 24,
		days = 7,
		months = 4,
		yearMonths = 24,
		dataScaleFactors = { 'Consumption' : 1, 'Generation' : 1};
	
	// charts
	var globalChartParams,
		sourceColorMap,
		barEnergyChartContainer,
		barEnergyChart,
		pieEnergyChartContainer,
		pieEnergyChart;
	
	/**
	 * Get or set the consumption source IDs.
	 * 
	 * @param {array|string} [value] the array of source ID values, or if a string a comma-delimited list of source ID values
	 * @return when used as a getter, the current source IDs, otherwise this object
	 * @memberOf sgSchoolApp
	 */
	function consumptionSourceIds(value) {
		if ( !arguments.length ) return consumptionSources;
		if ( Array.isArray(value) ) {
			consumptionSources = value;
		} else if ( typeof value === 'string' ) {
			consumptionSources = value.split(/\s*,\s*/);
		}
		return self;
	}
	
	/**
	 * Get or set the generation source IDs.
	 * 
	 * @param {array|string} [value] the array of source ID values, or if a string a comma-delimited list of source ID values
	 * @return when used as a getter, the current source IDs, otherwise this object
	 * @memberOf sgSchoolApp
	 */
	function generationSourceIds(value) {
		if ( !arguments.length ) return generationSources;
		if ( Array.isArray(value) ) {
			generationSources = value;
		} else if ( typeof value === 'string' ) {
			generationSources = value.split(/\s*,\s*/);
		}
		return self;
	}
	
	/**
	 * Get or set the number of hours to display for the TenMinute aggregate level.
	 * 
	 * @param {number} [value] the number of hours to display
	 * @return when used as a getter, the number of hours, otherwise this object
	 * @memberOf sgSchoolApp
	 */
	function numHours(value) {
		if ( !arguments.length ) return numHours;
		var n = Number(value);
		if ( !isNaN(n) && isFinite(n) ) {
			numHours = n;
		}
		return self;
	}
	
	/**
	 * Get or set the number of days to display for the Hour aggregate level.
	 * 
	 * @param {number} [value] the number of days to display
	 * @return when used as a getter, the number of days, otherwise this object
	 * @memberOf sgSchoolApp
	 */
	function numDays(value) {
		if ( !arguments.length ) return numDays;
		var n = Number(value);
		if ( !isNaN(n) && isFinite(n) ) {
			numDays = n;
		}
		return self;
	}
	
	/**
	 * Get or set the number of months to display for the Day aggregate level.
	 * 
	 * @param {number} [value] the number of months to display
	 * @return when used as a getter, the number of months, otherwise this object
	 * @memberOf sgSchoolApp
	 */
	function numMonths(value) {
		if ( !arguments.length ) return numMonths;
		var n = Number(value);
		if ( !isNaN(n) && isFinite(n) ) {
			numMonths = n;
		}
		return self;
	}
	
	/**
	 * Get or set the number of months to display for the Month aggregate level.
	 * 
	 * @param {number} [value] the number of months to display
	 * @return when used as a getter, the number of years, otherwise this object
	 * @memberOf sgSchoolApp
	 */
	function numYearMonths(value) {
		if ( !arguments.length ) return numYearMonths;
		var n = Number(value);
		if ( !isNaN(n) && isFinite(n) ) {
			numYearMonths = n;
		}
		return self;
	}
	
	/**
	 * Get or set the a fixed display factor to use in charts, e.g. <code>1000</code> to use
	 * <b>kWh</b> for energy values. Pass <code>null</code> to clear the setting and allow
	 * the charts to adjust the display factor dynamically, based on the data.
	 * 
	 * @param {number} [value] the number of months to display
	 * @return when used as a getter, the fixed display factor (<code>undefined</code> when not set), otherwise this object
	 * @memberOf sgSchoolApp
	 */
	function fixedDisplayFactor(value) {
		if ( !arguments.length ) return forcedDisplayFactor;
		var n = undefined;
		if ( value !== null ) {
			n = Number(value);
			if ( !isNaN(n) && isFinite(n) ) {
				n = undefined;
			}
		}
		forcedDisplayFactor = n;
		return self;
	}
	
	function dataScaleFactorValue(dataType, value) {
		var n;
		if ( value === undefined ) {
			return dataScaleFactors[dataType];
		}
		n = Number(value);
		if ( isNaN(n) || !isFinite(n) ) {
			n = 1;
		}
		dataScaleFactors[dataType] = value;
		return self;
	}
	
	/**
	 * Get or set the generation data scale factor, to multiply all generation data values by.
	 * 
	 * @param {number} [value] the generation scale factor to use
	 * @return when used as a getter, the generation data scale factor, otherwise this object
	 * @memberOf sgSchoolApp
	 */
	function generationDataScaleFactor(value) {
		return dataScaleFactorValue('Generation', value);
	}
	
	/**
	 * Get or set the consumption data scale factor, to multiply all consumption data values by.
	 * 
	 * @param {number} [value] the consumption scale factor to use
	 * @return when used as a getter, the consumption data scale factor, otherwise this object
	 * @memberOf sgSchoolApp
	 */
	function consumptionDataScaleFactor(value) {
		return dataScaleFactorValue('Consumption', value);
	}
	
	/**
	 * Start the application, after configured.
	 * 
	 * @return this object
	 * @memberOf sgSchoolApp
	 */
	function start() {
		refresh();
		if ( refreshTimer === undefined ) {
			refreshTimer = setInterval(refresh, refreshMs);
		}
		return self;
	}
	
	/* === Global Chart Support === */
	
	function chartColorForDataTypeSource(dataType, sourceId, sourceIndex) {
		if ( !sourceColorMap ) {
			return (dataType === 'Consumption' ? '#00c' : '#0c0');
		}
		var mappedSourceId = sourceColorMap.displaySourceMap[dataType][sourceId];
		return sourceColorMap.colorMap[mappedSourceId];
	}
	
	/* === Bar Energy Chart Support === */
	
	function barEnergyChartCreate() {
		var chart = sn.chart.energyIOBarChart(barEnergyChartSelector, globalChartParams)
			.dataCallback(barEnergyDataCallback)
			.colorCallback(chartColorForDataTypeSource)
			.scaleFactor(dataScaleFactors)
			.hoverEnterCallback(barEnergyHoverEnter)
			.hoverMoveCallback(barEnergyHoverMove)
			.hoverLeaveCallback(barEnergyHoverLeave)
			.doubleClickCallback(barEnergyDoubleClick);
		return chart;
	}
	
	function barEnergyDataCallback() {
	
	}
	
	function barEnergyHoverEnter() {
	
	}
	
	function barEnergyHoverMove() {
	
	}
	
	function barEnergyHoverLeave() {
	
	}
	
	function barEnergyDoubleClick() {
	
	}
	
	/* === Pie Energy Chart Support === */
	
	function pieEnergyDataCallback() {
	
	}
	
	function pieEnergyHoverEnter() {
	
	}
	
	function pieEnergyHoverMove() {
	
	}
	
	function pieEnergyHoverLeave() {
	
	}
	
	function pieEnergyDoubleClick() {
	
	}
	
	function pieEnergyChartCreate() {
		var chart = sn.chart.energyIOPieChart(pieEnergyChartSelector, globalChartParams)
			.colorCallback(chartColorForDataTypeSource)
			.scaleFactor(dataScaleFactors)
			.hoverEnterCallback(pieEnergyHoverEnter)
			.hoverMoveCallback(pieEnergyHoverMove)
			.hoverLeaveCallback(pieEnergyHoverLeave);			
		return chart;
	}
	
	/** === Initialization === */
	
	function refresh() {
		if ( !barEnergyChart ) {
			barEnergyChart = barEnergyChartCreate();
			barEnergyChartContainer = d3.select(d3.select(barEnergyChartSelector).node().parentNode);
		}
		if ( !pieEnergyChart ) {
			pieEnergyChart = pieEnergyChartCreate();
			pieEnergyChartContainer = d3.select(d3.select(pieEnergyChartSelector).node().parentNode);
		}
		// TODO
	}
	
	function init() {
		globalChartParams = new sn.Configuration({
			aggregate : 'Hour',
			northernHemisphere : false,
			plotProperties : {TenMinute : 'wattHours', Hour : 'wattHours', Day : 'wattHours', Month : 'wattHours'}
		});
		Object.defineProperties(self, {
			consumptionSourceIds 		: { value : consumptionSourceIds },
			generationSourceIds 		: { value : generationSourceIds },
			consumptionDataScaleFactor 	: { value : consumptionDataScaleFactor },
			generationDataScaleFactor 	: { value : generationDataScaleFactor },
			numHours					: { value : numHours },
			numDays						: { value : numDays },
			numMonths					: { value : numMonths },
			numYearMonths				: { value : numYearMonths },
			fixedDisplayFactor			: { value : fixedDisplayFactor },
			start 						: { value : start }
		});
		return self;
	}
	
	return init();
};

function startApp(env) {
	var urlHelper;
	
	if ( !env ) {
		env = sn.util.copy(sn.env, {
			nodeId : 175,
			numHours : 24,
			numDays : 7,
			numMonths : 12,
			numYearMonths : 24,
			fixedDisplayFactor : 1000,
			sourceIds : 'Solar',
			consumptionSourceIds : 'Ph1,Ph2,Ph3',
			barEnergySelector : '#energy-bar-chart',
			pieEnergySelector : '#energy-pie-chart'
		});
	}
	
	urlHelper = sn.datum.nodeUrlHelper(env.nodeId, { tls : sn.config.tls, host : sn.config.host });

	app = sgSchoolApp(urlHelper, env.barEnergySelector, env.pieEnergySelector)
		.generationSourceIds(env.sourceIds)
		.consumptionSourceIds(env.consumptionSourceIds)
		.numHours(env.numHours)
		.numDays(env.numDays)
		.numMonths(env.numMonths)
		.numYearMonths(env.numYearMonths)
		.fixedDisplayFactor(env.fixedDisplayFactor)
		.start();
	
	return app;
}

sn.runtime.sgSchoolApp = startApp;

}(window));
