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
 * @typedef sn.chart.powerAreaChartParameters
 * @type {sn.Configuration}
 * @property {number} [width=812] - desired width, in pixels, of the chart
 * @property {number} [height=300] - desired height, in pixels, of the chart
 * @property {number[]} [padding=[10, 0, 20, 30]] - padding to inset the chart by, in top, right, bottom, left order
 * @property {number} [transitionMs=600] - transition time
 * @property {sn.Configuration} excludeSources - the sources to exclude from the chart
 */

/**
 * An power stacked area chart.
 * 
 * You can use the {@code excludeSources} parameter to dynamically alter which sources are visible
 * in the chart. After changing the configuration call {@link sn.chart.powerAreaChart#regenerate()}
 * to re-draw the chart.
 * 
 * Note that the global {@link sn.colorFn} function is used to map sources to colors, so that
 * must be set up previously.
 * 
 * @class
 * @param {string} containerSelector - the selector for the element to insert the chart into
 * @param {sn.chart.powerAreaChartParameters} [chartConfig] - the chart parameters
 * @returns {sn.chart.powerAreaChart}
 */
sn.chart.powerAreaChart = function(containerSelector, chartConfig) {
	var that = {
		version : "1.0.0"
	};
	var sources = [];
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
	
	var transitionMs = undefined;

	// the d3 stack offset method, or function
	var stackOffset = undefined;

	var svgRoot = undefined,
		svg = undefined,
		svgTickGroupX = undefined;
	
	// our layer data, and generator function
	var layerGenerator = undefined;
	var layers = undefined;
	var minY = 0;

	// Set y-axis  unit label
	// setup display units in kW if domain range > 1000
	var displayFactor = 1;
	var displayFormatter = d3.format(',d');

	var areaPathGenerator = d3.svg.area()
		.interpolate("monotone")
		.x(function(d) { return x(d.x); })
		.y0(function(d) { return y(d.y0); })
		.y1(function(d) { return y(d.y0 + d.y); });

	function parseConfiguration() {
		that.aggregate(config.aggregate);
		transitionMs = (config.transitionMs || 600);
		vertRuleOpacity = (config.vertRuleOpacity || 0.05);
		seasonColors = (config.seasonColors || ['#5c8726', '#e9a712', '#762123', '#80a3b7']);
		northernHemisphere = (config.northernHemisphere === true ? true : false);
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
		layerGenerator = sn.powerPerSourceStackedLayerGenerator(sources, 'watts')
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
				that.wiggle() ? [] : y.ticks(5));
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
	
	that.sources = sources;
	
	/**
	 * Get the x-axis domain (minimum and maximum dates).
	 * 
	 * @return {number[]} an array with the minimum and maximum values used in the x-axis of the chart
	 * @memberOf sn.chart.powerAreaChart
	 */
	that.xDomain = function() { return x.domain(); };

	/**
	 * Get the y-axis domain (minimum and maximum values).
	 * 
	 * @return {number[]} an array with the minimum and maximum values used in the y-axis of the chart
	 * @memberOf sn.chart.powerAreaChart
	 */
	that.yDomain = function() { return y.domain(); };
	
	/**
	 * Get the scaling factor the y-axis is using. By default this will return {@code 1}.
	 * After calling the {@link #load()} method, however, the chart may decide to scale
	 * the y-axis for clarity. You can call this method to find out the scaling factor the
	 * chart ended up using.
	 *  
	 * @return the y-axis scale factor
	 * @memberOf sn.chart.powerAreaChart
	 */
	that.yScale = function() { return displayFactor; };

	/**
	 * Get the current {@code aggregate} value in use.
	 * 
	 * @param {number} [value] the number of consumption sources to use
	 * @returns when used as a getter, the count number, otherwise this object
	 * @returns the {@code aggregate} value
	 * @memberOf sn.chart.powerAreaChart
	 */
	that.aggregate = function(value) { 
		if ( !arguments.length ) return aggregateType;
		aggregateType = (value === 'Month' ? 'Month' : value === 'Day' ? 'Day' : value === 'Hour' ? 'Hour' : 'Minute');
		return that;
	};
	
	/**
	 * Load data for the chart. The data is expected to be in a form suitable for
	 * passing to {@link sn.powerPerSourceArray}.
	 * 
	 * @param {Array} rawData - the raw chart data to load
	 * @return this object
	 * @memberOf sn.chart.powerAreaChart
	 */
	that.load = function(rawData) {
		parseConfiguration();
		setup(rawData);
		adjustAxisX();
		adjustAxisY();
		redraw();
		return that;
	};
	
	/**
	 * Regenerate the chart, using the current data. This can be called after disabling a
	 * source 
	 * 
	 * @return this object
	 * @memberOf sn.chart.powerAreaChart
	 */
	that.regenerate = function() {
		if ( layerGenerator === undefined ) {
			// did you call load() first?
			return that;
		}
		parseConfiguration();
		layerGenerator.offset(that.stackOffset());
		layers = layerGenerator();
		computeDomainY();
		adjustAxisY();
		redraw();
		return that;
	};
	
	/**
	 * Get or set the animation transition time, in milliseconds.
	 * 
	 * @param {number} [value] the number of milliseconds to use
	 * @return when used as a getter, the millisecond value, otherwise this object
	 * @memberOf sn.chart.powerAreaChart
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
	 * @memberOf sn.chart.powerAreaChart
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
	 * @memberOf sn.chart.powerAreaChart
	 */
	that.wiggle = function(value) {
		if ( !arguments.length ) return (stackOffset === 'wiggle');
		return that.stackOffset(value === true ? 'wiggle' : 'zero');
	};

	parseConfiguration();
	return that;
};
