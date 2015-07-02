/*global sn,d3 */
(function() {
'use strict';

if ( sn.chart === undefined ) {
	sn.chart = {};
}

/**
 * @typedef sn.chart.baseGroupedStackChart
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
 * An abstract class to support groups of stacked layer charts.
 * 
 * Extending classes should re-define the <code>me</code> property to themselves, so that
 * method chaining works correctly.
 * 
 * @class
 * @abstract
 * @param {string} containerSelector - the selector for the element to insert the chart into
 * @param {sn.chart.powerAreaOverlapChartParameters} [chartConfig] - the chart parameters
 * @returns {sn.chart.baseGroupedStackChart}
 */
sn.chart.baseGroupedStackChart = function(containerSelector, chartConfig) {
	var parent = sn.chart.baseGroupedChart(containerSelector, chartConfig),
		superReset = parent.reset,
		superParseConfiguration = parent.parseConfiguration,
		superYAxisTicks = parent.yAxisTicks;
	var self = sn.util.copyAll(parent);
	self.me = self;

	var discardId = '__discard__';

	// the d3 stack offset method, or function
	var stackOffset = undefined;
	
	// our computed layer data
	var groupLayers = {};
	
	// useful to change to true for line-based charts
	var normalizeDataTimeGaps = false;

	function parseConfiguration() {
		superParseConfiguration();
		stackOffset = (self.config.value('wiggle') === true ? 'wiggle' : 'zero');
	}
	
	// get the opacity level for a given group
	function groupOpacityFn(d, i) {
		var grade = (self.config.value('opacityReduction') || 0.1);
		return (1 - (i * grade));
	}
	
	function setup() {
		var plotPropName = self.plotPropertyName;
		var minX, maxX;
		var maxY;
		var stack = d3.layout.stack()
			.offset(stackOffset)
			.values(function(d) { 
				return d.values;
			})
			.x(function(d) { 
				return d.date; 
			})
			.y(function(d) { 
				var y = d[plotPropName],
					scale = parent.scaleFactor(d[parent.internalPropName].groupId);
				if ( y === undefined || y < 0 || y === null ) {
					y = 0;
				}
				return (y * scale);
			});
		groupLayers = {};
		self.groupIds.forEach(function(groupId) {
			var dummy,
				layerData,
				rawGroupData = self.data(groupId);
			if ( !rawGroupData || !rawGroupData.length > 1 ) {
				return;
			}
			
			layerData = d3.nest()
				.key(function(d) {
					if ( !d.hasOwnProperty(self.internalPropName) ) {
						d[self.internalPropName] = {groupId : groupId};
						if ( self.dataCallback() ) {
							self.dataCallback().call(self.me, groupId, d);
						} else if ( d.date === undefined ) {
							// automatically create Date
							d.date = sn.datum.datumDate(d);
						}
					}
					
					// remove excluded sources...
					if ( self.sourceExcludeCallback() ) {
						if ( self.sourceExcludeCallback().call(self.me, groupId, d.sourceId) ) {
							return discardId;
						}
					}
					
					return d.sourceId;
				})
				.sortKeys(d3.ascending)
				.entries(rawGroupData);
			
			// remove discarded sources...
			layerData = layerData.filter(function(d) {
				return (d.key !== discardId);
			});
			
			if ( layerData.length < 1 ) {
				return;
			}
			
			// fill in "holes" for each stack layer, if more than one layer. we assume data already sorted by date
			dummy = {};
			dummy[plotPropName] = null;
			dummy[self.internalPropName] = {groupId : groupId};
			sn.nestedStackDataNormalizeByDate(layerData, dummy);
			
			if ( normalizeDataTimeGaps === true ) {
				// now look to fill in "zero" values to make interpolation look better
				parent.insertNormalizedDurationIntoLayerData(layerData);
			}
			
			if ( self.layerPostProcessCallback() ) {
				layerData = self.layerPostProcessCallback().call(self.me, groupId, layerData);
			}
			
			var rangeX = [rawGroupData[0].date, rawGroupData[rawGroupData.length - 1].date];
			if ( minX === undefined || rangeX[0].getTime() < minX.getTime() ) {
				minX = rangeX[0];
			}
			if ( maxX === undefined || rangeX[1].getTime() > maxX.getTime() ) {
				maxX = rangeX[1];
			}
			var layers = stack(layerData);
			groupLayers[groupId] = layers;
			var rangeY = [0, d3.max(layers[layers.length - 1].values, function(d) { return d.y0 + d.y; })];
			if ( maxY === undefined || rangeY[1] > maxY ) {
				maxY = rangeY[1];
			}
		});
		
		// setup X domain
		if ( minX !== undefined && maxX !== undefined ) {
			self.x.domain([minX, maxX]);
		}
		
		// setup Y domain
		if ( maxY !== undefined ) {
			self.y.domain([0, maxY]).nice();
		}
		
		self.computeUnitsY();
	}
	
	function yAxisTicks() {
		return (self.wiggle() === true 
			? [] // no y-axis in wiggle mode
			: superYAxisTicks());
	}
	
	/**
	 * Clear out all data associated with this chart. Does not redraw.
	 * 
	 * @return this object
	 * @memberOf sn.chart.baseGroupedStackChart
	 */
	self.reset = function() {
		superReset();
		groupLayers = {};
		return self.me;
	};
	
	/**
	 * Get or set the d3 stack offset.
	 * 
	 * This can be any supported d3 stack offset, such as 'wiggle' or a custom function.
	 * 
	 * @param {string|function} [value] the stack offset to use
	 * @return when used as a getter, the stack offset value, otherwise this object
	 * @memberOf sn.chart.baseGroupedStackChart
	 */
	self.stackOffset = function(value) {
		if ( !arguments.length ) return stackOffset;
		stackOffset = value;
		return self.me;
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
	 * @memberOf sn.chart.baseGroupedStackChart
	 */
	self.wiggle = function(value) {
		if ( !arguments.length ) return (stackOffset === 'wiggle');
		return self.stackOffset(value === true ? 'wiggle' : 'zero');
	};
	
	/**
	 * Get or set the flag to normalize the data for time gaps.
	 * Defaults to <b>false</b>.
	 * 
	 * @param {function} [value] the flag value
	 * @return when used as a getter, the current flag value, otherwise this object
	 * @memberOf sn.chart.baseGroupedStackChart
	 */
	self.normalizeDataTimeGaps = function(value) {
		if ( !arguments.length ) return normalizeDataTimeGaps;
		normalizeDataTimeGaps = (value === true);
		return self.me;
	};

	Object.defineProperties(self, {
		groupOpacityFn : { value : groupOpacityFn },
		discardId : { value : discardId },
		groupLayers : { get : function() { return groupLayers; } }
	});
	parseConfiguration();
	
	// override config function
	self.parseConfiguration = parseConfiguration;
	
	// override our setup funciton
	self.setup = setup;

	// override yAxisTicks to support wiggle
	self.yAxisTicks = yAxisTicks;

	return self;
};

sn.chart.baseGroupedChart = function(containerSelector, chartConfig) {
	var self = {
		version : '1.0.0'
	};
	
	var me = self;
	
	var internalPropName = '__internal__';
	var aggregates = ['FiveMinute', 'TenMinute','FifteenMinute','Hour', 'HourOfDay', 'SeasonalHourOfDay', 
			'Day', 'DayOfWeek', 'SeasonalDayOfWeek', 'Month'];

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
	var aggregateType;
	
	// mapping of aggregateType keys to associated data property names, e.g. 'watts' or 'wattHours'
	var plotProperties;
	
	var transitionMs; // will default to 600
	var ruleOpacity; // will default to 0.1
	var vertRuleOpacity; // will default to 0.05
	
	// raw data, by groupId
	var originalData = {};
	
	// a numeric scale factor, by groupId
	var scaleFactors = {};

	var svgRoot,
		svgTickGroupX,
		svgDataRoot,
		svgRuleRoot,
		svgAnnotRoot,
		svgHoverRoot,
		svgPointerCapture;
	
	var dataCallback = undefined;
	var colorCallback = undefined; // function accepts (groupId, sourceId) and returns a color
	var sourceExcludeCallback = undefined; // function accepts (groupId, sourceId) and returns true to exclue group
	var displayFactorCallback = undefined; // function accepts (maxY) and should return the desired displayFactor
	var layerPostProcessCallback = undefined; // function accepts (groupId, result of d3.nest()) and should return same structure
	var drawAnnotationsCallback = undefined; // function accepts (svgAnnotRoot)
	var xAxisTickCallback = undefined; // function accepts (d, i, x, numTicks)

	var hoverEnterCallback = undefined,
		hoverMoveCallback = undefined,
		hoverLeaveCallback = undefined,
		doubleClickCallback = undefined;
	
	// our computed layer data
	var groupIds = [];
	var otherData = {};

	// display units in kW if domain range > 1000
	var displayFactor = 1;
	var displayFormatter = d3.format(',d');

	var xAxisTickCount = 12;
	var yAxisTickCount = 5;
	
	var draw = function() {	
		// extending classes should do something here...
		drawAxisX();
		drawAxisY();
	};

	var handleHoverEnter = function() {
		if ( !hoverEnterCallback ) {
			return;
		}
        hoverEnterCallback.call(me, svgHoverRoot, d3.mouse(this));
	};
	
	var handleHoverMove = function() {
		if ( !hoverMoveCallback ) {
			return;
		}
        hoverMoveCallback.call(me, svgHoverRoot, d3.mouse(this));
	};
	
	var handleHoverLeave = function() {
		if ( !hoverLeaveCallback ) {
			return;
		}
        hoverLeaveCallback.call(me, svgHoverRoot, d3.mouse(this));
	};
	
	var handleDoubleClick = function() {
		if ( !doubleClickCallback ) {
			return;
		}
        doubleClickCallback.call(me, svgHoverRoot, d3.mouse(this));
	};
	
	function parseConfiguration() {
		self.aggregate(config.aggregate);
		self.plotProperties(config.value('plotProperties'));
		transitionMs = (config.value('transitionMs') || 600);
		ruleOpacity = (config.value('ruleOpacity') || 0.1);
		vertRuleOpacity = (config.value('vertRuleOpacity') || 0.05);
	}
	
	svgRoot = d3.select(containerSelector).select('svg');
	if ( svgRoot.empty() ) {
		svgRoot = d3.select(containerSelector).append('svg:svg');
	}
	svgRoot.attr('class', 'chart')
		.attr('width', w + p[1] + p[3])
		.attr('height', h + p[0] + p[2])
		.selectAll('*').remove();
	
	svgDataRoot = svgRoot.append('g')
		.attr('class', 'data-root')
		.attr('transform', 'translate(' + p[3] +',' +p[0] +')');
		
	svgTickGroupX = svgRoot.append('g')
		.attr('class', 'ticks')
		.attr('transform', 'translate(' + p[3] +',' +(h + p[0] + p[2]) +')');

	svgRoot.append('g')
		.attr('class', 'crisp rule')
		.attr('transform', 'translate(0,' + p[0] + ')');

	svgRuleRoot = svgRoot.append('g')
		.attr('class', 'rule')
		.attr('transform', 'translate(' + p[3] +',' +p[0] +')');
		
	svgAnnotRoot = svgRoot.append('g')
		.attr('class', 'annot-root')
		.attr('transform', 'translate(' + p[3] +',' +p[0] +')');

	function computeUnitsY() {
		var fmt;
		var maxY = d3.max(y.domain(), function(v) { return Math.abs(v); });
		displayFactor = 1;
		
		if ( displayFactorCallback ) {
			displayFactor = displayFactorCallback.call(me, maxY);
		} else if ( maxY >= 1000000000 ) {
			displayFactor = 1000000000;
		} else if ( maxY >= 1000000 ) {
			displayFactor = 1000000;
		} else if ( maxY >= 1000 ) {
			displayFactor = 1000;
		}

		if ( displayFactor === 1 ) {
			fmt = ',d';
		} else {
			fmt = ',g';
		}
		
		displayFormatter = d3.format(fmt);
	}
	
	function displayFormat(d) {
		return displayFormatter(d / displayFactor);
	}
	
	function plotPropertyName() {
		return plotProperties[aggregateType];
	}

	function setup() {
		// extending classes should do something here...
				
		computeUnitsY();
	}
	
	function fillColor(groupId, d, i) {
		if ( colorCallback === undefined ) {
			return 'black';
		}
		return colorCallback(groupId, d.sourceId, i);
	}

	function axisYTransform(d) {
		// align to half-pixels, to 1px line is aligned to pixels and crisp
		return "translate(0," + (Math.round(y(d) + 0.5) - 0.5) + ")"; 
	}

	function axisRuleClassY(d) {
		return (d === 0 ? 'origin' : 'm');
	}

	function axisTextClassY(d) {
		return (d === 0 ? 'origin' : null);
	}

	function axisXTickClassMajor(d) {
		return (aggregateType.indexOf('Minute') >= 0 && d.getUTCHours() === 0)
			|| (aggregateType === 'Hour' && d.getUTCHours() === 0)
			|| (aggregateType === 'Day' && d.getUTCDate() === 1)
			|| (aggregateType === 'Month' && d.getUTCMonth() === 0);
	}
	
	function xAxisTicks() {
		return x.ticks(xAxisTickCount);
	}
	
	function xAxisTickFormatter() {
		var fxDefault = x.tickFormat(xAxisTickCount);
		return function(d, i) {
			if ( xAxisTickCallback ) {
				return xAxisTickCallback.call(me, d, i, x, fxDefault);
			} else {
				return fxDefault(d, i);
			}
		};
	}

	function drawAxisX() {
		if ( d3.event && d3.event.transform ) {
			d3.event.transform(x);
		}
		var ticks = xAxisTicks();
		var fx = xAxisTickFormatter();

		// Generate x-ticks
		var labels = svgTickGroupX.selectAll('text').data(ticks)
				.classed({
						major : axisXTickClassMajor
					});
		
		labels.transition().duration(transitionMs)
				.attr('x', x)
				.text(fx);
		
		labels.enter().append('text')
				.attr('dy', '-0.5em') // needed so descenders not cut off
				.style('opacity', 1e-6)
				.attr('x', x)
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
	
	function yAxisTicks() {
		return y.ticks(yAxisTickCount);
	}
	
	function drawAxisY() {
		var yTicks = yAxisTicks();
		var axisLines = svgRoot.select('g.rule').selectAll('g').data(yTicks, Object);
		var axisLinesT = axisLines.transition().duration(transitionMs);
		
		axisLinesT.attr('transform', axisYTransform).select('text')
				.text(displayFormat)
				.attr('class', axisTextClassY);
		axisLinesT.select('line')
				.attr('class', axisRuleClassY);
		
	  	axisLines.exit().transition().duration(transitionMs)
	  			.style('opacity', 1e-6)
	  			.remove();
	  			
		var entered = axisLines.enter()
				.append('g')
				.style('opacity', 1e-6)
	  			.attr('transform', axisYTransform);
		entered.append('line')
				.attr('x2', w + p[3])
				.attr('x1', p[3])
				.attr('class', axisRuleClassY);
		entered.append('text')
				.attr('x', p[3] - 10)
				.text(displayFormat)
				.attr('class', axisTextClassY);
		entered.transition().duration(transitionMs)
				.style('opacity', 1)
				.each('end', function() {
					// remove the opacity style
					d3.select(this).style('opacity', null);
				});
	}

	/**
	 * Scale a date for the x-axis.
	 * 
	 * @param {Date} the Date to scale
	 * @return {Number} the scaled value
	 * @memberOf sn.chart.baseGroupedChart
	 */
	self.scaleDate = function(date) { return x(date); };

	/**
	 * Scale a value for the y-axis.
	 * 
	 * @param {Number} the value to scale
	 * @return {Number} the scaled value
	 * @memberOf sn.chart.baseGroupedChart
	 */
	self.scaleValue = function(value) { return y(value); };
	
	/**
	 * Get the x-axis domain (minimum and maximum dates).
	 * 
	 * @return {number[]} an array with the minimum and maximum values used in the x-axis of the chart
	 * @memberOf sn.chart.baseGroupedChart
	 */
	self.xDomain = function() { return x.domain(); };

	/**
	 * Get the y-axis domain (minimum and maximum values).
	 * 
	 * @return {number[]} an array with the minimum and maximum values used in the y-axis of the chart
	 * @memberOf sn.chart.baseGroupedChart
	 */
	self.yDomain = function() { return y.domain(); };
	
	/**
	 * Get the scaling factor the y-axis is using. By default this will return {@code 1}.
	 * After calling the {@link #load()} method, however, the chart may decide to scale
	 * the y-axis for clarity. You can call this method to find out the scaling factor the
	 * chart ended up using.
	 *  
	 * @return the y-axis scale factor
	 * @memberOf sn.chart.baseGroupedChart
	 */
	self.yScale = function() { return (displayFactorCallback ? displayFactorCallback() : displayFactor); };

	/**
	 * Get the current {@code aggregate} value in use.
	 * 
	 * @param {number} [value] the number of consumption sources to use
	 * @returns when used as a getter, the count number, otherwise this object
	 * @returns the {@code aggregate} value
	 * @memberOf sn.chart.baseGroupedChart
	 */
	self.aggregate = function(value) { 
		if ( !arguments.length ) return aggregateType;
		var idx = aggregates.indexOf(value);
		aggregateType = (idx < 0 ? 'Hour' : value);
		return me;
	};
	
	/**
	 * Get the expected normalized duration, in milliseconds, based on the configured aggregate level.
	 * 
	 * @returns The expected normalized millisecond duration for the configured aggregate level.
	 * @memberOf sn.chart.baseGroupedChart
	 */
	self.aggregateNormalizedDuration = function() {
		if ( aggregateType === 'FiveMinute' ) {
			return (1000 * 60 * 5);
		}
		if ( aggregateType === 'TenMinute' ) {
			return (1000 * 60 * 10);
		}
		if ( aggregateType === 'FifteenMinute' ) {
			return (1000 * 60 * 15);
		}
		if ( aggregateType === 'Hour' || aggregateType === 'HourOfDay' || aggregateType === 'SeasonalHourOfDay' ) {
			return (1000 * 60 * 60);
		}
		if ( aggregateType === 'Day' || aggregateType === 'DayOfWeek' || aggregateType === 'SeasonalDayOfWeek' ) {
			return (1000 * 60 * 60 * 24);
		}
		if ( aggregateType === 'Month' ) {
			return (1000 * 60 * 60 * 24 * 30); // NOTE: this is approximate!
		}
		return (1000 * 60); // otherwise, default to minute duration
	};
	
	/**
	 * Test if two dates are the expected aggregate normalized duration apart.
	 *
	 * @returns True if the two dates are exactly one normalized aggregate duration apart.
	 * @memberOf sn.chart.baseGroupedChart
	 */
	self.isNormalizedDuration = function(d1, d2) {
		var diff, 
			expectedDiff = self.aggregateNormalizedDuration(),
			v1,
			v2;
		if ( !(d1 && d2) ) {
			return false;
		}
		diff = Math.abs(d2.getTime() - d1.getTime());
		if ( diff === expectedDiff ) {
			return true;
		}
		
		// make sure d1 < d2
		if ( d2.getTime() < d1.getTime() ) {
				v1 = d1;
				d1 = d2;
				d2 = v1;
		}
		
		if ( aggregateType === 'Month' ) {
			// test if months are only 1 apart
			return (d3.time.month.utc.offset(d1, 1).getTime() === d2.getTime());
		}
		
		if ( aggregateType === 'SeasonalHourOfDay' ) {
			// test just if hour only 1 apart
			v1 = d1.getUTCHours() + 1;
			if ( v1 > 23 ) {
				v1 = 0;
			}
			return (d2.getUTCHours() === v1 && d1.getTime() !== d2.getTime());
		}
		
		if ( aggregateType === 'SeasonalDayOfWeek' ) {
			// test just if DOW only 1 apart
			v1 = d1.getUTCDay() + 1;
			if ( v1 > 6 ) {
				v1 = 0;
			}
			return (d2.getUTCDay() === v1 && d1.getTime() !== d2.getTime());
		}
		
		return false;
	};
	
	/**
	 * Add an aggregate normalized time duration to a given date.
	 *
	 * @param date The date to add to.
	 * @returns A new Date object.
	 * @memberOf sn.chart.baseGroupedChart
	 */
	self.addNormalizedDuration = function(date) {
		if ( !date ) {
			return undefined;
		}
		if ( aggregateType === 'Month' ) {
			return d3.time.month.utc.offset(date, 1);
		}
		return new Date(date.getTime() + self.aggregateNormalizedDuration());
	};
	
	/**
	 * Insert aggregate time normalized elements into all layer data arrays.
	 * The <code>layerData</code> object must be an array of objects, each object
	 * having a <code>values</code> array of data objects. This method will
	 * clone data objects and insert them into the <code>values</code> array in-place,
	 * in order to create a time-normalized series of elements.
	 * 
	 * @param layerData The array of layer (data group) objects.
	 * @memberOf sn.chart.baseGroupedChart
	 */
	function insertNormalizedDurationIntoLayerData(layerData) {
		var i, j, row, datum, plotPropName = plotPropertyName();
		for ( j = 0; j < layerData.length; j += 1 ) {
			row = layerData[j].values;
			for ( i = 0; i < row.length - 1; i += 1 ) {
				if ( self.isNormalizedDuration(row[i].date, row[i+1].date) !== true ) {
					datum = sn.util.copy(row[i]);
					datum.date = self.addNormalizedDuration(datum.date);
					datum[plotPropName] = null;
					row.splice(i + 1, 0, datum);
				}
			}
		}
	}
	
	/**
	 * Clear out all data associated with this chart. Does not redraw. If 
	 * {@link hoverLeaveCallback} is defined, it will be called with no arguments.
	 * 
	 * @return this object
	 * @memberOf sn.chart.baseGroupedChart
	 */
	self.reset = function() {
		originalData = {};
		groupIds = [];
		otherData = {};
		if ( svgHoverRoot ) {
			handleHoverLeave();
		}
		return me;
	};
	
	/**
	 * Add data for a single group in the chart. The data is appended if data has 
	 * already been loaded for the given groupId. This does not redraw the chart. 
	 * Once all groups have been loaded, call {@link #regenerate()} to redraw.
	 * 
	 * @param {Array} rawData - the raw chart data to load
	 * @param {String} groupId - the ID to associate with the data; each stack group must have its own ID
	 * @returns this object
	 * @memberOf sn.chart.baseGroupedChart
	 */
	self.load = function(rawData, groupId) {
		if ( originalData[groupId] === undefined ) {
			groupIds.push(groupId);
			originalData[groupId] = rawData;
		} else {
			originalData[groupId] = originalData[groupId].concat(rawData);
		}
		return me;
	};
	
	/**
	 * Get the data for a specific group ID previously loaded via {@link #load()}.
	 *
	 * @param {String} groupId - the group ID of the data to get
	 * @returns the data, or <code>undefined</code>
	 * @memberOf sn.chart.baseGroupedChart
	 */
	self.data = function(groupId) {
		return originalData[groupId];
	};
	
	/**
	 * Stash data for a single group in the chart. The data is appended if data has 
	 * already been stashed for the given groupId. This data is auxiliary data that clients
	 * may want to associate with the chart and draw later, for example via the 
	 * {@link #drawAnnotationsCallback()} function.
	 * 
	 * @param {Array} rawData - the raw chart data to stash
	 * @param {String} groupId - the group ID to associate with the data
	 * @param {Boolean} replace - If <em>true</em> then do not append to existing data, replace it instead.
	 * @returns this object
	 * @memberOf sn.chart.baseGroupedChart
	 */
	self.stash = function(rawData, groupId, replace) {
		if ( otherData[groupId] === undefined || replace === true ) {
			otherData[groupId] = rawData;
		} else {
			otherData[groupId] = otherData[groupId].concat(rawData);
		}
		return me;
	};
	
	/**
	 * Get the data for a specific group ID previously stashed via {@link #stash()}.
	 *
	 * @param {String} groupId - the group ID of the data to get
	 * @returns the data, or <code>undefined</code>
	 * @memberOf sn.chart.baseGroupedChart
	 */
	self.stashedData = function(groupId) {
		return otherData[groupId];
	};
	
	/**
	 * Regenerate the chart, using the current data. This can be called after disabling a
	 * source 
	 * 
	 * @returns this object
	 * @memberOf sn.chart.baseGroupedChart
	 */
	self.regenerate = function() {
		if ( originalData === undefined ) {
			// did you call load() first?
			return me;
		}
		parseConfiguration();
		self.setup();
		self.draw();
		if ( drawAnnotationsCallback ) {
			drawAnnotationsCallback.call(me, svgAnnotRoot);
		}
		return me;
	};
	
	/**
	 * Get or set the scale factor for specific group IDs. If called without any arguments,
	 * all configured scale factors will be returned as an object, with group IDs as property
	 * names with corresponding scale factor values. If called with a single Object argument
	 * then set all scale factors using group IDs as object property names with corresponding 
	 * number values for the scale factor.
	 *
	 * @param {String} groupId - The group ID of the scale factor to set.
	 * @param {Number} value - The scale factor to set.
	 * @returns If called without any arguments, all configured scale factors as an object.
	 *          If called with a single String <code>groupId</code> argument, the scale factor for the given group ID,
	 *          or <code>1</code> if not defined.
	 *          If called with a single Object <code>groupId</code> argument, set
	 *          Otherwise, this object.
	 */
	self.scaleFactor = function(groupId, value) {
		var v;
		if ( !arguments.length ) return scaleFactors;
		if ( arguments.length === 1 ) {
			if ( typeof groupId === 'string' ) {
				v = scaleFactors[groupId];
				return (v === undefined ? 1 : v);
			}
			
			// for a single Object argument, reset all scaleFactors
			scaleFactors = groupId;
		} else if ( arguments.length == 2 ) {
			scaleFactors[groupId] = value;
		}
		return me;
	};
	
	/**
	 * Get or set the animation transition time, in milliseconds.
	 * 
	 * @param {number} [value] the number of milliseconds to use
	 * @return when used as a getter, the millisecond value, otherwise this object
	 * @memberOf sn.chart.baseGroupedChart
	 */
	self.transitionMs = function(value) {
		if ( !arguments.length ) return transitionMs;
		transitionMs = +value; // the + used to make sure we have a Number
		return me;
	};

	/**
	 * Get or set the plot property names for all supported aggregate levels.
	 * 
	 * When used as a setter, an Object with properties of the following names are supported:
	 * 
	 * <ul>
	 *   <li>FiveMinute</li>
	 *   <li>TenMinute</li>
	 *   <li>FifteenMinute</li>
	 *   <li>Hour</li>
	 *   <li>HourOfDay</li>
	 *   <li>SeasonalHourOfDay</li>
	 *   <li>Day</li>
	 *   <li>DayOfWeek</li>
	 *   <li>SeasonalDayOfWeek</li>
	 *   <li>Month</li>
	 * </ul>
	 * 
	 * Each value should be the string name of the datum property to plot on the y-axis of the chart.
	 * If an aggregate level is not defined, it will default to {@code watts}.
	 * 
	 * @param {object} [value] the aggregate property names to use
	 * @return when used as a getter, the current plot property value mapping object, otherwise this object
	 * @memberOf sn.chart.baseGroupedChart
	 */
	self.plotProperties = function(value) {
		if ( !arguments.length ) return plotProperties;
		var p = {};
		aggregates.forEach(function(e) {
			p[e] = (value !== undefined && value[e] !== undefined ? value[e] : 'watts');
		});
		plotProperties = p;
		return me;
	};

	/**
	 * Get or set the data callback function. This function will be called as the
	 * chart iterates over the raw input data as it performs grouping and normalization
	 * operations. The callback will be passed the group ID and the data as arguments.
	 * 
	 * @param {function} [value] the data callback
	 * @return when used as a getter, the current data callback function, otherwise this object
	 * @memberOf sn.chart.baseGroupedChart
	 */
	self.dataCallback = function(value) {
		if ( !arguments.length ) return dataCallback;
		if ( typeof value === 'function' ) {
			dataCallback = value;
		} else {
			dataCallback = undefined;
		}
		return me;
	};

	/**
	 * Get or set the color callback function. The callback will be passed the group ID 
	 * and a source ID as arguments.
	 * 
	 * @param {function} [value] the color callback
	 * @return when used as a getter, the current color callback function, otherwise this object
	 * @memberOf sn.chart.baseGroupedChart
	 */
	self.colorCallback = function(value) {
		if ( !arguments.length ) return colorCallback;
		if ( typeof value === 'function' ) {
			colorCallback = value;
		} else {
			colorCallback = undefined;
		}
		return me;
	};
	
	/**
	 * Get or set the source exclude callback function. The callback will be passed the group ID 
	 * and a source ID as arguments. It should true <em>true</em> if the data set for the given
	 * group ID and source ID should be excluded from the chart.
	 * 
	 * @param {function} [value] the source exclude callback
	 * @return when used as a getter, the current source exclude callback function, otherwise this object
	 * @memberOf sn.chart.baseGroupedChart
	 */
	self.sourceExcludeCallback = function(value) {
		if ( !arguments.length ) return sourceExcludeCallback;
		if ( typeof value === 'function' ) {
			sourceExcludeCallback = value;
		} else {
			sourceExcludeCallback = undefined;
		}
		return me;
	};

	/**
	 * Get or set the display factor callback function. The callback will be passed the absolute maximum 
	 * Y domain value as an argument. It should return a number representing the scale factor to use
	 * in Y-axis labels.
	 * 
	 * @param {function} [value] the display factor exclude callback
	 * @return when used as a getter, the current display factor callback function, otherwise this object
	 * @memberOf sn.chart.baseGroupedChart
	 */
	self.displayFactorCallback = function(value) {
		if ( !arguments.length ) return displayFactorCallback;
		if ( typeof value === 'function' ) {
			displayFactorCallback = value;
		} else {
			displayFactorCallback = undefined;
		}
		return me;
	};

	/**
	 * Get or set the layer post-process callback function. The callback will be passed a 
	 * group ID and that group's result of the d3.nest() operator, after all layer data 
	 * arrays have been normalized to contain the same number of elements. 
	 * 
	 * @param {function} [value] the layer post-process callback
	 * @return when used as a getter, the current layer post-process callback function, otherwise this object
	 * @memberOf sn.chart.baseGroupedChart
	 */
	self.layerPostProcessCallback = function(value) {
		if ( !arguments.length ) return layerPostProcessCallback;
		if ( typeof value === 'function' ) {
			layerPostProcessCallback = value;
		} else {
			layerPostProcessCallback = undefined;
		}
		return me;
	};

	/**
	 * Get or set the draw annotations callback function, which is called after the chart completes drawing.
	 * The function will be passed a SVG <code>&lt;g class="annot-root"&gt;</code> element that
	 * represents the drawing area for the chart data.
	 * 
	 * @param {function} [value] the draw callback
	 * @return when used as a getter, the current draw callback function, otherwise this object
	 * @memberOf sn.chart.baseGroupedChart
	 */
	self.drawAnnotationsCallback = function(value) {
		if ( !arguments.length ) return drawAnnotationsCallback;
		if ( typeof value === 'function' ) {
			drawAnnotationsCallback = value;
		} else {
			drawAnnotationsCallback = undefined;
		}
		return me;
	};
	
	function getOrCreateHoverRoot() {
		if ( !svgHoverRoot ) {
			svgHoverRoot = svgRoot.append('g')
				.attr('class', 'hover-root')
				.attr('transform', 'translate(' + p[3] +',' +p[0] +')');
			svgPointerCapture = svgRoot.append('rect')
				.attr('width', w)
				.attr('height', h)
				.attr('fill', 'none')
				.attr('pointer-events', 'all')
				.attr('class', 'pointer-capture')
				.attr('transform', 'translate(' + p[3] +',' +p[0] +')');
		}
		return svgPointerCapture;
	}
	
	/**
	 * Get or set a mouseover callback function, which is called in response to mouse entering
	 * the data area of the chart.
	 * 
	 * @param {function} [value] the mouse enter callback
	 * @return when used as a getter, the current mouse enter callback function, otherwise this object
	 * @memberOf sn.chart.baseGroupedChart
	 */
	self.hoverEnterCallback = function(value) {
		if ( !arguments.length ) return hoverEnterCallback;
		var root = getOrCreateHoverRoot();
		if ( typeof value === 'function' ) {
			hoverEnterCallback = value;
			root.on('mouseover', handleHoverEnter);
		} else {
			hoverEnterCallback = undefined;
			root.on('mouseover', null);
		}
		return me;
	};
	
	/**
	 * Get or set a mousemove callback function, which is called in response to mouse movement
	 * over the data area of the chart.
	 * 
	 * @param {function} [value] the hover callback
	 * @return when used as a getter, the current hover callback function, otherwise this object
	 * @memberOf sn.chart.baseGroupedChart
	 */
	self.hoverMoveCallback = function(value) {
		if ( !arguments.length ) return hoverMoveCallback;
		var root = getOrCreateHoverRoot();
		if ( typeof value === 'function' ) {
			getOrCreateHoverRoot();
			hoverMoveCallback = value;
			root.on('mousemove', handleHoverMove);
		} else {
			hoverMoveCallback = undefined;
			root.on('mousemove', null);
		}
		return me;
	};
	
	/**
	 * Get or set a mouseout callback function, which is called in response to mouse leaving
	 * the data area of the chart.
	 * 
	 * @param {function} [value] the mouse enter callback
	 * @return when used as a getter, the current mouse leave callback function, otherwise this object
	 * @memberOf sn.chart.baseGroupedChart
	 */
	self.hoverLeaveCallback = function(value) {
		if ( !arguments.length ) return hoverLeaveCallback;
		var root = getOrCreateHoverRoot();
		if ( typeof value === 'function' ) {
			hoverLeaveCallback = value;
			root.on('mouseout', handleHoverLeave);
		} else {
			hoverLeaveCallback = undefined;
			root.on('mouseout', null);
		}
		return me;
	};
	
	/**
	 * Get or set a dblclick callback function, which is called in response to mouse double click
	 * events on the data area of the chart.
	 * 
	 * @param {function} [value] the double click callback
	 * @return when used as a getter, the current double click callback function, otherwise this object
	 * @memberOf sn.chart.baseGroupedChart
	 */
	self.doubleClickCallback = function(value) {
		if ( !arguments.length ) return doubleClickCallback;
		var root = getOrCreateHoverRoot();
		if ( typeof value === 'function' ) {
			doubleClickCallback = value;
			root.on('dblclick', handleDoubleClick);
		} else {
			doubleClickCallback = undefined;
			root.on('dblclick', null);
		}
		return me;
	};
	
	/**
	 * Get or set the x-axis tick callback function, which is called during x-axis rendering.
	 * The function will be passed a data object, the index, the d3 scale, and the number of 
	 * ticks requested. The <code>this</code> object will be set to the chart instance.
	 * 
	 * @param {function} [value] the draw callback
	 * @return when used as a getter, the current x-axis tick callback function, otherwise this object
	 * @memberOf sn.chart.baseGroupedChart
	 */
	self.xAxisTickCallback = function(value) {
		if ( !arguments.length ) return xAxisTickCallback;
		if ( typeof value === 'function' ) {
			xAxisTickCallback = value;
		}
		return me;
	};

	/**
	 * Get or set the axis rule opacity value, which is used during axis rendering.
	 * Defaults to <b>0.1</b>.
	 * 
	 * @param {function} [value] the opacity value
	 * @return when used as a getter, the current axis rule opacity value, otherwise this object
	 * @memberOf sn.chart.baseGroupedChart
	 */
	self.ruleOpacity = function(value) {
		if ( !arguments.length ) return ruleOpacity;
		ruleOpacity = value;
		return me;
	};

	/**
	 * Get or set the vertical axis rule opacity value, which is used during axis rendering.
	 * Defaults to <b>0.05</b>.
	 * 
	 * @param {function} [value] the opacity value
	 * @return when used as a getter, the current vertical axis rule opacity value, otherwise this object
	 * @memberOf sn.chart.baseGroupedChart
	 */
	self.vertRuleOpacity = function(value) {
		if ( !arguments.length ) return vertRuleOpacity;
		vertRuleOpacity = value;
		return me;
	};

	Object.defineProperties(self, {
		// extending classes should re-define this property so method chaining works
		me : { get : function() { return me; }, set : function(obj) { me = obj; } },
		x : { get : function() { return x; }, set : function(v) { x = v; } },
		y : { get : function() { return y; }, set : function(v) { y = v; } },
		xAxisTickCount : { get : function() { return xAxisTickCount; }, set : function(v) { xAxisTickCount = v; } },
		xAxisTicks : { get : function() { return xAxisTicks; }, set : function(v) { xAxisTicks = v; } },
		xAxisTickFormatter : { get : function() { return xAxisTickFormatter; }, set : function(v) { xAxisTickFormatter = v; } },
		yAxisTicks : { get : function() { return yAxisTicks; }, set : function(v) { yAxisTicks = v; } },
		yAxisTickCount : { get : function() { return yAxisTickCount; }, set : function(v) { yAxisTickCount = v; } },
		config : { value : config },
		fillColor : { value : fillColor },
		insertNormalizedDurationIntoLayerData : { value : insertNormalizedDurationIntoLayerData },
		internalPropName : { value : internalPropName },
		plotPropertyName : { get : plotPropertyName },
		padding : { value : p },
		width : { value : w, enumerable : true },
		height : { value : h, enumerable : true },
		svgRoot : { value : svgRoot },
		svgDataRoot : { value : svgDataRoot },
		svgRuleRoot : { value : svgRuleRoot },
		svgTickGroupX : { value : svgTickGroupX },
		
		// interactive support
		svgHoverRoot : { get : function() { return svgHoverRoot; } },
		handleHoverEnter : { get : function() { return handleHoverEnter; }, set : function(v) { handleHoverEnter = v; } },
		handleHoverMove : { get : function() { return handleHoverMove; }, set : function(v) { handleHoverMove = v; } },
		handleHoverLeave : { get : function() { return handleHoverLeave; }, set : function(v) { handleHoverLeave = v; } },
		handleDoubleClick : { get : function() { return handleDoubleClick; }, set : function(v) { handleDoubleClick = v; } },

		groupIds : { get : function() { return groupIds; } },
		computeUnitsY : { value : computeUnitsY },
		drawAxisX : { get : function() { return drawAxisX; }, set : function(v) { drawAxisX = v; } },
		drawAxisY : { get : function() { return drawAxisY; }, set : function(v) { drawAxisY = v; } },
		parseConfiguration : { get : function() { return parseConfiguration; }, set : function(v) { parseConfiguration = v; } },
		draw : { get : function() { return draw; }, set : function(v) { draw = v; } },
		setup : { get : function() { return setup; }, set : function(v) { setup = v; } }
	});
	parseConfiguration();
	return self;
};

}());
