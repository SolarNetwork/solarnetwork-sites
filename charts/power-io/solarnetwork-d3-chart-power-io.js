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
 * @typedef sn.chart.powerIOAreaChartParameters
 * @type {object}
 * @property {number} [width=812] - desired width, in pixels, of the chart
 * @property {number} [height=300] - desired height, in pixels, of the chart
 * @property {number[]} [padding=[10, 0, 20, 30]] - padding to inset the chart by, in top, right, bottom, left order
 * @property {number} [transitionMs=600] - transition time
 * @property {sn.Configuration} excludeSources - the sources to exclude from the chart
 */

/**
 * An power input and output chart designed to show consumption and generation data simultaneously.
 * 
 * You can use the {@code excludeSources} parameter to dynamically alter which sources are visible
 * in the chart. After changing the configuration call {@link sn.chart.powerIOAreaChart#regenerate()}
 * to re-draw the chart.
 * 
 * Note that the global {@link sn.colorFn} function is used to map sources to colors, so that
 * must be set up previously.
 * 
 * @class
 * @param {string} containerSelector - the selector for the element to insert the chart into
 * @param {sn.chart.powerIOAreaChartParameters} [chartParams] - the chart parameters
 * @returns {sn.chart.powerIOAreaChart}
 */
sn.chart.powerIOAreaChart = function(containerSelector, chartParams) {
	var that = {
		version : "1.0.0"
	};
	var sources = [];
	var parameters = (chartParams || {});
	
	// default to container's width, if we can
	var containerWidth = sn.pixelWidth(containerSelector);
	
	var p = (parameters.padding || [10, 0, 20, 30]),
		w = (parameters.width || containerWidth || 812) - p[1] - p[3],
		h = (parameters.height || 300) - p[0] - p[2],
    	x = d3.time.scale().range([0, w]),
		y = d3.scale.linear().range([h, 0]),
		format = d3.time.format("%H");

	var transitionMs = (parameters.transitionMs || 600);
	
	var svgRoot = undefined,
		svg = undefined;
	
	// our layer data, and generator function
	var layerGenerator = undefined;
	var layers = undefined;
	var minY = 0;
	
	var consumptionLayerCount = 0;
	
	function strokeColorFn(d, i) { return d3.rgb(sn.colorFn(d,i)).darker(); }

	var areaPathGenerator = d3.svg.area()
		.interpolate("monotone")
		.x(function(d) { return x(d.x); })
		.y0(function(d) { return y(d.y0); })
		.y1(function(d) { return y(d.y0 + d.y); });
	
	function computeDomainX() {
		x.domain(layers.domainX);
	}

	function computeDomainY() {
		y.domain([minY, layers.maxY]).nice();
		computeUnitsY();
	}
	
	// Set y-axis  unit label
	// setup display units in kW if domain range > 1000
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

	function setup(rawData) {
		// turn filteredData object into proper array, sorted by date
		var dataArray = sn.powerPerSourceArray(rawData, sources);
		sn.log('Available area sources: {0}', sources);

		// Transpose the data into watt layers by source, e.g.
		// [ [{x:0,y:0},{x:1,y:1}...], ... ]
		layerGenerator = sn.powerPerSourceStackedLayerGenerator(sources, 'watts')
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
			.attr("class", "crisp rule")
			.attr("transform", "translate(0," + p[0] + ")");
	}

	function redraw() {	
		// draw data areas
		var area = svg.selectAll("path.area").data(layers);
		
		area.transition().duration(transitionMs).delay(200)
				.attr("d", areaPathGenerator);
		
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
		var gx = svg.selectAll("g.data text")
			.data(ticks)
				.attr("x", x)
				.text(fx);
		gx.enter().append("text")
				.attr("x", x)
				.attr("y", h + p[2])
				.text(fx);
		gx.exit().remove();
	}

	function adjustAxisY() {
		if ( sn.env.wiggle === 'true' ) {
			return;
		}
		
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
	
	that.sources = sources;
	
	/**
	 * Get the x-axis domain (minimum and maximum dates).
	 * 
	 * @return {number[]} an array with the minimum and maximum values used in the x-axis of the chart
	 * @memberOf sn.chart.powerIOAreaChart
	 */
	that.xDomain = function() { return x.domain(); };

	/**
	 * Get the y-axis domain (minimum and maximum values).
	 * 
	 * @return {number[]} an array with the minimum and maximum values used in the y-axis of the chart
	 * @memberOf sn.chart.powerIOAreaChart
	 */
	that.yDomain = function() { return y.domain(); };
	
	/**
	 * Get the scaling factor the y-axis is using. By default this will return {@code 1}.
	 * After calling the {@link #load()} method, however, the chart may decide to scale
	 * the y-axis for clarity. You can call this method to find out the scaling factor the
	 * chart ended up using.
	 *  
	 * @return the y-axis scale factor
	 * @memberOf sn.chart.powerIOAreaChart
	 */
	that.yScale = function() { return displayFactor; };

	/**
	 * Load data for the chart. The data is expected to be in a form suitable for
	 * passing to {@link sn.powerPerSourceArray}.
	 * 
	 * @return this object
	 * @memberOf sn.chart.powerIOAreaChart
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
	 * @memberOf sn.chart.powerIOAreaChart
	 */
	that.regenerate = function() {
		if ( layerGenerator === undefined ) {
			// did you call load() first?
			return that;
		}
		layers = layerGenerator();
		computeDomainY();
		redraw();
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
	 * @memberOf sn.chart.powerIOAreaChart
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
