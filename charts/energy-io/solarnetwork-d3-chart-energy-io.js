/**
 * @require d3 3.0
 * @require solarnetwork-d3 0.0.54
 * @require solarnetwork-d3-chart-base-bar 1.0.0
 */

if ( sn === undefined ) {
	sn = { chart: {} };
} else if ( sn.chart === undefined ) {
	sn.chart = {};
}

/**
 * @typedef sn.chart.energyIOBarChartParameters
 * @type {sn.Configuration}
 * @property {number} [width=812] - desired width, in pixels, of the chart
 * @property {number} [height=300] - desired height, in pixels, of the chart
 * @property {number[]} [padding=[30, 0, 30, 30]] - padding to inset the chart by, in top, right, bottom, left order
 * @property {number} [transitionMs=600] - transition time
 * @property {string} [aggregate] - the aggregation type; one of 'Month' or 'Hour' or 'Day'
 * @property {number} [ruleOpacity] - the maximum opacity to render rules at, during transitions
 * @property {number} [vertRuleOpacity] - the maximum opacity to render rules at, during transitions
 * @property {string[]} [seasonColors] - array of color values for spring, summer, autumn, and winter
 * @property {sn.Configuration} excludeSources - the sources to exclude from the chart
 */

/**
 * An energy input and output chart designed to show consumption and generation data simultaneously.
 * 
 * You can use the {@code excludeSources} parameter to dynamically alter which sources are visible
 * in the chart. After changing the configuration call {@link sn.chart.energyIOBarChart#regenerate()}
 * to re-draw the chart.
 * 
 * Note that the global {@link sn.colorFn} function is used to map sources to colors, so that
 * must be set up previously.
 * 
 * @class
 * @extends sn.chart.baseGroupedStackBarChart
 * @param {string} containerSelector - the selector for the element to insert the chart into
 * @param {sn.chart.energyIOBarChartParameters} [chartConfig] - the chart parameters
 * @returns {sn.chart.energyIOBarChart}
 */
sn.chart.energyIOBarChart = function(containerSelector, chartConfig) {
	'use strict';
	
	// override defaults of parent
	if ( !(chartConfig && chartConfig.padding) ) {
		chartConfig.value('padding', [20, 0, 40, 30]);
	}
	
	var parent = sn.chart.baseGroupedStackBarChart(containerSelector, chartConfig);
	var that = (function() {
		var	me = sn.util.copy(parent);
		Object.defineProperty(me, 'version', {value : '1.0.0', enumerable : true, configurable : true});
		return me;
	}());
	parent.me = that;

	// Boolean, true for northern hemisphere seasons, false for southern.
	var northernHemisphere = undefined;
	
	// object keys define group IDs to treat as "negative" or consumption values, below the X axis
	var negativeGroupMap = { Consumption : true };
	
	// calculated drawing data
	var drawData = {};

	var svgAggBandGroup = parent.svgDataRoot.append('g')
		.attr('class', 'agg-band')
		.attr('transform', 'translate(0,' +(parent.height + parent.padding[2] - 25) + '.5)'); // .5 for odd-width stroke
	
	var svgAggBandLabelGroup = parent.svgDataRoot.append('g')
		.attr('class', 'agg-band-ticks')
		.attr('transform', 'translate(0,' +(parent.height + parent.padding[2] - 21) +')');
	
	var svgData = parent.svgDataRoot.append('g')
		.attr('class', 'data');
	
	var svgSumLineGroup = parent.svgDataRoot.append('g')
		.attr('class', 'agg-sum');

	var svgAggGroup = parent.svgDataRoot.append('g')
		.attr('class', 'agg-gen')
		.attr('transform', 'translate(0,' + (10 - parent.padding[0]) + ')');
	
	
	function seasonColorFn(d) {
		var seasonColors = (parent.config.seasonColors || ['#5c8726', '#e9a712', '#762123', '#80a3b7']);
		var month = d.date.getUTCMonth();
		if ( month < 2 || month == 11 ) {
			return (northernHemisphere ? seasonColors[3] : seasonColors[1]);
		}
		if ( month < 5 ) {
			return (northernHemisphere ? seasonColors[0] : seasonColors[2]);
		}
		if ( month < 8 ) {
			return (northernHemisphere ? seasonColors[1] : seasonColors[3]);
		}
		return (northernHemisphere ? seasonColors[2] : seasonColors[0]);
	}
	
	function labelSeasonColors(d) {
		if ( parent.aggregate() === 'Month' ) {
			return seasonColorFn(d);
		}
		return null;
	}
	
	function timeAggregateLabelFormatter() {
		var fmt;
		if ( parent.yScale() === 1 ) {
			fmt = ',d';
		} else {
			fmt = ',.1f';
		}
		return d3.format(fmt);
	}

	/**
	 * A rollup function for d3.dest(), that aggregates the plot property value and 
	 * returns objects in the form <code>{ date : Date(..), y : Number, plus : Number, minus : Number }</code>.
	 */
	function nestRollupAggregateSum(array) {
		// Note: we don't use d3.sum here because we want to end up with a null value for "holes"
		var sum = null, plus = null, minus = null, 
			d, v, i, len = array.length, groupId, negate = false;
		for ( i = 0; i < len; i += 1 ) {
			d = array[i];
			v = d[parent.plotPropertyName];
			if ( v !== undefined ) {
				groupId = d[parent.internalPropName].groupId;
				negate = negativeGroupMap[groupId] === true;
				if ( negate ) {
					minus += v;
				} else {
					plus += v;
				}
			}
		}
		if ( plus !== null || minus !== null ) {
			sum = plus - minus;
		}
		return { date : array[0].date, y : sum, plus : plus, minus : minus };
	}
	
	function setupDrawData() {
		var groupedData = [],
			groupIds = parent.groupIds,
			maxPositiveY = 0,
			maxNegativeY = 0,
			sumLineData,
			timeAggregateData;

		// construct a 3D array of our data, to achieve a dataType/source/datum hierarchy;
		// also construct 2D array for sum line
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
		
		var allData = d3.merge(d3.merge(groupedData)).concat(parent.xBar.domain().map(function(e) {
			return { date : e };
		}));
		drawData.allData = allData;
		sumLineData = d3.nest()
			.key(function(d) { 
				return d.date.getTime();
			})
			.sortKeys(d3.ascending)
			.rollup(nestRollupAggregateSum)
			.entries(allData).map(function (e) {
				return e.values;
			});
			
		timeAggregateData = d3.nest()
			.key(function(d) {
				var aggregateType = parent.aggregate();
				var date;
				if ( aggregateType === 'Day' ) {
					// rollup to month
					date = d3.time.month.utc.floor(d.date);
				} else if ( aggregateType === 'Month' ) {
					// rollup to MIDDLE of seasonal quarters, e.g. Jan/Apr/Jul/Oct
					date = d3.time.month.utc.offset(d.date, -((d.date.getUTCMonth() + 1) % 3));
				} else {
					date = d3.time.day.utc.floor(d.date);
				}
				return date.getTime();
			})
			.sortKeys(d3.ascending)
			.rollup(nestRollupAggregateSum)
			.entries(allData).map(function (e) {
				// map date to aggregate value
				e.values.date = new Date(Number(e.key));
				return e.values;
			});
			
		return {
			groupedData : groupedData, 
			sumLineData : sumLineData,
			timeAggregateData : timeAggregateData,
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
			yDomain = parent.y.domain();
			
		// calculate our bar metrics
		parent.computeDomainX();
		
		drawData = setupDrawData();

		// adjust Y domain to include "negative" range
		yDomain[0] = -drawData.maxNegativeY;
		yDomain[1] = drawData.maxPositiveY;
		parent.y.domain(yDomain).nice();
		
		centerYLoc = parent.y(0);
		
		function dataTypeGroupTransformFn(d) {
			var yShift = 0;
			if ( d.length > 0 && d[0].length > 0 && negativeGroupMap[d[0][0][parent.internalPropName].groupId] ) {
				yShift = -(centerYLoc * 2);
				return ('scale(1, -1) translate(0,' + yShift +')');
			} else {
				return null;
			}
		}
		
		// we create groups for each data type, but don't destroy them, so we preserve DOM order
		// and maintain opacity levels for all stack layers within each data type
		groups = svgData.selectAll('g.dataType').data(drawData.groupedData, function(d, i) {
					return groupIds[i];
				});
		groups.transition().duration(transitionMs)
				.attr('transform', dataTypeGroupTransformFn);
		groups.enter().append('g')
				.attr('class', 'dataType')
				.attr('transform', dataTypeGroupTransformFn);
				
		// now add a group for each source within the data type, where we set the color so all
		// bars within the group inherit the same value
		sources = groups.selectAll('g.source').data(Object, function(d, i) {
				return d[0].sourceId;
			})
			.style('fill', parent.groupFillFn);
			
		sources.enter().append('g')
				.attr('class', 'source')
				.style('fill', parent.groupFillFn);
					
		sources.exit().transition().duration(transitionMs)
			.style('opacity', 1e-6)
			.remove();
		
		parent.drawBarsForSources(sources);
		
		drawSumLine(drawData.sumLineData);
		drawTimeAggregateBands(drawData.timeAggregateData);
		drawTimeAggregates(drawData.timeAggregateData);
		
		parent.drawAxisY();
		parent.drawAxisX();
		parent.drawAxisXRules(drawData.timeAggregateData);
	};
	
	function drawSumLine(sumLineData) {
		var transitionMs = parent.transitionMs();
		
		function sumDefined(d) {
			return d.y !== null;
		}
		
		var svgLine = d3.svg.line()
			.x(parent.valueXMidBar)
			.y(function(d) { return parent.y(d.y) - 0.5; })
			.interpolate("monotone")
			.defined(sumDefined);
		
		var sumLine = svgSumLineGroup.selectAll("path").data([sumLineData]);
		
		sumLine.transition().duration(transitionMs)
			.attr("d", svgLine);
		
		sumLine.enter().append("path")
				.attr("d", d3.svg.line()
						.x(parent.valueXMidBar)
						.y(function() { return parent.y(0) - 0.5; })
						.interpolate("monotone")
						.defined(sumDefined))
			.transition().duration(transitionMs)
				.attr("d", svgLine);
				
		sumLine.exit().transition().duration(transitionMs)
				.style('opacity', 1e-6)
				.remove();
	}
	
	function drawTimeAggregateBands(timeAggregateData) {
		var transitionMs = parent.transitionMs(),
			xDomain = parent.x.domain(),
			xBar = parent.xBar,
			d, 
			len = timeAggregateData.length,
			bandTicks;
			
		if ( parent.aggregate() === 'Month' && len > 0 ) {
			bandTicks = timeAggregateData;
		} else {
			bandTicks = [];
		}

		var barWidth = xBar.rangeBand();
		var barPadding = parent.xBarPadding() / 2;
		var aggBands = svgAggBandGroup.selectAll("line").data(bandTicks, parent.keyX);
		var bandPosition = function(s) {
				s.attr("x1", function(d) {
					var date = d.date;
					if ( date.getTime() < xDomain[0].getTime() ) {
						// first band starts before first date, shift to first date
						date = xDomain[0];
					}
					return xBar(date) - barPadding;
				})
				.attr("x2", function(d, i) {
					// for all bands but last, set to start of next band
					if ( i + 1 < bandTicks.length ) {
						return xBar(bandTicks[i+1].date) - barPadding;
					}
					// for last band, set to end of last bar
					if ( bandTicks.length > 1 ) {
						return (xBar(xDomain[1]) + barWidth + barPadding);
					}
					return xBar(d.date) + barPadding;
				})
				.style('stroke', seasonColorFn);
		};
		aggBands.transition().duration(transitionMs)
			.call(bandPosition);

		aggBands.enter().append("line")
			.style("opacity", 1e-6)
			.call(bandPosition)
		.transition().duration(transitionMs)
			.style("opacity", 1)
			.each('end', function() {
				// remove the opacity style
				d3.select(this).style("opacity", null);
			});

		aggBands.exit().transition().duration(transitionMs)
			.style("opacity", 1e-6)
			.remove();
			
		// now draw the labels inside the bands
			
		function labelTextX(d) {
			var x = parent.valueXMidBar(d);
			/* could shift to center of band; but for now keeping vertically aligned with top aggregate label
			if ( d.date.getTime() < xDomain[1].getTime() ) { 
				// shift the label to the next bar (this assumes 3 bars per group)
				//x += barPadding * 2 + barWidth;
			}
			*/
			return x;
		}
			
		function textFn(d) {
			return labelFormatter((d.plus - d.minus) / parent.yScale());
		}

		var labelFormatter = timeAggregateLabelFormatter();

		var aggBandLabels = svgAggBandLabelGroup.selectAll("text").data(parent.trimToXDomain(bandTicks), parent.keyX);
		aggBandLabels.transition().duration(transitionMs)
		  	.attr("x", labelTextX)
		  	.text(textFn);
		
		aggBandLabels.enter().append("text")
			.style("opacity", 1e-6)
			.attr("x", labelTextX)
		.transition().duration(transitionMs)
				.style("opacity", 1)
				.text(textFn)
				.each('end', function() {
						// remove the opacity style
						d3.select(this).style("opacity", null);
					});
		
		aggBandLabels.exit().transition().duration(transitionMs)
			.style("opacity", 1e-6)
			.remove();
	}
	
	function drawTimeAggregates(timeAggregateData) {
		var transitionMs = parent.transitionMs(),
			aggLabels,
			labelTicks,
			labelFormatter = timeAggregateLabelFormatter();
		
		// remove any ticks earlier than first full range
		labelTicks = parent.trimToXDomain(timeAggregateData);
		
		function textFn(d) {
			return labelFormatter(d.plus / parent.yScale());
		}

		aggLabels = svgAggGroup.selectAll("text").data(labelTicks, parent.keyX);
		
		aggLabels.transition().duration(transitionMs)
				.attr("x", parent.valueXMidBar)
				.text(textFn)
				.style("fill", labelSeasonColors);
			
		aggLabels.enter().append("text")
				.attr("x", parent.valueXMidBar)
				.style("opacity", 1e-6)
				.style("fill", labelSeasonColors)
			.transition().duration(transitionMs)
				.text(textFn)
				.style("opacity", 1)
				.each('end', function() {
					// remove the opacity style
					d3.select(this).style("opacity", null);
				});

		aggLabels.exit().transition().duration(transitionMs)
			.style("opacity", 1e-6)
			.remove();
	}

	/**
	 * Toggle showing the sum line, or get the current setting.
	 * 
	 * @param {boolean} [value] <em>true</em> to show the sum line, <em>false</em> to hide it
	 * @returns when used as a getter, the current setting
	 * @memberOf sn.chart.energyIOBarChart
	 */
	that.showSumLine = function(value) {
		if ( !arguments.length ) return !svgSumLineGroup.classed('off');
		var transitionMs = parent.transitionMs();
		svgSumLineGroup
			.style("opacity", (value ? 1e-6 : 1))
			.classed('off', false)
		.transition().duration(transitionMs)
			.style("opacity", (value ? 1 : 1e-6))
			.each('end', function() {
				// remove the opacity style
				d3.select(this)
					.style("opacity", null)
					.classed('off', !value);
			});
		return that;
	};
	
	/**
	 * Toggle between nothern/southern hemisphere seasons, or get the current setting.
	 * 
	 * @param {boolean} [value] <em>true</em> for northern hemisphere seasons, <em>false</em> for sothern hemisphere
	 * @returns when used as a getter, the current setting
	 * @memberOf sn.chart.energyIOBarChart
	 */
	that.northernHemisphere = function(value) {
		if ( !arguments.length ) return northernHemisphere;
		if ( value === northernHemisphere ) {
			return;
		}
		var transitionMs = parent.transitionMs();
		northernHemisphere = (value === true);
		svgAggBandGroup.selectAll("line").transition().duration(transitionMs)
			.style('stroke', seasonColorFn);
		svgAggGroup.selectAll("text").transition().duration(transitionMs)
			.style("fill", labelSeasonColors);
		return that;
	};
	
	/**
	 * Get or set an array of group IDs to treat as negative group IDs, that appear below
	 * the X axis.
	 *
	 * @param {Array} [value] the array of group IDs to use
	 * @return {Array} when used as a getter, the list of group IDs currently used, otherwise this object
	 * @memberOf sn.chart.energyIOBarChart
	 */
	that.negativeGroupIds = function(value) {
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
		return that;
	};

	// define our drawing function
	parent.draw = draw;
	
	return that;
};
