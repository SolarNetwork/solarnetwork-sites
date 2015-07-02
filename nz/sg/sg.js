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
 * @param {string} outdatedSelector - A CSS selector to display the stale data warning message within.
 * @class
 */
var sgSchoolApp = function(nodeUrlHelper, barEnergyChartSelector, pieEnergyChartSelector, outdatedSelector) {
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
		years = 24,
		dataScaleFactors = { 'Consumption' : 1, 'Generation' : 1},
		endDate, // set to most recently available data date
		displayRange; // { start : Date, end : Date }
	
	// charts
	var chartParams,
		chartSourceGroupMap = { 'Consumption' : consumptionSources, 'Generation' : generationSources },
		chartSourceSets,
		chartSourceColorMap,
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
		var array;
		if ( Array.isArray(value) ) {
			array = value;
		} else if ( typeof value === 'string' ) {
			array = value.split(/\s*,\s*/);
		}
		// we want to maintain our original array instance, so just repopulate with new values
		consumptionSources.length = 0;
		Array.prototype.push.apply(consumptionSources, array);
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
		var array;
		if ( Array.isArray(value) ) {
			array = value;
		} else if ( typeof value === 'string' ) {
			array = value.split(/\s*,\s*/);
		}
		// we want to maintain our original array instance, so just repopulate with new values
		generationSources.length = 0;
		Array.prototype.push.apply(generationSources, array);
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
		if ( !arguments.length ) return hours;
		var n = Number(value);
		if ( !isNaN(n) && isFinite(n) ) {
			hours = n;
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
		if ( !arguments.length ) return days;
		var n = Number(value);
		if ( !isNaN(n) && isFinite(n) ) {
			days = n;
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
		if ( !arguments.length ) return months;
		var n = Number(value);
		if ( !isNaN(n) && isFinite(n) ) {
			months = n;
		}
		return self;
	}
	
	/**
	 * Get or set the number of years to display for the Month aggregate level.
	 * 
	 * @param {number} [value] the number of years to display
	 * @return when used as a getter, the number of years, otherwise this object
	 * @memberOf sgSchoolApp
	 */
	function numYears(value) {
		if ( !arguments.length ) return years;
		var n = Number(value);
		if ( !isNaN(n) && isFinite(n) ) {
			years = n;
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
			if ( isNaN(n) || !isFinite(n) ) {
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
		chartRefresh();
		if ( refreshTimer === undefined ) {
			refreshTimer = setInterval(chartRefresh, refreshMs);
		}
		return self;
	}
	
	/* === Global Chart Support === */

	function chartRefresh() {
		var needsRedraw = false;
		if ( !barEnergyChart ) {
			barEnergyChart = barEnergyChartCreate();
			barEnergyChartContainer = d3.select(d3.select(barEnergyChartSelector).node().parentNode);
			needsRedraw = true;
		}
		if ( !pieEnergyChart ) {
			pieEnergyChart = pieEnergyChartCreate();
			pieEnergyChartContainer = d3.select(d3.select(pieEnergyChartSelector).node().parentNode);
			needsRedraw = true;
		}
		if ( displayRange ) {
			if ( needsRedraw ) {
				chartLoadData();
			}
			
			// hide the outdated warning message if we've selected a specific date range
			chartSetupOutdatedMessage();
		} else {
			needsRedraw = (endDate === undefined);
			sn.datum.availableDataRange(chartSetupSourceSets(), function(repInterval) {
				var jsonEndDate = repInterval.eDate;
				if ( needsRedraw || jsonEndDate > endDate ) {
					endDate = jsonEndDate;
					chartLoadData();
				}
				chartSetupOutdatedMessage(endDate);
			});
		}
	}
	
	function chartSetupOutdatedMessage(mostRecentDataDate) {
		// if the data is stale by an hour or more, display the "outdated" message
		var format;
		if ( mostRecentDataDate && new Date().getTime() - mostRecentDataDate.getTime() >= (1000 * 60 * 60) ) {
			format = d3.time.format('%d %b %Y %H:%M');
			d3.select(outdatedSelector).style('display', null).select('.value').text(format(mostRecentDataDate));
		} else {
			d3.select(outdatedSelector).style('display', 'none');
		}
	}
	
	function chartSetupSourceSets(regenerate) {
		if ( !chartSourceSets || regenerate ) {
			chartSourceSets = [
				{ nodeUrlHelper : urlHelper, 
					sourceIds : consumptionSources, 
					dataType : 'Consumption' },
				{ nodeUrlHelper : urlHelper, 
					sourceIds : generationSources, 
					dataType : 'Generation' }
			];
		}
		return chartSourceSets;
	}

	function chartSetupColorMap() {
		if ( chartSourceColorMap ) {
			return;
		}

		chartSourceColorMap = sn.sourceColorMapping(chartSourceGroupMap);

		// we make use of sn.colorFn, so stash the required color map where expected
		// TODO: is this necessary? sn.runtime.colorData = sn.runtime.sourceColorMap.colorMap;
		
		return chartSourceColorMap;
	}
	
	function chartColorForDataTypeSource(dataType, sourceId, sourceIndex) {
		if ( !chartSourceColorMap ) {
			return (dataType === 'Consumption' ? '#00c' : '#0c0');
		}
		var mappedSourceId = chartSourceColorMap.displaySourceMap[dataType][sourceId];
		return chartSourceColorMap.colorMap[mappedSourceId];
	}
	
	function forcedDisplayFactorFn() {
		return (forcedDisplayFactor > 0 ? function() { 
			return forcedDisplayFactor;
		} : null);
	}
	
	function chartDatumDate(datum) {
		if ( datum.date ) {
			return datum.date;
		}
		if ( datum.localDate ) {
			return sn.dateTimeFormat.parse(datum.localDate +' ' +datum.localTime);
		}
		if ( datum.created ) {
			return sn.timestampFormat.parse(datum.created);
		}
		return null;
	}

	function chartDataCallback(dataType, datum) {
		// create date property
		datum.date = chartDatumDate(datum);
	}
	
	function chartQueryRange() {
		var range = displayRange;
		if ( !range ) {
			range = sn.datum.loaderQueryRange(chartParams.aggregate, 
				{ numHours : hours, numDays : days, numMonths : months, numYears : years}, 
				(endDate ? endDate : new Date()));
		}
		return range;
	}
	
	function chartRegenerate(chart, container, tooltipContainer) {
		var scale;
		if ( !chart ) {
			return;
		}
		scale = (chart.yScale ? chart.yScale() : chart.scale());
		chart.regenerate();
		sn.adjustDisplayUnits(container, 'Wh', scale, 'energy');
		if ( tooltipContainer ) {
			sn.adjustDisplayUnits(tooltipContainer, 'Wh', scale, 'energy');
		}
	}
	
	function chartLoadData() {
		chartSetupColorMap();
		var sourceSets = chartSetupSourceSets();
		var queryRange = chartQueryRange();
		var plotPropName = chartParams.plotProperties[chartParams.aggregate];
		var loadSets = sourceSets.map(function(sourceSet) {
			return sn.datum.loader(sourceSet.sourceIds, sourceSet.nodeUrlHelper, queryRange.start, queryRange.end, chartParams.aggregate);
		});
		var chartInfos = [
			{ chart : barEnergyChart, container : barEnergyChartContainer }, // TODO: add tooltipContainer
			{ chart : pieEnergyChart, container : pieEnergyChartContainer }
			
		];
		sn.datum.multiLoader(loadSets).callback(function(error, results) {
			if ( !(Array.isArray(results) && results.length === 2) ) {
				sn.log("Unable to load data for charts: {0}", error);
				return;
			}

			d3.select('.watthour-chart .time-count').text(queryRange.timeCount);
			d3.select('.watthour-chart .time-unit').text(queryRange.timeUnit);

			chartInfos.forEach(function(chartInfo) {
				chartInfo.chart.reset();
				sourceSets.forEach(function(sourceSet, i) {
					chartInfo.chart.load(results[i], sourceSet.dataType);
				});
				chartRegenerate(chartInfo.chart, chartInfo.container, chartInfo.tooltipContainer);
			});
		}).load();
	}
	
	/* === Bar Energy Chart Support === */
	
	function barEnergyChartCreate() {
		var chart = sn.chart.energyIOBarChart(barEnergyChartSelector, chartParams)
			.dataCallback(chartDataCallback)
			.colorCallback(chartColorForDataTypeSource)
			.scaleFactor(dataScaleFactors)
			.displayFactorCallback(forcedDisplayFactorFn())
			.showSumLine(false)
			.hoverEnterCallback(barEnergyHoverEnter)
			.hoverMoveCallback(barEnergyHoverMove)
			.hoverLeaveCallback(barEnergyHoverLeave)
			.doubleClickCallback(barEnergyDoubleClick);
		return chart;
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
	
	function pieEnergyHoverEnter() {
	
	}
	
	function pieEnergyHoverMove() {
	
	}
	
	function pieEnergyHoverLeave() {
	
	}
	
	function pieEnergyDoubleClick() {
	
	}
	
	function pieEnergyChartCreate() {
		var chart = sn.chart.energyIOPieChart(pieEnergyChartSelector, chartParams)
			.colorCallback(chartColorForDataTypeSource)
			.scaleFactor(dataScaleFactors)
			.displayFactorCallback(forcedDisplayFactorFn())
			.hoverEnterCallback(pieEnergyHoverEnter)
			.hoverMoveCallback(pieEnergyHoverMove)
			.hoverLeaveCallback(pieEnergyHoverLeave);			
		return chart;
	}
	
	/** === Initialization === */
	
	function init() {
		chartParams = new sn.Configuration({
			aggregate : 'Hour',
			northernHemisphere : false,
			innerRadius : 40,
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
			numYears					: { value : numYears },
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
			numDays : 5,
			numMonths : 12,
			numYears : 2,
			fixedDisplayFactor : 1000,
			sourceIds : 'Solar',
			consumptionSourceIds : 'DB',
			barEnergySelector : '#energy-bar-chart',
			pieEnergySelector : '#energy-pie-chart',
			outdatedSelector : '#chart-outdated-msg'
		});
	}
	
	urlHelper = sn.datum.nodeUrlHelper(env.nodeId, { tls : sn.config.tls, host : sn.config.host });

	app = sgSchoolApp(urlHelper, env.barEnergySelector, env.pieEnergySelector, env.outdatedSelector)
		.generationSourceIds(env.sourceIds)
		.consumptionSourceIds(env.consumptionSourceIds)
		.numHours(env.numHours)
		.numDays(env.numDays)
		.numMonths(env.numMonths)
		.numYears(env.numYears)
		.fixedDisplayFactor(env.fixedDisplayFactor)
		.start();
	
	return app;
}

sn.runtime.sgSchoolApp = startApp;

}(window));
