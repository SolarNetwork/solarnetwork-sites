/**
 * @require d3 3.0
 * @require queue 1.0
 * @require solarnetwork-d3 0.0.3
 */

if ( sn === undefined ) {
	sn = { chart: {} };
} else if ( sn.chart === undefined ) {
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
 * @property {sn.Configuration} excludeSources - the sources to exclude from the chart
 */

/**
 * A power stacked area chart that overlaps two or more data sets.
 * 
 * You can use the {@code excludeSources} parameter to dynamically alter which sources are visible
 * in the chart. After changing the configuration call {@link sn.chart.powerAreaOverlapChart#regenerate()}
 * to re-draw the chart.
 * 
 * @class
 * @param {string} containerSelector - the selector for the element to insert the chart into
 * @param {sn.chart.powerAreaOverlapChartParameters} [chartConfig] - the chart parameters
 * @returns {sn.chart.powerAreaOverlapChart}
 */
sn.chart.powerAreaOverlapChart = function(containerSelector, chartConfig) {
	var that = {
		version : "1.0.0"
	};

	var config = (chartConfig || new sn.Configuration());
	
	// default to container's width, if we can
	var containerWidth = sn.pixelWidth(containerSelector);
	
	var p = (config.padding || [10, 0, 20, 30]),
		w = (config.width || containerWidth || 812) - p[1] - p[3],
		h = (config.height || 300) - p[0] - p[2],
    	x = d3.time.scale.utc().range([0, w]),
		y = d3.scale.linear().range([h, 0]),
		format = d3.time.format("%H");

	// String, one of supported SolarNet aggregate types: Month, Day, Hour, or Minute
	var aggregateType = undefined;
	
	// mapping of aggregateType keys to associated data property names, e.g. 'watts' or 'wattHours'
	var plotProperties = undefined;
	
	var transitionMs = undefined;
	
	// raw data, by groupId
	var originalData = {};

	// the d3 stack offset method, or function
	var stackOffset = undefined;

	var svgRoot = undefined,
		svgTickGroupX = undefined;
	
	var dataCallback = undefined;
	var colorCallback = undefined; // function accepts (groupId, sourceId) and returns a color
	
	// our layer data
	var groupIds = [];
	var groupData = {};
	var groupLayers = {};
	var minY = 0;

	// Set y-axis  unit label
	// setup display units in kW if domain range > 1000
	var displayFactor = 1;
	var displayFormatter = d3.format(',d');

	var areaPathGenerator = d3.svg.area()
		.interpolate("monotone")
		.x(function(d) { 
			return x(d.date);
		})
		.y0(function(d) { 
			return y(d.y0);
		})
		.y1(function(d) { 
			return y(d.y0 + d.y);
		});
	
	function parseConfiguration() {
		that.aggregate(config.aggregate);
		that.plotProperties(config.value('plotProperties'));
		transitionMs = (config.value('transitionMs') || 600);
		vertRuleOpacity = (config.value('vertRuleOpacity') || 0.05);
		stackOffset = (config.value('wiggle') === true ? 'wiggle' : 'zero');
	}
	
	svgRoot = d3.select(containerSelector).select('svg');
	if ( svgRoot.empty() ) {
		svgRoot = d3.select(containerSelector).append('svg:svg')
			.attr('class', 'chart')
			.attr("width", w + p[1] + p[3])
			.attr("height", h + p[0] + p[2]);
	} else {
		svgRoot.selectAll('*').remove();
	}

	svgTickGroupX = svgRoot.append("g")
		.attr("class", "ticks")
		.attr("transform", "translate(" + p[3] +"," +(h + p[0] + p[2]) +")");

	svgRoot.append("g")
		.attr("class", "crisp rule")
		.attr("transform", "translate(0," + p[0] + ")");

	//function strokeColorFn(d, i) { return d3.rgb(sn.colorFn(d,i)).darker(); }

	// get the opacity level for a given group
	function groupOpacityFn(d, i) {
		var grade = (config.value('opacityReduction') || 0.1);
		return (1 - (i * grade));
	}
	
	function computeUnitsY() {
		var fmt;
		var maxY = d3.max(y.domain(), function(v) { return Math.abs(v); });
		if ( maxY >= 100000 ) {
			displayFactor = 1000000;
			fmt = ',g';
		} else if ( maxY >= 1000 ) {
			displayFactor = 1000;
			fmt = ',g';
		} else {
			displayFactor = 1;
			fmt = ',d';
		}
		displayFormatter = d3.format(fmt);
	}
	
	function displayFormat(d) {
		return displayFormatter(d / displayFactor);
	}

	function setup() {
		var plotPropName = plotProperties[aggregateType];
		var minX = undefined, maxX = undefined;
		var maxY = undefined;
		var stack = d3.layout.stack()
			.offset(stackOffset)
			.values(function(d) { 
				return d.values;
			})
			.x(function(d) { 
				return d.date; 
			})
			.y(function(d) { 
				var y = d[plotPropName];
				if ( y === undefined || y < 0 || y === null ) {
					y = 0;
				}
				return y;
			});
		groupIds.forEach(function(groupId) {
			var i, j, jMax, k, dummy;
			var layerData;
			var rawGroupData = originalData[groupId];
			if ( !rawGroupData || !rawGroupData.length > 1 ) {
				return;
			}
			layerData = d3.nest()
				.key(function(d) {
					if ( dataCallback ) {
						dataCallback.call(that, groupId, d);
					}
					if ( d.sourceId === '' ) {
						d.sourceId = 'Main';
					}
					return d.sourceId;
				})
				.entries(rawGroupData);
			
			// fill in "holes" for each stack, if more than one stack. we assume data already sorted by date
			jMax = layerData.length - 1;
			if ( jMax > 0 ) {
				i = 0;
				while ( i < layerData[0].values.length ) {
					dummy = undefined;
					for ( j = 0; j <= jMax; j++ ) {
						if ( j < jMax ) {
							k = j + 1;
						} else {
							k = 0;
						}
						if ( layerData[k].values.length <= i || layerData[j].values[i].date.getTime() < layerData[k].values[i].date.getTime() ) {
							dummy = {date : layerData[j].values[i].date, sourceId : layerData[k].key};
							dummy[plotProperties[aggregateType]] = null;
							layerData[k].values.splice(i, 0, dummy);
						}
					}
					if ( dummy === undefined ) {
						i++;
					}
				}
			}
			var rangeX = [rawGroupData[0].date, rawGroupData[rawGroupData.length - 1].date];
			if ( minX === undefined || rangeX[0].getTime() < minX.getTime() ) {
				minX = rangeX[0];
			}
			if ( maxX === undefined || rangeX[1].getTime() > maxX.getTime() ) {
				maxX = rangeX[1];
			}
			groupData[groupId] = {
					layerData : layerData,
					xRange : rangeX
			};
			var layers = stack(layerData);
			groupLayers[groupId] = layers;
			var rangeY = [0, d3.max(layers[layers.length - 1].values, function(d) { return d.y0 + d.y; })];
			if ( maxY === undefined || rangeY[1] > maxY ) {
				maxY = rangeY[1];
			}
			groupData[groupId].yRange = rangeY;
		});
		
		// setup X domain
		if ( minX !== undefined && maxX !== undefined ) {
			x.domain([minX, maxX]);
		}
		
		// setup Y domain
		if ( maxY !== undefined ) {
			y.domain([0, maxY]).nice();
		}
		
		computeUnitsY();
	}
	
	function fillColor(groupId, d, i) {
		if ( colorCallback === undefined ) {
			return 'black';
		}
		return colorCallback(groupId, d.sourceId, i);
	}

	function draw() {	
		// group the data into 2D array, so we can use d3 nested selections to map the data
		var groupedData = [];
		groupIds.forEach(function(groupId) {
			var groupData = groupLayers[groupId].map(function(e) { return e.values; });
			groupedData.push(groupData);
		});
		
		var groups = svgRoot.selectAll("g.data").data(groupedData, function(d, i) {
				return groupIds[i];
			});
			
		groups.transition().duration(transitionMs)
			.style('opacity', groupOpacityFn);
			
		
		groups.enter().append('g')
				.attr('class', 'data')
				.attr('transform', "translate(" + p[3] + ',' + p[0] + ')')
			.transition().duration(transitionMs)
				.style('opacity', groupOpacityFn);
					
		groups.exit().transition().duration(transitionMs)
			.style("opacity", 1e-6)
			.remove();
		
		var area = groups.selectAll('path.area').data(Object, function(d, i) {
			return (d.length ? d[0].sourceId : null);
		});
		function fillFn(d, i, j) {
			return fillColor.call(this, groupIds[j], d[0], i);
		};
		area.transition().duration(transitionMs).delay(200)
			.attr("d", areaPathGenerator)
			.style("fill", fillFn);

		area.enter().append("path")
				.attr("class", "area")
				.style("fill", fillFn)
				.attr("d", areaPathGenerator);
		
		area.exit().remove();
		
		adjustAxisX()
		adjustAxisY();
	}

	function axisYTransform(d) {
		// align to half-pixels, to 1px line is aligned to pixels and crisp
		return "translate(0," + (Math.round(y(d) + 0.5) - 0.5) + ")"; 
	};

	function adjustAxisX() {
		if ( d3.event && d3.event.transform ) {
			d3.event.transform(x);
		}
		var numTicks = 12;
		var fx = x.tickFormat(numTicks);
		var ticks = x.ticks(numTicks);

		// Generate x-ticks
		var labels = svgTickGroupX.selectAll("text").data(ticks);
		
		labels.transition().duration(transitionMs)
	  		.attr("x", x)
	  		.text(fx);
		
		labels.enter().append("text")
			.attr("dy", "-0.5em") // needed so descenders not cut off
			.style("opacity", 1e-6)
			.attr("x", x)
		.transition().duration(transitionMs)
				.style("opacity", 1)
				.text(fx)
				.each('end', function() {
						// remove the opacity style
						d3.select(this).style("opacity", null);
					});
		labels.exit().transition().duration(transitionMs)
			.style("opacity", 1e-6)
			.remove();
	}
	
	function axisRuleClassY(d) {
		return (d === 0 ? 'origin' : 'm');
	}

	function adjustAxisY() {
		var yTicks = (that.wiggle() ? [] : y.ticks(5).filter(function(e) { return e !== 0; }));
		var axisLines = svgRoot.select("g.rule").selectAll("g").data(yTicks);
		var axisLinesT = axisLines.transition().duration(transitionMs);
		axisLinesT.attr("transform", axisYTransform)
			.select("text")
				.text(displayFormat);
		axisLinesT.select("line")
				.attr('class', axisRuleClassY);
		
	  	axisLines.exit().transition().duration(transitionMs)
	  			.style("opacity", 1e-6)
	  			.remove();
	  			
		var entered = axisLines.enter()
				.append("g")
				.style("opacity", 1e-6)
	  			.attr("transform", axisYTransform);
		entered.append("line")
				.attr("x2", w + p[3])
				.attr('x1', p[3])
				.attr('class', axisRuleClassY);
		entered.append("text")
				.attr("x", p[3] - 10)
				.text(displayFormat);
		entered.transition().duration(transitionMs)
				.style("opacity", 1)
				.each('end', function() {
					// remove the opacity style
					d3.select(this).style("opacity", null);
				});
	}
	
	/**
	 * Get the x-axis domain (minimum and maximum dates).
	 * 
	 * @return {number[]} an array with the minimum and maximum values used in the x-axis of the chart
	 * @memberOf sn.chart.powerAreaOverlapChart
	 */
	that.xDomain = function() { return x.domain(); };

	/**
	 * Get the y-axis domain (minimum and maximum values).
	 * 
	 * @return {number[]} an array with the minimum and maximum values used in the y-axis of the chart
	 * @memberOf sn.chart.powerAreaOverlapChart
	 */
	that.yDomain = function() { return y.domain(); };
	
	/**
	 * Get the scaling factor the y-axis is using. By default this will return {@code 1}.
	 * After calling the {@link #load()} method, however, the chart may decide to scale
	 * the y-axis for clarity. You can call this method to find out the scaling factor the
	 * chart ended up using.
	 *  
	 * @return the y-axis scale factor
	 * @memberOf sn.chart.powerAreaOverlapChart
	 */
	that.yScale = function() { return displayFactor; };

	/**
	 * Get the current {@code aggregate} value in use.
	 * 
	 * @param {number} [value] the number of consumption sources to use
	 * @returns when used as a getter, the count number, otherwise this object
	 * @returns the {@code aggregate} value
	 * @memberOf sn.chart.powerAreaOverlapChart
	 */
	that.aggregate = function(value) { 
		if ( !arguments.length ) return aggregateType;
		aggregateType = (value === 'Month' ? 'Month' : value === 'Day' ? 'Day' : value === 'Hour' ? 'Hour' : 'Minute');
		return that;
	};
	
	/**
	 * Clear out all data associated with this chart. Does not redraw.
	 * 
	 * @return this object
	 * @memberOf sn.chart.powerAreaOverlapChart
	 */
	that.reset = function() {
		originalData = {};
		groupData = {};
		return that;
	};
	
	/**
	 * Add data for a single group in the chart. The data is appended if data has 
	 * already been loaded for the given groupId. This does not redraw the chart. 
	 * Once all groups have been loaded, call {@link #regenerate()} to redraw.
	 * 
	 * @param {Array} rawData - the raw chart data to load
	 * @param {String} groupId - the ID to associate with the data; each stack group must have its own ID
	 * @return this object
	 * @memberOf sn.chart.powerAreaOverlapChart
	 */
	that.load = function(rawData, groupId) {
		if ( originalData[groupId] === undefined ) {
			groupIds.push(groupId);
			originalData[groupId] = rawData;
		} else {
			originalData[groupId].concat(rawData);
		}
		return that;
	};
	
	/**
	 * Regenerate the chart, using the current data. This can be called after disabling a
	 * source 
	 * 
	 * @return this object
	 * @memberOf sn.chart.powerAreaOverlapChart
	 */
	that.regenerate = function() {
		if ( originalData === undefined ) {
			// did you call load() first?
			return that;
		}
		parseConfiguration();
		setup();
		draw();
		return that;
	};
	
	/**
	 * Get or set the animation transition time, in milliseconds.
	 * 
	 * @param {number} [value] the number of milliseconds to use
	 * @return when used as a getter, the millisecond value, otherwise this object
	 * @memberOf sn.chart.powerAreaOverlapChart
	 */
	that.transitionMs = function(value) {
		if ( !arguments.length ) return transitionMs;
		transitionMs = +value; // the + used to make sure we have a Number
		return that;
	};

	/**
	 * Get or set the d3 stack offset.
	 * 
	 * This can be any supported d3 stack offset, such as 'wiggle' or a custom function.
	 * 
	 * @param {string|function} [value] the stack offset to use
	 * @return when used as a getter, the stack offset value, otherwise this object
	 * @memberOf sn.chart.powerAreaOverlapChart
	 */
	that.stackOffset = function(value) {
		if ( !arguments.length ) return stackOffset;
		stackOffset = value;
		return that;
	};

	/**
	 * Get or set the "wiggle" stack offset method.
	 * 
	 * This is an alias for the {@link #stackOffset} function, specifically to set the {@code wiggle}
	 * style offset if passed <em>true</em> or the {@code zero} offset if <em>false</em>.
	 * 
	 * @param {boolean} [value] <em>true</em> to use the {@code wiggle} offset, <em>false</em> to use {@code zero}
	 * @return when used as a getter, <em>true</em> if {@code wiggle} is the current offset, <em>false</em> otherwise;
	 *         when used as a setter, this object
	 * @memberOf sn.chart.powerAreaOverlapChart
	 */
	that.wiggle = function(value) {
		if ( !arguments.length ) return (stackOffset === 'wiggle');
		return that.stackOffset(value === true ? 'wiggle' : 'zero');
	};
	
	/**
	 * Get or set the plot property names for all supported aggregate levels.
	 * 
	 * When used as a setter, an Object with properties of the following names are supported:
	 * 
	 * <ul>
	 *   <li>Minute</li>
	 *   <li>Hour</li>
	 *   <li>Day</li>
	 *   <li>Month</li>
	 * </ul>
	 * 
	 * Each value should be the string name of the datum property to plot on the y-axis of the chart.
	 * If an aggregate level is not defined, it will default to {@code watts}.
	 * 
	 * @param {object} [value] the aggregate property names to use
	 * @return when used as a getter, the current plot property value mapping object, otherwise this object
	 * @memberOf sn.chart.powerAreaOverlapChart
	 */
	that.plotProperties = function(value) {
		if ( !arguments.length ) return plotProperties;
		var p = {};
		['Minute', 'Hour', 'Day', 'Month'].forEach(function(e) {
			p[e] = (value !== undefined && value[e] !== undefined ? value[e] : 'watts');
		});
		plotProperties = p;
		return that;
	};

	/**
	 * Get or set the data callback function. This function will be called as the
	 * chart iterates over the raw input data as it performs grouping and normalization
	 * operations. The callback will be passed the group ID and the data as arguments.
	 * 
	 * @param {function} [value] the data callback
	 * @return when used as a getter, the current data callback function, otherwise this object
	 * @memberOf sn.chart.powerAreaOverlapChart
	 */
	that.dataCallback = function(value) {
		if ( !arguments.length ) return dataCallback;
		if ( typeof value === 'function' ) {
			dataCallback = value;
		}
		return that;
	};

	/**
	 * Get or set the color callback function. The callback will be passed the group ID 
	 * and a source ID as arguments.
	 * 
	 * @param {function} [value] the color callback
	 * @return when used as a getter, the current color callback function, otherwise this object
	 * @memberOf sn.chart.powerAreaOverlapChart
	 */
	that.colorCallback = function(value) {
		if ( !arguments.length ) return colorCallback;
		if ( typeof value === 'function' ) {
			colorCallback = value;
		}
		return that;
	};

	parseConfiguration();
	return that;
};
