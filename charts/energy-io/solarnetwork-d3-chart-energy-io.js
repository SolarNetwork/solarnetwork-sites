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
 * @typedef sn.chart.energyIOBarChartParameters
 * @type {object}
 * @property {number} [width=812] - desired width, in pixels, of the chart
 * @property {number} [height=300] - desired height, in pixels, of the chart
 * @property {number[]} [padding=[30, 0, 30, 30]] - padding to inset the chart by, in top, right, bottom, left order
 * @property {number} [transitionMs=600] - transition time
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
 * @param {string} containerSelector - the selector for the element to insert the chart into
 * @param {sn.chart.energyIOBarChartParameters} [chartParams] - the chart parameters
 * @returns {sn.chart.energyIOBarChart}
 */
sn.chart.energyIOBarChart = function(containerSelector, chartParams) {
	var that = {
		version : "1.0.0"
	};
	var sources = [];
	var parameters = (chartParams || {});
	
	// default to container's width, if we can
	var containerWidth = sn.pixelWidth(containerSelector);
	
	var p = (parameters.padding || [30, 0, 30, 30]),
		w = (parameters.width || containerWidth || 812) - p[1] - p[3],
		h = (parameters.height || 300) - p[0] - p[2],
    	x = d3.time.scale().range([0, w]),
		y = d3.scale.linear().range([h, 0]),
		format = d3.time.format("%H");
	
	var transitionMs = (parameters.transitionMs || 600);

	var svgRoot = undefined,
		svg = undefined,
		aggGroup = undefined;
	
	// our layer data, and generator function
	var layerGenerator = undefined;
	var layers = undefined;
	var minY = 0;
	var barWidth = 0;
	var dailyAggregateWh = undefined;
	
	var consumptionLayerCount = 0;
	
	function computeDomainX() {
		// Add extra x domain to accommodate bar width, otherwise last bar is cut off right edge of chart
		var xMax = layers.domainX[1];
		xMax = new Date(xMax.getTime() + (xMax.getTime() - layers[0][layers[0].length - 2].x.getTime()));
		x.domain([layers.domainX[0], xMax]);
		barWidth = (layers[0].length === 0 ? 0 : (w / (layers[0].length)));
	}

	function computeDomainY() {
		y.domain([minY, layers.maxY]).nice();
		computeUnitsY();
	}
	
	// Set y-axis  unit label
	// setup display units in kWh if domain range > 1000
	var displayFactor = 1;
	var displayFormatter = d3.format(',d');
	function computeUnitsY() {
		var fmt;
		var maxY = d3.max(y.domain() ,function(v) { return Math.abs(v); });
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

	// Create daily aggregated data, in form [ { date: Date(2011-12-02 12:00), wattHoursTotal: 12312 }, ... ]
	function calculateDailyAggregateWh() {
		var results = [];
		var i, j, len;
		var startIndex = undefined;
		var endIndex = undefined;
		var currDayData = undefined;
		var obj = undefined;
		var day1 = undefined;

		// calculate first x index for midnight
		for ( i = 0, len = layers[0].length; i < len; i++ ) {
			if ( layers[0][i].x.getHours() === 0 ) {
				startIndex = i;
				day1 = layers[0][i].x;
				break;
			}
		}
		
		endIndex = layers[0].length;
		
		// sum up values for each day
		if ( startIndex !== undefined && endIndex !== undefined && startIndex < endIndex) {
			len = layers.length;
			for ( i = 0; i < endIndex; i++ ) {
				for ( j = 0; j < len; j++ ) {
					if ( sn.runtime.excludeSources[layers[j].source] !== undefined ) {
						continue;
					}
					obj = layers[j][i];
					if ( obj.x.getTime() < day1.getTime() ) {
						// skip before first tick
						continue;
					}
					if ( currDayData === undefined || obj.x.getDate() !== currDayData.date.getDate()
							|| obj.x.getMonth() !== currDayData.date.getMonth() 
							|| obj.x.getYear() !== currDayData.date.getYear() ) {
						currDayData = {
								date : new Date(obj.x.getTime()), 
								wattHoursTotal : (i < startIndex ? null : 0),
								wattHoursConsumed : (i < startIndex ? null : 0),
								wattHoursGenerated : (i < startIndex ? null : 0)
							};
						currDayData.date.setHours(0,0,0,0);
						results.push(currDayData);
					}
					if ( i >= startIndex ) {
						if ( j < consumptionLayerCount ) {
							currDayData.wattHoursConsumed += obj.y;
							currDayData.wattHoursTotal -= obj.y;
						} else {
							currDayData.wattHoursGenerated += obj.y;
							currDayData.wattHoursTotal += obj.y;
						}
					}
				}
			}
		}
		
		// add dates as keys to returned array
		for ( i = 0, len = results.length; i < len; i++ ) {
			results[results[i].date.getTime()] = results[i];
		}
		
		return results;
	}
	
	function setup(rawData) {
		// turn filteredData object into proper array, sorted by date
		var dataArray = sn.powerPerSourceArray(rawData, sources);
		sn.log('Available area sources: {0}', sources);

		// Transpose the data into watt layers by source, e.g.
		// [ [{x:0,y:0,y0:0},{x:1,y:1,y0:0}...], ... ]
		layerGenerator = sn.powerPerSourceStackedLayerGenerator(sources, 'wattHours')
			.excludeSources(parameters.excludeSources)
			.offset(function(data) {
				minY = 0;
				var i, j = -1,
					m = data[0].length,
					offset,
					y0 = [];
				while (++j < m) {
					i = -1;
					offset = 0;
					while ( ++i < consumptionLayerCount ) {
						offset -= data[i][j][1];
					}
					y0[j] = offset;
					if ( offset < minY ) {
						minY = offset;
					}
				}
				return y0;
			}).data(dataArray);
		layers = layerGenerator();

		// Compute the x-domain (by date) and y-domain (by top).
		computeDomainX();
		computeDomainY();

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
		
		svgRoot.append("g")
			.attr("class", "rule")
			.attr("transform", "translate(0," + p[0] + ")");

		aggGroup = svgRoot.append("g")
			.attr('class', 'agg-gen')
			.attr("transform", "translate(" + p[3] + ",0)");

	}
	
	function axisYTransform(d) {
		// align to half-pixels, to 1px line is aligned to pixels and crisp
		return "translate(0," + (Math.round(y(d) + 0.5) - 0.5) + ")"; 
	}

	function axisXAggPosFn(d) { return x(d) + (barWidth / 2); }
	
	function axisXAggTextFn(d, propName) {
		var t = new Date(d.getTime());
		t.setHours(0, 0, 0, 0); // truncate to midnight of day
		var a = dailyAggregateWh[t.getTime()];
		return (a !== undefined ? a[propName] === null 
				? '' : Number(a[propName] / displayFactor).toFixed(2)
						: 0);
	}
	
	function axisXAggSumTextFn(d) {
		return axisXAggTextFn(d, 'wattHoursTotal');
	}
	
	function axisXAggGenerationTextFn(d) {
		return axisXAggTextFn(d, 'wattHoursGenerated');
	}
	
	function adjustAxisXAggregateGeneration(ticks) {
		var aggTicks = ticks.filter(function(d) { return d.getHours() === 12; });
		var aggLabels = aggGroup.selectAll("text").data(aggTicks)
			.attr('x', axisXAggPosFn)
			.text(axisXAggSumTextFn);
		
		aggLabels.transition().duration(transitionMs)
				.attr("x", axisXAggPosFn)
				.text(axisXAggGenerationTextFn);
			
		aggLabels.exit().transition().duration(transitionMs)
	  			.style("opacity", 1e-6)
	  			.remove();

		aggLabels.enter().append("text")
				.attr("x", axisXAggPosFn)
				.style("opacity", 1e-6)
				.text(axisXAggGenerationTextFn)
			.transition().duration(transitionMs)
				.style("opacity", null);
	}

	function adjustAxisX() {
		if ( d3.event && d3.event.transform ) {
			d3.event.transform(x);
		}
		var ticks = x.ticks(d3.time.hours, 12);
		dailyAggregateWh = calculateDailyAggregateWh(ticks);

		var dx = function(d) { return x(d) + (barWidth / 2); };
		var fx = x.tickFormat(ticks.length);
		
		function tickText(d) {
			if ( d.getHours() === 12 ) {
				return axisXAggSumTextFn(d);
			} else {
				return fx(d);
			}
		}

		function tickClassAgg(d) {
			return (d.getHours() === 12);
		}
		
		function tickClassNeg(d) {
			return (d.getHours() === 12 && axisXAggSumTextFn(d) < 0);
		}

		// Add date labels, centered within associated band
		var gx = svg.selectAll("text").data(ticks)
		  	.attr("x", dx)
		  	.text(tickText)
		  	.classed({
				agg : tickClassAgg,
				neg : tickClassNeg
			});
		gx.enter().append("text")
			.attr("x", dx)
			.attr("y", h + p[2])
			.classed({
				agg : tickClassAgg,
				neg : tickClassNeg
			})
			.text(tickText);
		gx.exit().remove();
		
		adjustAxisXAggregateGeneration(ticks);
	}

	function adjustAxisY() {
		function ruleClass(d) {
			return (d === 0 ? 'origin' : 'm');
		}
		
		var axisLines = svgRoot.select("g.rule").selectAll("g").data(y.ticks(5));
		var axisLinesT = axisLines.transition().duration(transitionMs);
		axisLinesT.attr("transform", axisYTransform)
			.select("text")
				.text(displayFormat);
		axisLinesT.select("line")
				.attr('class', ruleClass);
		
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
				.attr('class', ruleClass);
		entered.append("text")
				.attr("x", p[3] - 10)
				.text(displayFormat);
		entered.transition().duration(transitionMs)
				.style("opacity", null);
	}
	
	function redraw() {
		// Add a group for each source.
		var sourceGroups = svg.selectAll("g.source").data(layers);
		sourceGroups.enter()
			.append("g")
				.attr("class", "source")
				.style("fill", sn.colorFn);
		
		var centerYLoc = y(0);
		
		function valueY(d) {
			return y(d.y0 + d.y);
		}
		
		function heightY(d) {
			return y(d.y0) - y(d.y0 + d.y);
		}
		
		var bars = sourceGroups.selectAll("rect").data(Object);
		bars.transition().duration(transitionMs)
			.attr("y", valueY)
			.attr("height", heightY);
		
		var entered = bars.enter().append("rect")
			.attr("x", function(d) { return x(d.x); })
			.attr("y", centerYLoc)
			.attr("height", 1e-6)
			.attr("width", barWidth);
		
		entered.transition().duration(transitionMs)
			.attr("y", valueY)
			.attr("height", heightY);
		
		bars.exit().remove();
	}

	that.sources = sources;
	
	/**
	 * Get the x-axis domain (minimum and maximum dates).
	 * 
	 * @return {number[]} an array with the minimum and maximum values used in the x-axis of the chart
	 * @memberOf sn.chart.energyIOBarChart
	 */
	that.xDomain = function() { return x.domain(); };

	/**
	 * Get the y-axis domain (minimum and maximum values).
	 * 
	 * @return {number[]} an array with the minimum and maximum values used in the y-axis of the chart
	 * @memberOf sn.chart.energyIOBarChart
	 */
	that.yDomain = function() { return y.domain(); };
	
	/**
	 * Get the scaling factor the y-axis is using. By default this will return {@code 1}.
	 * After calling the {@link #load()} method, however, the chart may decide to scale
	 * the y-axis for clarity. You can call this method to find out the scaling factor the
	 * chart ended up using.
	 *  
	 * @return the y-axis scale factor
	 * @memberOf sn.chart.energyIOBarChart
	 */
	that.yScale = function() { return displayFactor; };

	/**
	 * Load data for the chart. The data is expected to be in a form suitable for
	 * passing to {@link sn.energyPerSourceArray}.
	 * 
	 * @return this object
	 * @memberOf sn.chart.energyIOBarChart
	 */
	that.load = function(rawData) {
		setup(rawData);
		redraw();
		adjustAxisX();
		adjustAxisY();
		return that;
	};
	
	/**
	 * Regenerate the chart, using the current data. This can be called after disabling a
	 * source 
	 * 
	 * @return this object
	 * @memberOf sn.chart.energyIOBarChart
	 */
	that.regenerate = function() {
		if ( layerGenerator === undefined ) {
			// did you call load() first?
			return that;
		}
		layers = layerGenerator();
		computeDomainY();
		redraw();
		adjustAxisX();
		adjustAxisY();
		return that;
	};
	
	/**
	 * Get or set the consumption source count. Set this to the number of sources that 
	 * are considered "consumption" and should show up <em>under</em> the y-axis origin.
	 * The sources are assumed to already be ordered with consumption before generation.
	 * 
	 * @param {number} [value] the number of consumption sources to use
	 * @return when used as a getter, the count number, otherwise this object
	 * @memberOf sn.chart.energyIOBarChart
	 */
	that.consumptionSourceCount = function(value) {
		if ( !arguments.length ) return consumptionLayerCount;
		consumptionLayerCount = +value; // the + used to make sure we have a Number
		return that;
	};

	/**
	 * Get or set the animation transition time, in milliseconds.
	 * 
	 * @param {number} [value] the number of milliseconds to use
	 * @return when used as a getter, the millisecond value, otherwise this object
	 * @memberOf sn.chart.powerIOAreaChart
	 */
	that.transitionMs = function(value) {
		if ( !arguments.length ) return transitionMs;
		transitionMs = +value; // the + used to make sure we have a Number
		return that;
	};

	return that;
};
