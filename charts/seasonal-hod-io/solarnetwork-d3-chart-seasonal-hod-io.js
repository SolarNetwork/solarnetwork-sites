/**
 * @require d3 3.0
 * @require solarnetwork-d3 0.0.6
 */
(function() {
'use strict';

if ( sn.chart === undefined ) {
	sn.chart = {};
}

/**
 * @typedef sn.chart.seasonalHourOfDayLineChart
 * @type {sn.Configuration}
 * @property {number} [width=812] - desired width, in pixels, of the chart
 * @property {number} [height=300] - desired height, in pixels, of the chart
 * @property {number[]} [padding=[30, 0, 30, 30]] - padding to inset the chart by, in top, right, bottom, left order
 * @property {number} [transitionMs=600] - transition time
 * @property {number} [ruleOpacity] - the maximum opacity to render rules at, during transitions
 * @property {number} [vertRuleOpacity] - the maximum opacity to render rules at, during transitions
 * @property {string[]} [seasonColors] - array of color values for spring, summer, autumn, and winter
 * @property {sn.Configuration} excludeSources - the sources to exclude from the chart
 */

/**
 * An energy input and output chart designed to show consumption and generation data simultaneously
 * grouped by hours per day, per season.
 * 
 * @class
 * @param {string} containerSelector - the selector for the element to insert the chart into
 * @param {sn.chart.seasonalHourOfDayLineChartParameters} [chartConfig] - the chart parameters
 * @returns {sn.chart.seasonalHourOfDayLineChart}
 */
sn.chart.seasonalHourOfDayLineChart = function(containerSelector, chartConfig) {
	var parent = sn.chart.baseGroupedSeasonalLineChart(containerSelector, chartConfig);
	var self = (function() {
		var	me = sn.util.copy(parent);
		Object.defineProperty(me, 'version', {value : '1.0.0', enumerable : true, configurable : true});
		return me;
	}());
	parent.me = self;
	
	parent.timeKeyLabels(['Midnight', 
						'1am', '2am', '3am', '4am', '5am', '6am', '7am', '8am', '9am', '10am', '11am',
						'Noon',
						'1pm', '2pm', '3pm', '4pm', '5pm', '6pm', '7pm', '8pm', '9pm', '10pm', '11pm']);

	parent.xAxisTicks = function() {
		return parent.x.domain().filter(function(d, i) { return (i % 2) === 0; });
	}
	
	parent.dateForTimeKey = function(offset) {
		return new Date(Date.UTC(2001, 0, 1, offset));
	};
	
	parent.timeKeyForDate = function(date) {
		return date.getUTCHours();
	};
	
	parent.timeKeyInterval = function() {
		return d3.time.hour.utc;
	};
	
	return self;
};

}());
