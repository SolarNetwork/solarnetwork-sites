<html lang="en">
<head>
	<title>SolarNetwork Login</title>
	<c:set var="packFiles">
		/css/console.css
		<spring:theme code="app.style"/>
	</c:set>
	<pack:style>
		${packFiles}
	</pack:style>
	<c:set var="packFiles">
		/js-lib/jquery-1.6.4.js
		/js-lib/jquery.form.js
		/js-lib/jquery-ui-1.8.13.custom.min.js		
		/js/console.js
		/js/sn.js
		<spring:theme code="app.javascript"/>
	</c:set>
	<pack:script>
		${packFiles}
	</pack:script>
</head>
<body>
<div class="container">
	<p class="intro">
	Enter your SolarNetwork security token and password to log in. 
	If you do not have a security token created for your SolarNetwork account, 
	<a href="/solaruser/index.do">go to SolarNetwork</a> and create one.
	</p>

<form method="post" class="form form-horizontal login-form" action="/solaruser/j_spring_security_check" id="login-form">
	<fieldset>
		<div class="control-group">
			<label for="login-token" class="control-label">Token</label>
			<div class="controls">
				<input type="text" value="" placeholder="Security Token" maxlength="64" id="login-token" name="token">
				<span class="help-inline">A valid email is required.</span>
			</div>
		</div>
		<div class="control-group">
			<label for="login-secret" class="control-label">Secret</label>
			<div class="controls">
				<input type="password" placeholder="Secret" maxlength="64" id="login-secret" name="secret">
			</div>
		</div>
	</fieldset>
	<div class="form-actions">
		<button class="btn btn-primary" type="submit">Login</button>
	</div>
</form>
</div>


</body></html>