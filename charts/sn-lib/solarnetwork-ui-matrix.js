if ( sn === undefined ) {
	sn = { ui: {} };
} else if ( sn.ui === undefined ) {
	sn.ui = {};
}

/**
 * Simple implementation of a 2D CSS transform matrix.
 * 
 * @class
 * @returns {sn.ui.Matrix}
 */
sn.ui.Matrix = function() {
	var supportFloat32Array = "Float32Array" in window;
	this.matrix = (function() {
			var result;
			if ( supportFloat32Array ) {
				result = new Float32Array(6);
				result[0] = 1;
				result[3] = 1;
			} else {
				result = [1,0,0,1,0,0];
			}
			return result;
		})();
	
	/**
	 * Cross-browser support for various matrix properties.
	 */
	this.support = {
			use3d : this.supportDefaults.use3d,
			tProp : this.supportDefaults.tProp,
			trProp : this.supportDefaults.trProp,
			trTransform : this.supportDefaults.trTransform,
			trEndEvent : this.supportDefaults.trEndEvent,
	};
};

sn.ui.Matrix.prototype = {
		
	constructor : sn.ui.Matrix,
	
	supportDefaults : (function() {
		// adapted from jquery.transform2d.js
		var divStyle = document.createElement("div").style;
		var suffix = "Transform";
		var testProperties = [
		    "Webkit" + suffix,
			"O" + suffix,
			"ms" + suffix,
			"Moz" + suffix
		];
		var eventProperties = ["webkitTransitionEnd","oTransitionEnd","transitionend","transitionend"];
		var transitionProperties = ["WebkitTransition","OTransition","transition","MozTransition"];
		var transitionTransform = ["-webkit-transform","-o-transform","transform", "-moz-transform"];
		var tProp = "Transform", 
			trProp = "Transition",
			trTransform = "transform",
			trEndEvent = "transitionEnd";
		var i = testProperties.length;
		while ( i-- ) {
			if ( testProperties[i] in divStyle ) {
				tProp = testProperties[i];
				trProp = transitionProperties[i];
				trTransform = transitionTransform[i];
				trEndEvent = eventProperties[i];
				break;
			}
		}
		
		return {
			use3d : (window.devicePixelRatio === undefined ? false : window.devicePixelRatio > 1),
			tProp : tProp,
			trProp : trProp,
			trTransform : trTransform,
			trEndEvent : trEndEvent
		};
	})(),
	
	/**
	 * Generate a CSS matrix3d() function string from the current matrix.
	 * 
	 * @returns {String} the CSS matrix3d() function
	 */
	toMatrix3D : function() {
		return "matrix3d(" 
				+ this.matrix[0] +"," +this.matrix[1] +",0,0,"
				+ this.matrix[2] +',' +this.matrix[3] +",0,0,"
				+ "0,0,1,0,"
				+ this.matrix[4] +',' +this.matrix[5] +",0,1)";
	},
	
	/**
	 * Generate a CSS matrix() function string from the current matrix.
	 * 
	 * @returns {String} the CSS matrix() function
	 */
	toMatrix2D : function() {
		return "matrix(" 
				+ this.matrix[0] +"," +this.matrix[1] +","
				+ this.matrix[2] +',' +this.matrix[3] +","
				+ this.matrix[4] +',' +this.matrix[5] 
				+")";
	},

	/**
	 * Set the z-axis rotation of the matrix.
	 * 
	 * @param {Number} angle the rotation angle, in radians
	 */
	setRotation : function(angle) {
		// TODO this clears any scale, should we care?
		var a = Math.cos(angle);
		var b = Math.sin(angle);
		this.matrix[0] = this.matrix[3] = a;
		this.matrix[1] = (0-b);
		this.matrix[2] = b;
	},
	
	/**
	 * Set a uniform x,y scaling factor of the matrix.
	 * @param {Number} s the scale factor
	 */
	setScale : function(s) {
		// TODO this clears any rotation, should we care?
		this.matrix[0] = s;
		this.matrix[3] = s;
	},
	
	/**
	 * Set the current 2D translate of the matrix.
	 * 
	 * @param {Number} x the x offset
	 * @param {Number} y the y offset
	 */
	setTranslation : function(x, y) {
		this.matrix[4] = x;
		this.matrix[5] = y;
	},
	
	/**
	 * Append a 2D translate to the current matrix.
	 * 
	 * @param {Number} x the x offset
	 * @param {Number} y the y offset
	 */
	translate : function(x, y) {
		this.matrix[4] += x;
		this.matrix[5] += y;
	},
	
	/**
	 * Get the current 2D translation value.
	 * 
	 * @returns {Object} object with x,y Number properties
	 */
	getTranslation : function() {
		return {x:this.matrix[4], y:this.matrix[5]};
	},
	
	/**
	 * Get the 2D distance between a location and this matrix's translation.
	 * 
	 * @param location a location object, with x,y Number properties
	 * @returns {Number} the calculated distance
	 */
	getDistanceFrom : function(location) {
		return Math.sqrt(Math.pow((location.x - this.matrix[4]), 2), 
				Math.pow((location.y - this.matrix[5]), 2));
	},
	
	/**
	 * Apply the matrix transform to an element.
	 * 
	 * <p>If {@code support.use3d} is <em>true</em>, the {@link #toMatrix3D()} transform 
	 * is used, otherwise {@link #toMatrix2D()} is used. Found that legibility of 
	 * text was too blurry on older displays when 3D transform was applied,
	 * but 3D transform provide better performance on hi-res displays.</p>
	 * 
	 * @param {Element} elm the element to apply the transform to
	 */
	apply : function(elm) {
		var m = (this.support.use3d === true ? this.toMatrix3D() : this.toMatrix2D());
		elm.style[this.support.tProp] = m;
	},
	
	/**
	 * Apply a one-time animation callback listener.
	 * 
	 * @param elm the element to add the one-time listener to
	 * @param finished
	 */
	animateListen : function(elm, finished) {
		var listener = undefined;
		var self = this;
		listener = function(event) {
			if ( event.target === elm ) {
				elm.removeEventListener(self.support.trEndEvent, listener, false);
				finished.apply(elm);
			}
		};
		elm.addEventListener(self.support.trEndEvent, listener, false);
	},
	
	/**
	 * Apply the matrix transform to an element, with an "ease out" transition.
	 * 
	 * <p>Calls {@link #apply(elm)} internally.</p>
	 * 
	 * @param {Element} elm the element to apply the transform to
	 * @param {String} timing the CSS timing function to use
	 * @param {String} duration the CSS duration to use
	 * @param {Function} finished an optional callback function to execute when 
	 * the animation completes
	 * 
	 */
	animate : function(elm, timing, duration, finished) {
		var self = this;
		this.animateListen(elm, function() {
			elm.style[self.support.trProp] = '';
			if ( finished !== undefined ) {
				finished.apply(elm);
			}
		});
		var cssValue = this.support.trTransform 
			+' ' 
			+(duration !== undefined ? duration : '0.3s')
			+' ' 
			+(timing !== undefined ? timing : 'ease-out');
		elm.style[this.support.trProp] = cssValue;
		this.apply(elm);
	},
	
	
	/**
	 * Apply the matrix transform to an element, with an "ease out" transition.
	 * 
	 * <p>Calls {@link #animate(elm)} internally.</p>
	 * 
	 * @param {Element} elm the element to apply the transform to
	 * @param {Function} finished an optional callback function to execute when 
	 */
	easeOut : function(elm, finished) {
		this.animate(elm, 'ease-out', undefined, finished);
	},
	
	/**
	 * Apply the matrix transform to an element, with an "ease in" transition.
	 * 
	 * <p>Calls {@link #animate(elm)} internally.</p>
	 * 
	 * @param {Element} elm the element to apply the transform to
	 * @param {Function} finished an optional callback function to execute when 
	 */
	easeIn : function(elm, finished) {
		this.animate(elm, 'ease-in', undefined, finished);
	},
	
	/**
	 * Test if 3D matrix transforms are being used.
	 * 
	 * @returns {Boolean} <em>true</em> if 3D transformations matrix are being used, 
	 *                    <em>false</em> if 2D transformations are being used
	 */
	isUse3d : function() {
		return (this.support.use3d === true);
	},
	
	/**
	 * Set which transformation matrix style should be used: 3D or 2D.
	 * 
	 * @param {Boolean} value <em>true</em> if 3D transformations matrix should be used, 
	 *                    <em>false</em> if 2D transformations should be used
	 */
	setUse3d : function(value) {
		this.support.use3d = (value === true);
	}
};
