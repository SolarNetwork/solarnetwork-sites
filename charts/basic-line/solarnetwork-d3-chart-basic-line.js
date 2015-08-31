/**
 * @require d3 3.0
 * @require solarnetwork-d3 0.2.0
 * @require colorbrewer
 */
(function() {
'use strict';

if ( sn.chart === undefined ) {
	sn.chart = {};
}

/**
 * @typedef sn.chart.basicLineChartParameters
 * @type {sn.Configuration}
 * @property {number} [width=812] - desired width, in pixels, of the chart
 * @property {number} [height=300] - desired height, in pixels, of the chart
 * @property {number[]} [padding=[30, 0, 30, 30]] - padding to inset the chart by, in top, right, bottom, left order
 * @property {number} [transitionMs=600] - transition time
 * @property {number} [ruleOpacity] - the maximum opacity to render rules at, during transitions
 * @property {number} [vertRuleOpacity] - the maximum opacity to render rules at, during transitions
 * @property {sn.Configuration} excludeSources - the sources to exclude from the chart
 */

/**
 * A basic line chart without groupings.
 * 
 * @class
 * @param {string} containerSelector - the selector for the element to insert the chart into
 * @param {sn.chart.basicLineChartParameters} [chartConfig] - the chart parameters
 * @returns {sn.chart.seasonalDayOfWeekLineChart}
 */
sn.chart.basicLineChart = function(containerSelector, chartConfig) {
	var parent = sn.chart.baseTimeChart(containerSelector, chartConfig),
		superDraw = sn.superMethod.call(parent, 'draw');
	var self = (function() {
		var	me = sn.util.copy(parent);
		Object.defineProperty(me, 'version', {value : '1.0.0', enumerable : true, configurable : true});
		return me;
	}());
	parent.me = self;
	
	// properties
	var sourceExcludeCallback;
	
	var originalData = {}, // line ID -> raw data array
		lineIds = [], // ordered array of line IDs
		linePlotProperties = {}, // line ID -> plot property name
		lineDrawData = [];
		
	var linePathGenerator = d3.svg.line()
		.interpolate('monotone')
		.x(function(d) {
			return (Math.round(parent.x(d.date) + 0.5) - 0.5);
		})
		.y(function(d, i, foo) {
			var lineId = this.getAttribute('class'),
				plotProp = (linePlotProperties[lineId] ? linePlotProperties[lineId] : parent.plotPropertyName),
				val = d[plotProp];
			return (Math.round(parent.y(val === undefined ? null : val) + 0.5) - 0.5);
		});

	var colors = d3.scale.ordinal()
		.range(colorbrewer.Set3[12]);

	/**
	 * Add data for a single line in the chart. The data is appended if data has 
	 * already been loaded for the given line ID. This does not redraw the chart. 
	 * Once all line data has been loaded, call {@link #regenerate()} to draw.
	 * 
	 * @param {Array} rawData - The raw chart data to load.
	 * @param {String} lineId - The ID to associate with the data; each line must have its own ID
	 * @param {String} plotProperty - A property of the raw data to plot for the line. If not specified,
	 *                                the chart-wide plot property for the configured aggregate level will
	 *                                be used.
	 * @returns this object
	 * @memberOf sn.chart.basicLineChart
	 */
	self.load = function(rawData, lineId, plotProperty) {
		if ( originalData[lineId] === undefined ) {
			lineIds.push(lineId);
			originalData[lineId] = rawData;
		} else {
			originalData[lineId] = originalData[lineId].concat(rawData);
		}
		if ( plotProperty ) {
			linePlotProperties[lineId] = plotProperty;
		} else if ( linePlotProperties[lineId] ) {
			delete linePlotProperties[lineId];
		}
		return self;
	};
	
	/**
	 * Get or set the source exclude callback function. The callback will be passed the line ID 
	 * as an argument. It should true <em>true</em> if the data set for the given argument
	 * should be excluded from the chart.
	 * 
	 * @param {function} [value] the source exclude callback
	 * @return when used as a getter, the current source exclude callback function, otherwise this object
	 * @memberOf sn.chart.basicLineChart
	 */
	self.sourceExcludeCallback = function(value) {
		if ( !arguments.length ) return sourceExcludeCallback;
		if ( typeof value === 'function' ) {
			sourceExcludeCallback = value;
		} else {
			sourceExcludeCallback = undefined;
		}
		return self;
	};

	/**
	 * Get or set a range of colors to display. The order of the the data passed to the {@link load()}
	 * function will determine the color used from the configured {@code colorArray}.
	 * 
	 * @param {Array} colorArray An array of valid SVG color values to set.
	 * @return when used as a getter, the current color array, otherwise this object
	 * @memberOf sn.chart.basicLineChart
	 */
	self.colors = function(colorArray) {
		if ( !arguments.length ) return colors.range();
		colors.range(colorArray);
		return self;
	};
	
	/**
	 * Get the d3 ordinal color scale.
	 *
	 * @return {Object} A D3 ordinal scale of color values.
	 * @memberOf sn.chart.basicLineChart
	 */
	self.colorScale = function() {
		return colors;
	};
	
	self.data = function(lineId) {
		return originalData[lineId];
	};
	
	self.reset = function() {
		parent.reset();
		originalData = {};
		lineIds.length = 0;
		linePlotProperties = {};
		lineDrawData.length = 0;
		return self;
	};

	function setup() {
		var plotPropName = parent.plotPropertyName,
			rangeX = [null, null],
			rangeY = [null, null];
		
		lineDrawData = [];

		lineIds.forEach(function(lineId) {
			var rawLineData = self.data(lineId),
				range,
				lineData;
				
			if ( rawLineData ) {			
				rawLineData.forEach(function(d) {
					var y;
					
					// set up date for X axis
					if ( d.date === undefined ) {
						// automatically create Date
						d.date = sn.datum.datumDate(d);
					}

					if ( !sourceExcludeCallback || !sourceExcludeCallback.call(this, lineId) ) {
						// adjust X axis range
						if ( rangeX[0] === null || d.date < rangeX[0] ) {
							rangeX[0] = d.date;
						}
						if ( rangeX[1] === null || d.date > rangeX[1] ) {
							rangeX[1] = d.date;
						}
					
						// adjust Y axis range
						y = d[linePlotProperties[lineId] ? linePlotProperties[lineId] : plotPropertyName];
						if ( y !== undefined ) {
							if ( rangeY[0] === null || y < rangeY[0] ) {
								rangeY[0] = y;
							}
							if ( rangeY[1] === null || y > rangeY[1] ) {
								rangeY[1] = y;
							}
						}
					}
				});
			}
			
			lineDrawData.push(rawLineData);
		});
		
		// setup colors
		colors.domain(lineIds.length)
			.range(colorbrewer.Set3[lineIds.length < 3 ? 3 : lineIds.length > 11 ? 12 : lineIds.length]);
		
		// setup X domain		
		parent.x.domain(rangeX);
		
		// setup Y domain
		parent.y.domain(rangeY).nice();
		
		parent.computeUnitsY();
	}
	
	// return a class attribute value of the line ID, to support drawing in the line generator
	function lineClass(d, i) {
		return lineIds[i];
	}
	
	function lineStroke(d, i) {
		return colors(i);
	}
	
	function lineOpacity(d, i) {
		var hidden = (sourceExcludeCallback ? sourceExcludeCallback.call(this, lineIds[i]) : false);
		return (hidden ? 1e-6 : 1);
	}
	
	function lineCommonProperties(selection) {
		selection
				.style('opacity', lineOpacity)
				.attr('stroke', lineStroke)
				.attr('d', linePathGenerator);
	}
	
	function draw() {
		var transitionMs = parent.transitionMs(),
			lines,
			drawData;
		
		lines = parent.svgDataRoot.selectAll('path').data(lineDrawData, function(d, i) {
			return lineIds[i];
		});
		
		lines.attr('class', lineClass)
			.transition().duration(transitionMs)
				.call(lineCommonProperties);
		
		lines.enter().append('path')
				.attr('class', lineClass)
				.call(lineCommonProperties);
		
		lines.exit().transition().duration(transitionMs)
			.style('opacity', 1e-6)
			.remove();
		
		superDraw();
		// TODo: drawAxisXRules();
	}
	/* TODO
	function axisXVertRule(d) {
		return (Math.round(parent.x(d) + 0.5) - 0.5);
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
	*/
	
	// wire up implementations
	parent.setup = setup;
	parent.draw = draw;
	
	return self;
};

}());
