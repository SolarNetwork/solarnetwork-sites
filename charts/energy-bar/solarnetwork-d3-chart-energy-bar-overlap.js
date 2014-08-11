/**
 * @require d3 3.0
 * @require solarnetwork-d3 0.0.4
 * @require solarnetwork-d3-chart-base-bar 1.0.0
 */

if ( sn === undefined ) {
	sn = { chart: {} };
} else if ( sn.chart === undefined ) {
	sn.chart = {};
}

/**
 * @typedef sn.chart.energyBarOverlapChartParameters
 * @type {sn.Configuration}
 * @property {number} [width=812] - desired width, in pixels, of the chart
 * @property {number} [height=300] - desired height, in pixels, of the chart
 * @property {number[]} [padding=[10, 0, 20, 30]] - padding to inset the chart by, in top, right, bottom, left order
 * @property {number} [transitionMs=600] - transition time
 * @property {number} [opacityReduction=0.1] - a percent opacity reduction to apply to groups on top of other groups
 * @property {object} [plotProperties] - the property to plot for specific aggregation levels; if unspecified 
 *                                       the {@code watts} property is used
 */

/**
 * A power stacked area chart that overlaps two or more data sets.
 * 
 * @class
 * @extends sn.chart.baseGroupedStackBarChart
 * @param {string} containerSelector - the selector for the element to insert the chart into
 * @param {sn.chart.energyBarOverlapChartParameters} [chartConfig] - the chart parameters
 * @returns {sn.chart.energyBarOverlapChart}
 */
sn.chart.energyBarOverlapChart = function(containerSelector, chartConfig) {
	'use strict';
	var parent = sn.chart.baseGroupedStackBarChart(containerSelector, chartConfig);
	var that = (function() {
		var	me = sn.util.copy(parent);
		Object.defineProperty(me, 'version', {value : '1.0.0', enumerable : true, configurable : true});
		return me;
	}());
	parent.me = that;
	
	var me = that;
	
	// extending classes should re-define this property so method chaining works
	Object.defineProperty(that, 'me', {
						enumerable : false,
						get : function() { return me; },
						set : function(obj) { 
							me = obj;
							parent.me = obj;
						}
					});

	function dataTypeOpacityFn(d, i) {
		return parent.groupOpacityFn(null, i);
	}
	
	function draw() {
		var groupedData = [],
			groupIds = parent.groupIds,
			transitionMs = parent.transitionMs(),
			groups,
			sources;

		// calculate our bar metrics
		parent.computeDomainX();
		
		// construct a 3D array of our data, to achieve a dataType/source/datum hierarchy
		groupIds.forEach(function(groupId) {
			var groupLayer = parent.groupLayers[groupId];
			if ( groupLayer === undefined ) {
				groupedData.push([]);
			} else {
				groupedData.push(groupLayer.map(function(e) { return e.values; }));
			}
		});
		
		// we create groups for each data type, but don't destroy them, so we preserve DOM order
		// and maintain opacity levels for all stack layers within each data type
		groups = parent.svgRoot.selectAll('g.dataType').data(groupedData, function(d, i) {
			return groupIds[i];
		});
		groups.enter().append('g')
				.attr('class', 'dataType')
				.attr('transform', 'translate(' + parent.padding[3] + ',' + parent.padding[0] + ')')
				.style('opacity', dataTypeOpacityFn);

		// now add a group for each source within the data type, where we set the color so all
		// bars within the group inherit the same value
		sources = groups.selectAll('g.data').data(Object, function(d, i) {
				return d[0].sourceId;
			})
			.style('fill', parent.groupFillFn);
			
		sources.enter().append('g')
				.attr('class', 'data')
				.style('fill', parent.groupFillFn);
					
		sources.exit().transition().duration(transitionMs)
			.style('opacity', 1e-6)
			.remove();
		
		parent.drawBarsForSources(sources);
		parent.drawAxisY();
		parent.drawAxisX();
	};
	
	// define our drawing function
	parent.draw = draw;
	
	return that;
};
