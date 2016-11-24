

var fs = require('fs');
var packageInfo = JSON.parse(fs.readFileSync('package.json', 'utf8'));
var config = {};
var glob = require('glob');
var gulp = require('gulp');
var plumber = require('gulp-plumber');
var Builder = require('systemjs-builder');
var less = require('gulp-less');
var concatCss = require('gulp-concat-css');
var gulpgo = require('gulp-go-windows-fork');
var go;
var browserSync = require('browser-sync').create();

var pathToStaticDist = 'static/';
var pathToStaticSrc = 'frontend/';
var pathToServerSrc = 'server/'

var bootstrap = [
  'jspm_packages/github/twbs/bootstrap@3.3.6/css/bootstrap.css',
  'jspm_packages/github/angular-ui/bootstrap-bower@1.3.3/ui-bootstrap-csp.css'
];
var bootstrapFonts = 'jspm_packages/github/twbs/bootstrap@3.3.6/fonts/*';
var watchJs = pathToStaticSrc+'**/*.js';
var watchGo = 'server/*.go';
var watchLess = [pathToStaticSrc+'**/*.less'];
var watchJsTemplates = pathToStaticSrc+'**/*.tmpl.html';
var watchServerTemplates = 'server/*.html';


function systemjsBundle (fileName, options) {
  var builder = new Builder('./', packageInfo.jspm.configFile)

  return builder.buildStatic(pathToStaticSrc+fileName, pathToStaticDist+fileName, options)
  .catch(function(err) {
    console.log('Build error');
    console.log(err);
  });
}

gulp.task('setup-config', [], function () {
  var configLocal = JSON.parse(fs.readFileSync('config-local.json', 'utf8'));
  var configDeploy = JSON.parse(fs.readFileSync('config-deploy.json', 'utf8'));
  if(process.env.TICKSCRIPT_STUDIO_BUILD_ENVIRONMENT == 'deploy') {
    config = Object.assign(configLocal, configDeploy);
  } else {
    config = configLocal;
  }

  fs.writeFileSync('config.json', JSON.stringify(config, null, 2), 'utf8');
});

gulp.task('bundle-vendor-js', ['setup-config'], function () {
  return systemjsBundle('vendor.js', {
    runtime: false,
    minify:     config.gulpVendorMinify,
    sourceMaps: config.gulpVendorSourceMaps,
    lowResSourceMaps: true
  });
});

gulp.task('bundle-js', ['setup-config'], function () {
  return systemjsBundle('index.js', {
    runtime: false,
    minify:     config.gulpAppMinify,
    sourceMaps: config.gulpAppSourceMaps,
    lowResSourceMaps: true
  });
});

gulp.task('copy-css', [], function() {
  return gulp.src(bootstrap)
    .pipe(concatCss("bootstrap.css"))
    .pipe(gulp.dest(pathToStaticDist));
});

gulp.task('copy-fonts', [], function() {
  return gulp.src(bootstrapFonts)
    .pipe(gulp.dest(pathToStaticDist+'/fonts'));
});

gulp.task("go-run", function() {
  var cwd = __dirname.replace(new RegExp('\\\\', 'g'), '/');
  glob(watchGo, {cwd: cwd}, function (er, files) {
    //console.log(cwd, files.join(" "));
    go = gulpgo.run(files, [], {
      cwd: cwd,
      onStdout: function(buffer) { console.log(buffer.toString('utf8')); },
      onStderr:  function(buffer) { console.error(buffer.toString('utf8')); }
    });
  });
});

gulp.task("go-restart", function() {
  go.restart();
});

gulp.task('build', [
  'copy-css',
  'copy-fonts',
  'bundle-less',
  'bundle-js',
  'bundle-vendor-js'
], function(){});

gulp.task('bundle-less', function () {
 return gulp.src(watchLess)
   .pipe(plumber())
   .pipe(less({}))
   .pipe(concatCss("bundle.css"))
   .pipe(gulp.dest(pathToStaticDist))
   .pipe(browserSync.stream());
});

gulp.task('bundle-js-watch', ['bundle-js'], function() { browserSync.reload(); });
gulp.task('go-server-watch', ['go-restart'], function() {
  setTimeout(function() { browserSync.reload(); }, 2200);
 });

var debounceLESS = debounce(function () { gulp.start('bundle-less'); }, 200);
var debounceJS = debounce(function () { gulp.start('bundle-js-watch'); }, 200);
var debounceGo = debounce(function () { gulp.start('go-server-watch'); }, 200);

gulp.task('watch', ['build'], function() {
  gulp.watch(watchLess, function () { debounceLESS(); });
  gulp.watch([watchJs, watchJsTemplates], function () { debounceJS(); });
  gulp.watch([watchGo, watchServerTemplates], function () { debounceGo(); });
});

gulp.task('serve', ['go-run', 'watch'], function() {

  browserSync.init({
    proxy: {
      target: "http://localhost:"+config.listenPort,
    }
  });
});

gulp.task('default', ['serve'], function(){});

function debounce(func, wait, immediate) {
	var timeout;
	return function() {
		var context = this, args = arguments;
		var later = function() {
			timeout = null;
			if (!immediate) func.apply(context, args);
		};
		var callNow = immediate && !timeout;
		clearTimeout(timeout);
		timeout = setTimeout(later, wait);
		if (callNow) func.apply(context, args);
	};
};
