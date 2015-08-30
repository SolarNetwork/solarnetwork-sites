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
 * @typedef sn.chart.powerAreaOverlapChartParameters
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
 * @extends sn.chart.baseGroupedStackChart
 * @param {string} containerSelector - the selector for the element to insert the chart into
 * @param {sn.chart.powerAreaOverlapChartParameters} [chartConfig] - the chart parameters
 * @returns {sn.chart.powerAreaOverlapChart}
 */
sn.chart.powerAreaOverlapChart = function(containerSelector, chartConfig) {
	var parent = sn.chart.baseGroupedStackChart(containerSelector, chartConfig),
		superDraw = sn.superMethod.call(parent, 'draw');
	var that = (function() {
		var	me = sn.util.copy(parent);
		return me;
	}());
	parent.me = that;

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

	function areaFillFn(d, i, j) {
		return parent.fillColor.call(this, d[0][parent.internalPropName].groupId, d[0], i);
	}
	
	function areaOpacityFn(d, i, j) {
		return parent.groupOpacityFn(null, j);
	}
	
	function draw() {
		// group the data into 2D array, so we can use d3 nested selections to map the data
		var groupedData = [];
		var groupedDataIds = [];
		var groupIds = parent.groupIds;
		var transitionMs = parent.transitionMs();
		groupIds.forEach(function(groupId) {
			var groupLayer = parent.groupLayers[groupId];
			if ( groupLayer === undefined ) {
				return;
			}
			groupedDataIds.push(groupId);
			var groupData = groupLayer.map(function(e) { return e.values; });
			groupedData.push(groupData);
		});
		
		var groups = parent.svgDataRoot.selectAll("g.data").data(groupedData, function(d, i) {
				return groupedDataIds[i];
			});
			
		groups.enter().append('g')
				.attr('class', 'data');
					
		groups.exit().transition().duration(transitionMs)
			.style("opacity", 1e-6)
			.remove();
		
		var area = groups.selectAll('path.area').data(Object, function(d) {
			return (d.length ? d[0][parent.internalPropName].groupId +'.'+d[0].sourceId : null);
		});
		
		area.transition().duration(transitionMs).delay(200)
			.attr("d", areaPathGenerator)
			.style("fill", areaFillFn);

		area.enter().append("path")
				.attr("class", "area")
				.style("fill", areaFillFn)
				.attr("d", areaPathGenerator)
				.style('opacity', 1e-6)
			.transition().duration(transitionMs)
				.style('opacity', areaOpacityFn);
		
		area.exit().transition().duration(transitionMs)
			.style("opacity", 1e-6)
			.remove();
			
		superDraw();
	};
	
	// define our drawing function
	parent.draw = draw;
	
	parent.normalizeDataTimeGaps(true); // turn this on be default
	
	return that;
};


}());
