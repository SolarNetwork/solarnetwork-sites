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
 * @typedef sn.chart.powerAreaChartParameters
 * @type {sn.Configuration}
 * @property {number} [width=812] - desired width, in pixels, of the chart
 * @property {number} [height=300] - desired height, in pixels, of the chart
 * @property {number[]} [padding=[10, 0, 20, 30]] - padding to inset the chart by, in top, right, bottom, left order
 * @property {number} [transitionMs=600] - transition time
 * @property {object} [plotProperties] - the property to plot for specific aggregation levels; if unspecified 
 *                                       the {@code watts} property is used
 * @property {sn.Configuration} excludeSources - the sources to exclude from the chart
 */

/**
 * An power stacked area chart.
 * 
 * @class
 * @param {string} containerSelector - the selector for the element to insert the chart into
 * @param {sn.chart.powerAreaChartParameters} [chartConfig] - the chart parameters
 * @returns {sn.chart.powerAreaChart}
 */
sn.chart.powerAreaChart = function(containerSelector, chartConfig) {
	var parent = sn.chart.baseGroupedStackChart(containerSelector, chartConfig),
		superDraw = sn.superMethod.call(parent, 'draw');
	var self = (function() {
		var	me = sn.util.copy(parent);
		return me;
	}());
	parent.me = self;

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

	function areaFillFn(d, i, j) {
		return parent.fillColor.call(this, d[0][parent.internalPropName].groupId, d[0], i);
	}
	
	function setup() {
		var allData = [],
			layerData,
			dummy,
			rangeX,
			rangeY,
			layers,
			plotPropName = parent.plotPropertyName;
		var stack = d3.layout.stack()
			.offset(self.stackOffset())
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
		parent.groupIds.forEach(function(groupId) {
			var rawGroupData = self.data(groupId),
				i,
				len,
				d;
			if ( !rawGroupData || !rawGroupData.length > 1 ) {
				return;
			}
			
			for ( i = 0, len = rawGroupData.length; i < len; i += 1 ) {
				d = rawGroupData[i];
				if ( !d.hasOwnProperty(parent.internalPropName) ) {
					d[parent.internalPropName] = {};
					d[parent.internalPropName].groupId = groupId;
					if ( self.dataCallback() ) {
						self.dataCallback().call(parent.me, groupId, d);
					}
					if ( d.sourceId === '' ) {
						d.sourceId = 'Main';
					}
				}
				// remove excluded sources...
				if ( self.sourceExcludeCallback() && self.sourceExcludeCallback().call(parent.me, groupId, d.sourceId) ) {
					continue;
				}
				allData.push(d);
			}
		});

		layerData = d3.nest()
			.key(function(d) {
				// note we assume groupId has no pipe character in it
				return d[parent.internalPropName].groupId +'|' +d.sourceId;
			})
			.sortKeys(d3.ascending)
			.entries(allData);
		
		if ( layerData.length < 1 ) {
			return;
		}
		
		// fill in "holes" for each stack layer, if more than one layer. we assume data already sorted by date
		dummy = {};
		dummy[plotPropName] = null;
		sn.nestedStackDataNormalizeByDate(layerData, dummy, function(dummy, key) {
			var idx = key.indexOf('|');
			dummy[parent.internalPropName] = { groupId : key.slice(0, idx) };
			dummy.sourceId = key.slice(idx + 1);
		});
		
		if ( parent.me.layerPostProcessCallback() ) {
			layerData = parent.me.layerPostProcessCallback().call(parent.me, null, layerData);
		}
		
		rangeX = (allData.length > 0 ? [allData[0].date, allData[allData.length - 1].date] : undefined);
		layers = stack(layerData);
		parent.groupLayers['All'] = layers;
		rangeY = [0, d3.max(layers[layers.length - 1].values, function(d) { return d.y0 + d.y; })];
		
		// setup X domain
		if ( rangeX !== undefined ) {
			parent.x.domain(rangeX);
		}
		
		// setup Y domain
		if ( rangeY !== undefined ) {
			parent.y.domain(rangeY).nice();
		}
		
		parent.computeUnitsY();
	}
	
	function draw() {
		var transitionMs = parent.transitionMs();
		var layerData = parent.groupLayers['All'];
		var data = (layerData ? layerData.map(function(e) { return e.values; }) : []);
		
		var area = parent.svgDataRoot.selectAll('path.area').data(data, function(d) {
			return (d.length ? d[0][parent.internalPropName].groupId + '-' + d[0].sourceId : null);
		});
		
		area.transition().duration(transitionMs)
			.attr('d', areaPathGenerator)
			.style('fill', areaFillFn);

		area.enter().append('path')
				.attr('class', 'area')
				.style('fill', areaFillFn)
				.attr('d', areaPathGenerator)
				.style('opacity', 1e-6)
			.transition().duration(transitionMs)
				.style('opacity', 1);
		
		area.exit().transition().duration(transitionMs)
			.style('opacity', 1e-6)
			.remove();
			
		superDraw();
	};
	
	// override our setup funciton
	parent.setup = setup;
	
	// define our drawing function
	parent.draw = draw;
	
	return self;

	function foo() {
	
	// the d3 stack offset method, or function
	var stackOffset = undefined;

	var svgRoot = undefined,
		svg = undefined,
		svgTickGroupX = undefined;
	
	// our layer data, and generator function
	var layerGenerator = undefined;
	var layers = undefined;
	var minY = 0;

	function parseConfiguration() {
		self.aggregate(config.aggregate);
		self.plotProperties(config.plotProperties);
		transitionMs = (config.transitionMs || 600);
		vertRuleOpacity = (config.vertRuleOpacity || 0.05);
		stackOffset = (config.wiggle === true ? 'wiggle' : 'zero');
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

	svg = svgRoot.append("g")
		.attr('class', 'data')
		.attr("transform", "translate(" + p[3] + "," + p[0] + ")");
	
	svgTickGroupX = svgRoot.append("g")
		.attr("class", "ticks")
		.attr("transform", "translate(" + p[3] +"," +(h + p[0] + p[2]) +")");

	svgRoot.append("g")
		.attr("class", "crisp rule")
		.attr("transform", "translate(0," + p[0] + ")");

	function strokeColorFn(d, i) { return d3.rgb(sn.colorFn(d,i)).darker(); }

	function computeDomainX() {
		x.domain(layers.domainX);
	}

	function computeDomainY() {
		y.domain([minY, layers.maxY]).nice();
		computeUnitsY();
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

	function setup(rawData) {
		// turn filteredData object into proper array, sorted by date
		sources = [];
		var dataArray = sn.powerPerSourceArray(rawData, sources);
		sn.log('Available area sources: {0}', sources);

		// Transpose the data into watt layers by source, e.g.
		// [ [{x:0,y:0},{x:1,y:1}...], ... ]
		layerGenerator = sn.powerPerSourceStackedLayerGenerator(sources, plotProperties[aggregateType])
			.excludeSources(config.excludeSources)
			.offset(stackOffset)
			.data(dataArray);
		layers = layerGenerator();

		// Compute the x-domain (by date) and y-domain (by top).
		computeDomainX();
		computeDomainY();
	}

	function redraw() {	
		// draw data areas
		var area = svg.selectAll("path.area").data(layers);
		
		area.transition().duration(transitionMs).delay(200)
				.attr("d", areaPathGenerator)
				.style("fill", sn.colorFn);
		
		area.enter().append("path")
				.attr("class", "area")
				.style("fill", sn.colorFn)
				.attr("d", areaPathGenerator);
		
		area.exit().remove();
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
		var axisLines = svgRoot.select("g.rule").selectAll("g").data(
				self.wiggle() ? [] : y.ticks(5));
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
	
	self.sources = sources;
	
	/**
	 * Get the x-axis domain (minimum and maximum dates).
	 * 
	 * @return {number[]} an array with the minimum and maximum values used in the x-axis of the chart
	 * @memberOf sn.chart.powerAreaChart
	 */
	self.xDomain = function() { return x.domain(); };

	/**
	 * Get the y-axis domain (minimum and maximum values).
	 * 
	 * @return {number[]} an array with the minimum and maximum values used in the y-axis of the chart
	 * @memberOf sn.chart.powerAreaChart
	 */
	self.yDomain = function() { return y.domain(); };
	
	/**
	 * Get the scaling factor the y-axis is using. By default this will return {@code 1}.
	 * After calling the {@link #load()} method, however, the chart may decide to scale
	 * the y-axis for clarity. You can call this method to find out the scaling factor the
	 * chart ended up using.
	 *  
	 * @return the y-axis scale factor
	 * @memberOf sn.chart.powerAreaChart
	 */
	self.yScale = function() { return displayFactor; };

	/**
	 * Get the current {@code aggregate} value in use.
	 * 
	 * @param {number} [value] the number of consumption sources to use
	 * @returns when used as a getter, the count number, otherwise this object
	 * @returns the {@code aggregate} value
	 * @memberOf sn.chart.powerAreaChart
	 */
	self.aggregate = function(value) { 
		if ( !arguments.length ) return aggregateType;
		aggregateType = (value === 'Month' ? 'Month' : value === 'Day' ? 'Day' : value === 'Hour' ? 'Hour' : 'Minute');
		return self;
	};
	
	/**
	 * Load data for the chart. The data is expected to be in a form suitable for
	 * passing to {@link sn.powerPerSourceArray}.
	 * 
	 * @param {Array} rawData - the raw chart data to load
	 * @return this object
	 * @memberOf sn.chart.powerAreaChart
	 */
	self.load = function(rawData) {
		parseConfiguration();
		setup(rawData);
		adjustAxisX();
		adjustAxisY();
		redraw();
		return self;
	};
	
	/**
	 * Regenerate the chart, using the current data. This can be called after disabling a
	 * source 
	 * 
	 * @return this object
	 * @memberOf sn.chart.powerAreaChart
	 */
	self.regenerate = function() {
		if ( layerGenerator === undefined ) {
			// did you call load() first?
			return self;
		}
		parseConfiguration();
		layerGenerator.offset(self.stackOffset());
		layers = layerGenerator();
		computeDomainY();
		adjustAxisY();
		redraw();
		return self;
	};
	
	/**
	 * Get or set the animation transition time, in milliseconds.
	 * 
	 * @param {number} [value] the number of milliseconds to use
	 * @return when used as a getter, the millisecond value, otherwise this object
	 * @memberOf sn.chart.powerAreaChart
	 */
	self.transitionMs = function(value) {
		if ( !arguments.length ) return transitionMs;
		transitionMs = +value; // the + used to make sure we have a Number
		return self;
	};

	/**
	 * Get or set the d3 stack offset.
	 * 
	 * This can be any supported d3 stack offset, such as 'wiggle' or a custom function.
	 * 
	 * @param {string|function} [value] the stack offset to use
	 * @return when used as a getter, the stack offset value, otherwise this object
	 * @memberOf sn.chart.powerAreaChart
	 */
	self.stackOffset = function(value) {
		if ( !arguments.length ) return stackOffset;
		stackOffset = value;
		return self;
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
	 * @memberOf sn.chart.powerAreaChart
	 */
	self.wiggle = function(value) {
		if ( !arguments.length ) return (stackOffset === 'wiggle');
		return self.stackOffset(value === true ? 'wiggle' : 'zero');
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
	 * @memberOf sn.chart.powerAreaChart
	 */
	self.plotProperties = function(value) {
		if ( !arguments.length ) return plotProperties;
		var p = {};
		['Minute', 'Hour', 'Day', 'Month'].forEach(function(e) {
			p[e] = (value !== undefined && value[e] !== undefined ? value[e] : 'watts');
		});
		plotProperties = p;
		return self;
	};

	parseConfiguration();
	return self;
	};
};

}());
