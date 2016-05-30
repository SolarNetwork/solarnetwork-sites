/**
 * @require d3 3.0
 * @require queue 1.0
 * @require solarnetwork-d3 0.2.0
 */

sn.config.debug = true;
//sn.config.host = 'localhost:8680';

(function(window) {
'use strict';

var app;

/**
 * SolarNode stream viewer app. Displays a set of charts related to a single node.
 *
 * @param {object} nodeUrlHelper - A {@link sn.api.node.nodeUrlHelper} configured with the school's SolarNetwork node ID.
 * @param {object} options - An options object.
 * @param {Array|String} options.sourceIds - An array, or comma delimited string, of source IDs to display. If not
 *                                           provided then all available sources will be shown.
 * @param {string} options.chartsContainerSelector - A CSS selector to a container for all charts.
 * @class
 */
var svApp = function(nodeUrlHelper, options) {
	var self = { version : '0.1.0' };
	var urlHelper = nodeUrlHelper;
	var config = (options || {});

	// auto-refresh settings
	var refreshMs = 300000,
		refreshTimer;

	// configuration
	var sources = [],
		hours = 24,
		days = 3,
		months = 4,
		years = 24,
		ignoreProps = { 'nodeId' : true },
		chartConfiguration = new sn.Configuration({
			height : 180,
			aggregate : 'Hour',
			padding : [10, 0, 20, 50]
		});

	// runtime data
	var startDate = new Date(),
		endDate = new Date(),
		dataBySource = [], // nest objects: { key : 'sourceId', values : [ ... ] }
		dataByLine = [], // { key : 'sourceId-propId', source : 'sourceId', prop : 'propId', values : [ ...] }
		charts = {}; // lineId -> chart

	function chartRefresh() {
		// get all available data within the last week
		endDate = new Date();
		startDate = d3.time.day.offset(endDate, -days);

		dataBySource.lengt = 0;
		dataByLine.length = 0;

		sn.api.datum.loader(sources, urlHelper, startDate, endDate, 'Hour').callback(function(error, results) {
			if ( !results || !Array.isArray(results) ) {
				sn.log("Unable to load data: {1}", error);
				return;
			}

			dataBySource = d3.nest()
				.key(function(d) { return d.sourceId; })
				.sortKeys(d3.ascending)
				.entries(results);

			dataBySource.forEach(setupLineDataForSource);

			refreshCharts(dataByLine);
		}).load();
	}

	function setupLineDataForSource(sourceData) {
		// sourceData like { key : 'foo', values : [ ... ] }
		var templateObj = sourceData.values[0];

		// get properties of first object only
		var sourcePlotProperties = Object.keys(templateObj).filter(function(key) {
			return (!ignoreProps[key] && typeof templateObj[key] === 'number');
		}).sort();
		sourcePlotProperties.forEach(function(plotProp) {
			var lineId = sourceData.key + '-' + plotProp,
				lineData = { key : lineId, source : sourceData.key, prop : plotProp, values : sourceData.values };
			dataByLine.push(lineData);
		});
	}

	function refreshCharts(lineDatas) {
		if ( !config.chartsContainerSelector ) {
			return;
		}
		var figures = d3.select(config.chartsContainerSelector).selectAll('figure').data(lineDatas, nestedDataKey);

		figures.enter()
			.append('figure').attr('id', nestedDataKey).each(setupChartForLineData)
			.append('figcaption').text(lineDataDisplayName);

		figures.selectAll('figure').attr('id', nestedDataKey).each(setupChartForLineData);
		figures.selectAll('figcaption').text(lineDataDisplayName);

		figures.exit().each(function(d) {
			delete charts[d.key];
		}).remove();
	}

	// ensure all charts remain un-scaled
	function forcedDisplayFactorFn() {
		return 1;
	}

	function setupChartForLineData(d, i) {
		var container = this,
			key = d.key,
			chart = charts[key];
		if ( !chart ) {
			chart = sn.chart.basicLineChart(container, chartConfiguration)
				.displayFactorCallback(forcedDisplayFactorFn);
			charts[key] = chart;
		}
		chart.reset()
			.load(d.values, d.key, d.prop)
			chart.regenerate();
	}

	function nestedDataKey(d) {
		return d.key;
	}

	function lineDataDisplayName(d) {
		return d.source + ' ' + d.prop;
	}

	/**
	 * Get or set the number of hours to display for the TenMinute aggregate level.
	 *
	 * @param {number} [value] the number of hours to display
	 * @return when used as a getter, the number of hours, otherwise this object
	 * @memberOf svApp
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
	 * @memberOf svApp
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
	 * @memberOf svApp
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
	 * @memberOf svApp
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
	 * Start the application, after configured.
	 *
	 * @return this object
	 * @memberOf svApp
	 */
	function start() {
		chartRefresh();
		if ( refreshTimer === undefined ) {
			refreshTimer = setInterval(chartRefresh, refreshMs);
		}
		return self;
	}

	/**
	 * Stop the application, after started.
	 *
	 * @return this object
	 * @memberOf svApp
	 */
	function stop() {
		if ( refreshTimer !== undefined ) {
			clearInterval(refreshTimer);
			refreshTimer = undefined;
		}
		return self;
	}

	function sourceIds(value) {
		if ( !arguments.length ) return generationSources;
		var array;
		if ( Array.isArray(value) ) {
			array = value;
		} else if ( typeof value === 'string' ) {
			array = value.split(/\s*,\s*/);
		}
		// we want to maintain our original array instance, so just repopulate with new values
		sources.length = 0;
		Array.prototype.push.apply(sources, array);
		return self;
	}

	function init() {
		sourceIds(options.sourceIds);
		Object.defineProperties(self, {
			sourceIds						: { value : sourceIds },
			numHours						: { value : numHours },
			numDays							: { value : numDays },
			numMonths						: { value : numMonths },
			numYears						: { value : numYears },
			start 							: { value : start },
			stop 							: { value : stop }
		});
		return self;
	}

	return init();
};

function setupUI(env) {
	d3.selectAll('.node-id').text(env.nodeId);
}

function startApp(env) {
	var urlHelper;

	if ( !env ) {
		env = sn.util.copy(sn.env, {
			nodeId : 175,
			sourceIds : null,
			numHours : 24,
			numDays : 5,
			numMonths : 12,
			numYears : 1,
			chartsContainerSelector : '#charts-root'
		});
	}

	setupUI(env);

	urlHelper = sn.api.node.nodeUrlHelper(env.nodeId, { tls : sn.config.tls, host : sn.config.host });

	app = svApp(urlHelper, env)
		.numHours(env.numHours)
		.numDays(env.numDays)
		.numMonths(env.numMonths)
		.numYears(env.numYears)
		.start();

	return app;
}

sn.runtime.svApp = startApp;

}(window));
