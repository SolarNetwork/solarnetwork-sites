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
 * @typedef sn.chart.baseGroupedStackBarChartParameters
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
 * An abstract base stacked bar chart.
 * 
 * @class
 * @extends sn.chart.baseGroupedStackChart
 * @param {string} containerSelector - the selector for the element to insert the chart into
 * @param {sn.chart.baseGroupedStackBarChartParameters} [chartConfig] - the chart parameters
 * @returns {sn.chart.baseGroupedStackBarChart}
 */
sn.chart.baseGroupedStackBarChart = function(containerSelector, chartConfig) {
	'use strict';
	var parent = sn.chart.baseGroupedStackChart(containerSelector, chartConfig);
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

	// an ordinal x-axis scale, to render precise bars with
	var xBar = d3.scale.ordinal();

	function groupFillFn(d, i) {
		return parent.fillColor.call(this, d[0][parent.internalPropName].groupId, d[0], i);
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
	
	function valueXMidBar(d) {
		return axisXMidBarValue(d.date);
	}
	
	function valueY(d) {
		return parent.y(d.y0 + d.y);
	}
	
	function heightY(d) {
		return parent.y(d.y0) - parent.y(d.y0 + d.y);
	}
	
	function axisXMidBarValue(date) { 
		return xBar(date) + (xBar.rangeBand() / 2); 
	}
	
	function axisXTickClassMajor(d) {
		var aggregateType = parent.aggregate();
		return (aggregateType === 'Day' && d.getUTCDate() === 1)
			|| (aggregateType === 'Hour' && d.getUTCHours() === 0)
			|| (aggregateType === 'Month' && d.getUTCMonth() === 0);
	}
	
	function axisXTickCount() {
		var count = parent.config.value('tickCountX');
		return (count || 12);
	}

	function drawAxisX() {
		var numTicks = axisXTickCount(),
			fx = parent.x.tickFormat(numTicks),
			ticks = parent.x.ticks(numTicks),
			transitionMs = parent.transitionMs();

		// Generate x-ticks, centered within bars
		var labels = parent.svgTickGroupX.selectAll('text').data(ticks, Object)
				.classed({
						major : axisXTickClassMajor
					});
		
		labels.transition().duration(transitionMs)
	  			.attr('x', axisXMidBarValue)
	  			.text(fx);
		
		labels.enter().append('text')
				.attr('dy', '-0.5em') // needed so descenders not cut off
				.style('opacity', 1e-6)
				.attr('x', axisXMidBarValue)
				.classed({
						major : axisXTickClassMajor
					})
			.transition().duration(transitionMs)
				.style('opacity', 1)
				.text(fx)
				.each('end', function() {
						// remove the opacity style
						d3.select(this).style('opacity', null);
					});
		
		labels.exit().transition().duration(transitionMs)
				.style('opacity', 1e-6)
				.remove();
	}
	
	function drawBarsForSources(sources) {
		// now add actual bars for the datum in the source in the data type
		var bars = sources.selectAll('rect').data(Object, function(d, i) {
			return d.date;
		});
		
		var centerYLoc = parent.y(0),
			transitionMs = parent.transitionMs();
		
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
	}
	
	Object.defineProperties(that, {
		'x' : { value : parent.x },
		'y' : { value : parent.y },
		'config' : { value : parent.config },
		'fillColor' : { value : parent.fillColor },
		'groupOpacityFn' : { value : parent.groupOpacityFn },
		'internalPropName' : { value : parent.internalPropName },
		'discardId' : { value : parent.discardId },
		'plotPropertyName' : { get : function() { return parent.plotPropertyName; } },
		'padding' : { value : parent.padding },
		'width' : { value : parent.width },
		'height' : { value: parent.height },
		'svgRoot' : { value : parent.svgRoot },
		'svgDataRoot' : { value : parent.svgDataRoot },
		'svgTickGroupX' : { value : parent.svgTickGroupX },
		'groupIds' : { get : function() { return parent.groupIds; } },
		'groupLayers' : { get : function() { return parent.groupLayers; } },
		
		'xBar' : { value : xBar },
		'computeDomainX' : { value : computeDomainX },
		'groupFillFn' : { value : groupFillFn },
		
		// the following functions accept a data element, e.g. { date : Date, y : Number, y0 : Number }
		'valueX' : { value : valueX },
		'valueXMidBar' : { value : valueXMidBar },
		'valueY' : { value : valueY },
		'heightY' : { value : heightY },
		
		'drawAxisX' : { value : drawAxisX },
		'drawBarsForSources' : { value : drawBarsForSources },
		'drawAxisY' : { value : parent.drawAxisY },
		'draw' : { 
			get : function() { return parent.draw; },
			set : function(f) { parent.draw = f; }
		}
	});

	
	return that;
};
