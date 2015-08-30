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

	var svgSumLineGroup = parent.svgRoot.append('g')
		.attr('class', 'agg-sum')
		.attr('transform', parent.svgDataRoot.attr('transform'));

	var areaPathGenerator = d3.svg.area()
		.interpolate('monotone')
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

	/**
	 * A rollup function for d3.dest(), that aggregates the plot property value and 
	 * returns objects in the form <code>{ date : Date(..), y : Number, plus : Number, minus : Number }</code>.
	 */
	function nestRollupAggregateSum(array) {
		// Note: we don't use d3.sum here because we want to end up with a null value for "holes"
		var sum = null, plus = null, minus = null, 
			d, v, i, len = array.length, groupId, scale, negate = false;
		for ( i = 0; i < len; i += 1 ) {
			d = array[i];
			v = d[parent.plotPropertyName];
			if ( v !== undefined ) {
				groupId = d[parent.internalPropName].groupId;
				scale = parent.scaleFactor(groupId);
				negate = negativeGroupMap[groupId] === true;
				if ( negate ) {
					minus += v * scale;
				} else {
					plus += v * scale;
				}
			}
		}
		if ( plus !== null || minus !== null ) {
			sum = plus - minus;
		}
		return { date : array[0].date, y : sum, plus : plus, minus : minus };
	}
	
	function ordinalXScale() {
		var result = d3.scale.ordinal(),
			x = parent.x,
			aggregateType = parent.aggregate(),
			xDomain = x.domain(),
			interval,
			step = 1,
			buckets;
		if ( aggregateType === 'Month' ) {
			interval = d3.time.month.utc;
		} else if ( aggregateType === 'Day' ) {
			interval = d3.time.day.utc; 
		} else if ( aggregateType === 'Hour' ) {
			interval = d3.time.hour.utc; 
		} else if ( aggregateType.search(/^Ten/) === 0 ) {
			interval = d3.time.minute.utc;
			step = 10;
		} else if ( aggregateType.search(/^Five/) === 0 ) {
			interval = d3.time.minute.utc;
			step = 5;
		} else {
			// assume FifteenMinute
			interval = d3.time.minute.utc;
			step = 15;
		}
		buckets = interval.range(xDomain[0], interval.offset(xDomain[1], step), step);
		result.domain(buckets);//.rangeRoundBands(x.range(), 0.2);
		return result;
	}
	
	function setupDrawData() {
		var groupedData = [],
			groupIds = parent.groupIds,
			maxPositiveY = 0,
			maxNegativeY = 0,
			xDates = ordinalXScale(),
			sumLineData;

		// construct a 3D array of our data, to achieve a dataType/source/datum hierarchy;
		groupIds.forEach(function(groupId) {
			var groupLayer = parent.groupLayers[groupId];
			if ( groupLayer === undefined ) {
				groupedData.push([]);
			} else {
				groupedData.push(groupLayer.map(function(e) {
					var max = d3.max(e.values, function(d) { return (d.y + d.y0); });
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

		// we use xDates to normalize the data for all dates in chart, so we can show holes in the data
		var allData = d3.merge(d3.merge(groupedData)).concat(xDates.domain().map(function(e) {
			return { date : e };
		}));
		sumLineData = d3.nest()
			.key(function(d) { 
				return d.date.getTime();
			})
			.sortKeys(d3.ascending)
			.rollup(nestRollupAggregateSum)
			.entries(allData).map(function (e) {
				return e.values;
			});
			
		
		return {
			groupedData : groupedData,
			sumLineData : sumLineData,
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
			
		drawSumLine(drawData.sumLineData);

		superDraw();
	};
	
	function drawSumLine(sumLineData) {
		var transitionMs = parent.transitionMs();
		
		function sumDefined(d) {
			return d.y !== null;
		}
		
		function valueX(d) {
			return parent.x(d.date);
		}
		
		var svgLine = d3.svg.line()
			.x(valueX)
			.y(function(d) { return parent.y(d.y) - 0.5; })
			.interpolate('monotone')
			.defined(sumDefined);
		
		var sumLine = svgSumLineGroup.selectAll('path').data([sumLineData]);
		
		sumLine.transition().duration(transitionMs)
			.attr('d', svgLine);
		
		sumLine.enter().append('path')
				.attr('d', d3.svg.line()
						.x(valueX)
						.y(function() { return parent.y(0) - 0.5; })
						.interpolate('monotone')
						.defined(sumDefined))
			.transition().duration(transitionMs)
				.attr('d', svgLine);
				
		sumLine.exit().transition().duration(transitionMs)
				.style('opacity', 1e-6)
				.remove();
	}

	/**
	 * Toggle showing the sum line, or get the current setting.
	 * 
	 * @param {boolean} [value] <em>true</em> to show the sum line, <em>false</em> to hide it
	 * @returns when used as a getter, the current setting
	 * @memberOf sn.chart.energyIOBarChart
	 */
	self.showSumLine = function(value) {
		if ( !arguments.length ) return !svgSumLineGroup.classed('off');
		var transitionMs = parent.transitionMs();
		svgSumLineGroup
			.style('opacity', (value ? 1e-6 : 1))
			.classed('off', false)
		.transition().duration(transitionMs)
			.style('opacity', (value ? 1 : 1e-6))
			.each('end', function() {
				// remove the opacity style
				d3.select(this)
					.style('opacity', null)
					.classed('off', !value);
			});
		return parent.me;
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
	
	parent.normalizeDataTimeGaps(true); // turn this on be default
	
	return self;
};

}());
