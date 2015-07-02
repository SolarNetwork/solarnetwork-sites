/**
 * @require d3 3.0
 * @require solarnetwork-d3 0.0.4
 * @require solarnetwork-d3-chart-base 1.0.0
 */
(function() {
'use strict';

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
 * @property {number} [vertRuleOpacity] - the maximum opacity to render vertical rules at, during transitions
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
	var parent = sn.chart.baseGroupedStackChart(containerSelector, chartConfig);
	var self = sn.util.copyAll(parent);
	self.me = self;
	
	// an ordinal x-axis scale, to render precise bars with
	var xBar = d3.scale.ordinal();

	var svgVertRuleGroup = parent.svgRoot.insert('g', '.annot-root')
		.attr('class', 'vertrule')
		.attr('transform', 'translate(' + parent.padding[3] + ',' + parent.padding[0] + ')');

	function groupFillFn(d, i) {
		return parent.fillColor.call(this, d[0][parent.internalPropName].groupId, d[0], i);
	}
	
	function vertRuleOpacity() {
		return (parent.config.vertRuleOpacity || 0.05);
	}
	
	function computeDomainX() {
		var x = parent.x,
			aggregateType = parent.aggregate(),
			xDomain = x.domain(),
			buckets,
			step = 1,
			end = xDomain[1]; // d3.time.X.range has an exclusive end date, so we must add 1
		if ( aggregateType === 'Month' ) {
			end = d3.time.month.utc.offset(end, 1); 
			buckets = d3.time.months.utc;
		} else if ( aggregateType === 'Day' ) {
			end = d3.time.day.utc.offset(end, 1); 
			buckets = d3.time.days.utc;
		} else if ( aggregateType === 'FiveMinute' ) {
			step = 5;
			end = d3.time.minute.utc.offset(end, step);
			buckets = d3.time.minutes.utc;
		} else if ( aggregateType === 'TenMinute' ) {
			step = 10;
			end = d3.time.minute.utc.offset(end, step);
			buckets = d3.time.minutes.utc;
		} else if ( aggregateType === 'FifteenMinute' ) {
			step = 15;
			end = d3.time.minute.utc.offset(end, step);
			buckets = d3.time.minutes.utc;
		} else {
			// assume 'Hour'
			end = d3.time.hour.utc.offset(end, 1); 
			buckets = d3.time.hours.utc;
		}
		buckets = buckets(xDomain[0], end, step);
		xBar.domain(buckets).rangeRoundBands(x.range(), 0.2); 
	}

	/**
	 * Return the date value for a given data element.
	 *
	 * @param {Object} d the data element
	 * @returns {Date} the date
	 */
	function keyX(d) {
		return d.date;
	}

	/**
	 * Return the x pixel coordinate for a given bar.
	 * 
	 * @param {Object} d the data element
	 * @returns {Number} x pixel coordinate
	 */
	function valueX(d) {
		return xBar(d.date);
	}
	
	function valueXMidBar(d) {
		return axisXMidBarValue(d.date);
	}
	
	function valueXVertRule(d) {
		return (Math.floor(valueX(d) - (xBarPadding() / 2)) + 0.5);
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
		return (count || (parent.width > 600 ? 12 : 6));
	}
	
	/**
	 * Get the number of pixels used for padding between bars.
	 *
	 * @returns {Number} the number of pixels padding between each bar
	 */
	function xBarPadding() {
		var domain = xBar.domain();
		var barSpacing = (domain.length > 1 
			? (xBar(domain[1]) - xBar(domain[0])) 
			: barWidth);
		var barPadding = (barSpacing - xBar.rangeBand());
		return barPadding;
	}
	
	/**
	 * Remove data self falls outside the X domain.
	 * 
	 * @param {Array} array The array to inspect.
	 * @returns {Array} Either a copy of the array with some elements removed, or the original array
	 *                  if nothing needed to be removed.
	 */
	function trimToXDomain(array) {
		var start = 0,
			len = array.length,
			xDomainStart = parent.x.domain()[0];
		
		// remove any data earlier than first full range
		while ( start < len ) {
			if ( array[start].date.getTime() >= xDomainStart.getTime() ) {
				break;
			}
			start += 1;
		}
		return (start === 0 ? array : array.slice(start));
	}
	
	function xAxisTickFormatter() {
		var fxDefault = parent.x.tickFormat(axisXTickCount()),
			callback = parent.xAxisTickCallback();
		return function(d, i) {
			if ( callback ) {
				return callback.call(parent.me, d, i, parent.x, fxDefault);
			} else {
				return fxDefault(d, i);
			}
		};
	}

	function drawAxisX() {
		var ticks = parent.x.ticks(axisXTickCount()),
			transitionMs = parent.transitionMs(),
			fx = xAxisTickFormatter(),
			labels;
			
		// we may have generated ticks for which we don't have bars... so filter those out
		ticks = ticks.filter(function(d) { 
			return xBar(d) !== undefined;
		});

		// Generate x-ticks, centered within bars
		labels = parent.svgTickGroupX.selectAll('text').data(ticks, Object)
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
		var centerYLoc = parent.y(0),
			transitionMs = parent.transitionMs(),
			bars = sources.selectAll('rect').data(Object, keyX);
		
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
	
	function drawAxisXRules(vertRuleTicks) {
		var transitionMs = parent.transitionMs(),
			axisLines,
			labelTicks;
			
		labelTicks = trimToXDomain(vertRuleTicks);
		axisLines = svgVertRuleGroup.selectAll("line").data(labelTicks, keyX),
		
		axisLines.transition().duration(transitionMs)
	  		.attr("x1", valueXVertRule)
	  		.attr("x2", valueXVertRule);
		
		axisLines.enter().append("line")
			.style("opacity", 1e-6)
			.attr("x1", valueXVertRule)
	  		.attr("x2", valueXVertRule)
	  		.attr("y1", 0)
	  		.attr("y2", parent.height + 10)
		.transition().duration(transitionMs)
			.style("opacity", vertRuleOpacity())
			.each('end', function() {
				// remove the opacity style
				d3.select(this).style("opacity", null);
			});
		
		axisLines.exit().transition().duration(transitionMs)
			.style("opacity", 1e-6)
			.remove();
	}
	
	/**
	 * Scale a date for the x-axis. The values returned are centered within bars.
	 * 
	 * @param {Date} the Date to scale
	 * @return {Number} the scaled value
	 * @memberOf sn.chart.baseGroupedStackChart
	 */
	self.scaleDate = function(date) {
		var barRange = xBar.range(),
			ex = xBar.rangeExtent(),
			x = parent.scaleDate(date);
		var result = barRange[Math.round((x / ex[1]) * (barRange.length - 1))] + (xBar.rangeBand() / 2);
		return result;
	};
	
	Object.defineProperties(self, {
		svgVertRuleGroup : { value : svgVertRuleGroup },
		xBar : { value : xBar },
		xBarPadding : { value : xBarPadding },
		trimToXDomain : { value : trimToXDomain },
		computeDomainX : { value : computeDomainX },
		groupFillFn : { value : groupFillFn },
	
		// the following functions accept a data element, e.g. { date : Date, y : Number, y0 : Number }
		keyX : { value : keyX },
		valueX : { value : valueX },
		valueXMidBar : { value : valueXMidBar },
		valueXVertRule : { value : valueXVertRule },
		valueY : { value : valueY },
		heightY : { value : heightY },
	
		drawAxisXRules : { value : drawAxisXRules },
		drawBarsForSources : { value : drawBarsForSources },
	});
	
	parent.drawAxisX = drawAxisX;
	
	return self;
};

}());
