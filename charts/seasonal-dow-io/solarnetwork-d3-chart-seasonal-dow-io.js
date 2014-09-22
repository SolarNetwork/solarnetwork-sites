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
 * @typedef sn.chart.seasonalDayOfWeekLineChartParameters
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
 * @param {sn.chart.seasonalDayOfWeekLineChartParameters} [chartConfig] - the chart parameters
 * @returns {sn.chart.seasonalDayOfWeekLineChart}
 */
sn.chart.seasonalDayOfWeekLineChart = function(containerSelector, chartConfig) {
	var parent = sn.chart.baseGroupedSeasonalLineChart(containerSelector, chartConfig);
	var self = (function() {
		var	me = sn.util.copy(parent);
		Object.defineProperty(me, 'version', {value : '1.0.0', enumerable : true, configurable : true});
		return me;
	}());
	parent.me = self;
	
	parent.timeKeyLabels(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);

	parent.xAxisTicks = function() {
		return parent.x.domain();
	}
	
	parent.dateForTimeKey = function(offset) {
		return new Date(Date.UTC(2001, 0, 1 + offset));
	};
	
	parent.timeKeyForDate = function(date) {
		return ((date.getUTCDay() + 6) % 7); // group into DOW, with Monday as 0
	};
	
	parent.timeKeyInterval = function() {
		return d3.time.day.utc;
	};
	
	return self;
};

}());
