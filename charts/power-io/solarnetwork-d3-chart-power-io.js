/**
 * @require d3 3.0
 * @require solarnetwork-d3 0.0.4
 * @require solarnetwork-d3-chart-base 1.0.0
 */
(function() {
'use strict';

if ( sn.chart === undefined ) {
	sn.chart = {};
}

/**
 * @typedef sn.chart.powerIOAreaChartParameters
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
 * A power stacked area chart self overlaps two or more data sets.
 * 
 * @class
 * @extends sn.chart.baseGroupedStackChart
 * @param {string} containerSelector - the selector for the element to insert the chart into
 * @param {sn.chart.powerIOAreaChartParameters} [chartConfig] - the chart parameters
 * @returns {sn.chart.powerIOAreaChart}
 */
sn.chart.powerIOAreaChart = function(containerSelector, chartConfig) {
	var parent = sn.chart.baseGroupedStackChart(containerSelector, chartConfig),
		superDraw = sn.superMethod.call(parent, 'draw');
	var self = (function() {
		var	me = sn.util.copy(parent);
		Object.defineProperty(me, 'version', {value : '1.0.0', enumerable : true, configurable : true});
		return me;
	}());
	parent.me = self;

	var areaPathGenerator = d3.svg.area()
		.interpolate("monotone")
		.x(function(d) { 
			return parent.x(d.date);
		})
		.y0(function(d) { 
			return parent.y(d.y0);
		})
		.y1(function(d) { 
			return parent.y(d.y0 + d.y);
		});

	// object keys define group IDs to treat as "negative" or consumption values, below the X axis
	var negativeGroupMap = { Consumption : true };
	
	function areaFillFn(d, i, j) {
		return parent.fillColor.call(this, d[0][parent.internalPropName].groupId, d[0], i);
	}

	function setupDrawData() {
		var groupedData = [],
			groupIds = parent.groupIds,
			maxPositiveY = 0,
			maxNegativeY = 0;
			
		// construct a 3D array of our data, to achieve a dataType/source/datum hierarchy;
		groupIds.forEach(function(groupId) {
			var groupLayer = parent.groupLayers[groupId];
			if ( groupLayer === undefined ) {
				groupedData.push([]);
			} else {
				groupedData.push(groupLayer.map(function(e) {
					var max = d3.max(e.values, function(d) {
						return (d.y + d.y0);
					});
					if ( negativeGroupMap[groupId] === true ) {
						if ( max > maxNegativeY ) {
							maxNegativeY = max;
						}
					} else if ( max > maxPositiveY ) {
						maxPositiveY = max;
					}
					return e.values;
				}));
			}
		});
		
		return {
			groupedData : groupedData, 
			maxPositiveY : maxPositiveY,
			maxNegativeY : maxNegativeY
		};
	}
	
	function draw() {
		var groupIds = parent.groupIds,
			transitionMs = parent.transitionMs(),
			groups,
			sources,
			centerYLoc,
			yDomain = parent.y.domain(),
			drawData;
		
		drawData = setupDrawData();

		// adjust Y domain to include "negative" range
		yDomain[0] = -drawData.maxNegativeY;
		yDomain[1] = drawData.maxPositiveY;
		parent.y.domain(yDomain).nice();
		
		centerYLoc = parent.y(0);
		
		function dataTypeGroupTransformFn(d, i) {
			var yShift = 0;
			if ( negativeGroupMap[groupIds[i]] === true ) {
				yShift = -(centerYLoc * 2);
				return ('scale(1, -1) translate(0,' + yShift +')');
			} else {
				return null;
			}
		}
		
		// we create groups for each data type, but don't destroy them, so we preserve DOM order
		// and maintain opacity levels for all stack layers within each data type
		groups = parent.svgDataRoot.selectAll('g.dataType').data(drawData.groupedData, function(d, i) {
					return groupIds[i];
				});
		groups.transition().duration(transitionMs)
				.attr('transform', dataTypeGroupTransformFn);
		groups.enter().append('g')
				.attr('class', 'dataType')
				.attr('transform', dataTypeGroupTransformFn);

		sources = groups.selectAll('path.source').data(Object, function(d) {
			return (d.length ? d[0].sourceId : null);
		});
		
		sources.transition().duration(transitionMs)
			.attr('d', areaPathGenerator)
			.style('fill', areaFillFn);

		sources.enter().append('path')
				.attr('class', 'source')
				.style('fill', areaFillFn)
				.attr('d', areaPathGenerator)
				.style('opacity', 1e-6)
			.transition().duration(transitionMs)
				.style('opacity', 1);
		
		sources.exit().transition().duration(transitionMs)
			.style('opacity', 1e-6)
			.remove();
			
		superDraw();
	};
	
	/**
	 * Get or set an array of group IDs to treat as negative group IDs, that appear below
	 * the X axis.
	 *
	 * @param {Array} [value] the array of group IDs to use
	 * @return {Array} when used as a getter, the list of group IDs currently used, otherwise this object
	 * @memberOf sn.chart.powerIOAreaChart
	 */
	self.negativeGroupIds = function(value) {
		if ( !arguments.length ) {
			return (function() {
				var prop,
					result = [];
				for ( prop in negativeGroupMap ) {
					if ( negativeGroupMap.hasOwnProperty(prop) ) {
						result.pus(prop);
					}
				}
				return result;
			}());
		}
		negativeGroupMap = {};
		value.forEach(function(e) {
			negativeGroupMap[e] = true;
		});
		return parent.me;
	};

	// define our drawing function
	parent.draw = draw;
	
	return self;
};

}());
