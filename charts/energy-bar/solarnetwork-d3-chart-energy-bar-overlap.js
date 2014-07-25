/**
 * @require d3 3.0
 * @require solarnetwork-d3 0.0.4
 * @require solarnetwork-d3-chart-base 1.0.0
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
 * @extends sn.chart.baseGroupedStackChart
 * @param {string} containerSelector - the selector for the element to insert the chart into
 * @param {sn.chart.energyBarOverlapChartParameters} [chartConfig] - the chart parameters
 * @returns {sn.chart.energyBarOverlapChart}
 */
sn.chart.energyBarOverlapChart = function(containerSelector, chartConfig) {
	'use strict';
	var parent = sn.chart.baseGroupedStackChart(containerSelector, chartConfig),
		superDraw = sn.superMethod.call(parent, 'draw');
	var that = (function() {
		var	me = {},
			prop;
		for ( prop in parent ) {
			if ( parent.hasOwnProperty(prop) ) {
				me[prop] = parent[prop];
			}
		}
		Object.defineProperty(me, 'version', {value : '1.0.0', enumerable : true, configurable : true});
		return me;
	}());
	parent.me = that;
	
	// an ordinal x-axis scale, to render precise bars with
	var xBar = d3.scale.ordinal();

	function groupFillFn(d, i, j) {
		return parent.fillColor.call(this, d[0][parent.internalPropName].groupId, d[0], i);
	}
	
	function dataTypeOpacityFn(d, i) {
		return parent.groupOpacityFn(null, i);
	}
	
	function computeDomainX() {
		var x = parent.x,
			aggregateType = parent.aggregate(),
			xDomain = x.domain(),
			buckets,
			end = xDomain[1]; // d3.time.X.range has an exclusive end date, so we must add 1
		if ( aggregateType === 'Month' ) {
			end = d3.time.month.utc.offset(end, 1); 
			buckets = d3.time.months.utc;
		} else if ( aggregateType === 'Day' ) {
			end = d3.time.day.utc.offset(end, 1); 
			buckets = d3.time.days.utc;
		} else {
			// assume 'Hour'
			end = d3.time.hour.utc.offset(end, 1); 
			buckets = d3.time.hours.utc;
		}
		buckets = buckets(xDomain[0], end);
		xBar.domain(buckets).rangeRoundBands(x.range(), 0.2); 
	}

	/**
	 * Return the x pixel coordinate for a given bar.
	 * 
	 * @param {Object} d the data element
	 * @param {Number} i the domain index
	 * @returns {Number} x pixel coordinate
	 */
	function valueX(d, i) {
		return xBar(d.date);
	}
	
	function valueXMidBar(d, i) {
		return (xBar(d.date) + (xBar.rangeBand() / 2));
	}
	
	function valueY(d) {
		return parent.y(d.y0 + d.y);
	}
	
	function heightY(d) {
		return parent.y(d.y0) - parent.y(d.y0 + d.y);
	}
	
	function foo() {
		var sourceGroups = svg.selectAll("g.source").data(layers)
			.style("fill", sn.colorFn);
		sourceGroups.enter()
			.append("g")
				.attr("class", "source")
				.style("fill", sn.colorFn);
		sourceGroups.exit().remove();
		
		var centerYLoc = y(0);
		
		var bars = sourceGroups.selectAll("rect").data(Object, function(d) {
			return d.x;
		});
		bars.transition().duration(transitionMs)
			.attr("x", valueX)
			.attr("y", valueY)
			.attr("height", heightY)
			.attr("width", xBar.rangeBand());
		
		var entered = bars.enter().append("rect")
			.attr("x", valueX)
			.attr("y", centerYLoc)
			.attr("height", 1e-6)
			.attr("width", xBar.rangeBand());
		
		entered.transition().duration(transitionMs)
			.attr("y", valueY)
			.attr("height", heightY);
		
		bars.exit().transition().duration(transitionMs)
			.style("opacity", 1e-6)
  			.remove();
	}
	
	function draw() {
		var groupedData = [],
			groupIds = parent.groupIds,
			transitionMs = parent.transitionMs(),
			groups,
			sources,
			bars,
			centerYLoc = parent.y(0);

		// calculate our bar metrics
		computeDomainX();
		
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
			.style('fill', groupFillFn);
			
		sources.enter().append('g')
				.attr('class', 'data')
				.style('fill', groupFillFn);
					
		sources.exit().transition().duration(transitionMs)
			.style('opacity', 1e-6)
			.remove();
		
		// now add actual bars for the datum in the source in the data type
		bars = sources.selectAll('rect').data(Object, function(d, i) {
			return d.date;
		});
		
		bars.transition().duration(transitionMs)
				.attr('x', valueX)
				.attr('y', valueY)
				.attr('height', heightY)
				.attr('width', xBar.rangeBand());
		
		bars.enter().append('rect')
				.attr('x', valueX)
				.attr('y', centerYLoc)
				.attr('height', 1e-6)
				.attr('width', xBar.rangeBand())
			.transition().duration(transitionMs)
				.attr('y', valueY)
				.attr('height', heightY);
		
		bars.exit().transition().duration(transitionMs)
				.style('opacity', 1e-6)
				.remove();
		
		parent.drawAxisY();
	};
	
	Object.defineProperty(parent, 'draw', {configurable : true, value : draw });
	
	return that;
};
