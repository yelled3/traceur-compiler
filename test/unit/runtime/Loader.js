// Copyright 2011 Traceur Authors.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

suite('Loader.js', function() {

  function get(name) {
    return $traceurRuntime.ModuleStore.getForTesting(name);
  }

  var MutedErrorReporter = get('src/util/MutedErrorReporter.js').MutedErrorReporter;
  var resolveUrl = get('src/util/url.js').resolveUrl;

  var reporter, baseURL;

  setup(function() {
    reporter = new traceur.util.ErrorReporter();
    baseURL = System.baseURL;
  });

  teardown(function() {
    assert.isFalse(reporter.hadError());
    traceur.options.reset();
    System.baseURL = baseURL;
  });

  var url;
  var fileLoader;
  if (typeof __filename !== 'undefined') {
    // TOD(arv): Make the system work better with file paths, especially
    // Windows file paths.
    url = __filename.replace(/\\/g, '/');
    fileLoader = require('../../../src/node/nodeLoader.js');
    System = require('../../../src/node/System.js');
  } else {
    url = resolveUrl(window.location.href, 'test/unit/runtime/modules.js');
    fileLoader = get('src/runtime/webLoader.js').webLoader;
  }

  function getLoader() {
    var TraceurLoader = get('src/runtime/TraceurLoader.js').TraceurLoader;
    return new TraceurLoader(fileLoader, url);
  }

  test('locate', function() {
    var loader = getLoader();
    var load = {
      metadata: {
        baseURL: 'http://example.org/a/'
      },
      data: {}
    }
    load.normalizedName = '@abc/def';
    assert.equal(loader.locate(load), 'http://example.org/a/@abc/def.js');
    load.normalizedName = 'abc/def';
    assert.equal(loader.locate(load), 'http://example.org/a/abc/def.js');
    load.normalizedName = 'abc/def.js';
    assert.equal(loader.locate(load), 'http://example.org/a/abc/def.js');
    load.normalizedName = './abc/def.js';
    assert.equal(loader.locate(load), 'http://example.org/a/abc/def.js');
  });

  test('traceur@', function() {
    var traceur = System.get('traceur@');
    var optionsModule = $traceurRuntime.ModuleStore.getForTesting('src/Options.js');
    assert.equal(traceur.options, optionsModule.options);
  });

  test('Loader.PreCompiledModule', function(done) {
    var traceur = System.get('traceur@');
    System.import('traceur@', {}).then(function(module) {
      assert.equal(traceur.options, module.options);
      done();
    }).catch(done);
  });

  test('Loader.Script', function(done) {
    getLoader().script('(function(x = 42) { return x; })()', {}).then(
      function(result) {
        assert.equal(42, result);
        done();
      }).catch(done);
  });

  test('Loader.Script.Named', function(done) {
    var loader = getLoader();
    var src = '(function(x = 43) { return x; })()';
    var name = '43';
    var metadata = {traceurOptions: {sourceMaps: true}};
    loader.script(src, {name: name, metadata: metadata}).then(
      function(result) {
        traceur.options.sourceMaps = false;
        var normalizedName = System.normalize(name);
        var sourceMap = loader.getSourceMap(normalizedName);
        assert(sourceMap, 'the sourceMap is defined');
        assert.equal(43, result);
        done();
      }).catch(done);
  });

  test('Loader.Script.Fail', function(done) {
    var reporter = new MutedErrorReporter();
    getLoader(reporter).script('export var x = 5;', {}).then(
      function(result) {
        fail('should not have succeeded');
        done();
      }, function(ex) {
        assert(ex);
        done();
      }).catch(done);
  });

  test('LoaderModule', function(done) {
    var code =
        'import * as a from "./test_a.js";\n' +
        'import * as b from "./test_b.js";\n' +
        'import * as c from "./test_c.js";\n' +
        '\n' +
        'export var arr = [\'test\', a.name, b.name, c.name];\n';

    var result = getLoader().module(code, {}).then(
      function(module) {
        assert.equal('test', module.arr[0]);
        assert.equal('A', module.arr[1]);
        assert.equal('B', module.arr[2]);
        assert.equal('C', module.arr[3]);
        assert.isNull(Object.getPrototypeOf(module));
        done();
      }).catch(done);
  });

  test('LoaderModuleWithSubdir', function(done) {
    var code =
        'import * as d from "./subdir/test_d.js";\n' +
        '\n' +
        'export var arr = [d.name, d.e.name];\n';

    var result = getLoader().module(code, {}).then(
      function(module) {
        assert.equal('D', module.arr[0]);
        assert.equal('E', module.arr[1]);
        done();
      }).catch(done);
  });

  test('LoaderModuleFail', function(done) {
    var code =
        'import * as a from "./test_a.js";\n' +
        'import * as b from "./test_b.js";\n' +
        'import * as c from "./test_c.js";\n' +
        '\n' +
        '[\'test\', SYNTAX ERROR a.name, b.name, c.name];\n';

    var reporter = new MutedErrorReporter();

    var result = getLoader(reporter).module(code, {}).then(
      function(value) {
        fail('Should not have succeeded');
        done();
      }, function(error) {
        // TODO(jjb): We should probably get some meaningful error here.

        //assert.isTrue(reporter.hadError());
        assert.isTrue(true);
        done();
      }).catch(done);
  });

  test('LoaderLoad', function(done) {
    getLoader().loadAsScript('./test_script.js', {}).then(function(result) {
      assert.equal('A', result[0]);
      assert.equal('B', result[1]);
      assert.equal('C', result[2]);
      done();
    }).catch(done);
  });

  test('LoaderLoad.Fail', function(done) {
    var reporter = new MutedErrorReporter();
    getLoader(reporter).loadAsScript('./non_existing.js', {}).then(function(result) {
      fail('should not have succeeded');
      done();
    }, function(error) {
      assert(error);
      done();
    }).catch(done);
  });

  test('LoaderLoadWithReferrer', function(done) {
    getLoader().loadAsScript('../test_script.js',
      {referrerName: 'traceur@0.0.1/bin'}).then(
      function(result) {
        assert.equal('A', result[0]);
        assert.equal('B', result[1]);
        assert.equal('C', result[2]);
        done();
      }).catch(done);
  });


  test('Loader.LoadAsScriptAll', function(done) {
    var names = ['./test_script.js'];
    getLoader().loadAsScriptAll(names, {}).then(function(results) {
      var result = results[0];
      assert.equal('A', result[0]);
      assert.equal('B', result[1]);
      assert.equal('C', result[2]);
      done();
    }).catch(done);
  });

  test('LoaderImport', function(done) {
    getLoader().import('./test_module.js', {}).then(function(mod) {
      assert.equal('test', mod.name);
      assert.equal('A', mod.a);
      assert.equal('B', mod.b);
      assert.equal('C', mod.c);
      done();
    }).catch(done);
  });

  test('LoaderImportAll', function(done) {
    var names = ['./test_module.js'];
    getLoader().importAll(names, {}).then(function(mods) {
      var mod = mods[0];
      assert.equal('test', mod.name);
      assert.equal('A', mod.a);
      assert.equal('B', mod.b);
      assert.equal('C', mod.c);
      done();
    }).catch(done);
  });

  // TODO: Update Traceur loader implementation to support new instantiate output
  /* test('LoaderDefine.Instantiate', function(done) {
    var loader = getLoader();
    traceur.options.modules = 'instantiate';
    var name = './test_instantiate.js';
    var src = 'export {name as a} from \'./test_a.js\';\n' +
    'export var dd = 8;\n';
    loader.define(name, src).then(function() {
      return loader.import(name);
    }).then(function(mod) {
        assert.equal(8, mod.dd);
        done();
    }).catch(done);
  }); */

  test('LoaderImport.Fail', function(done) {
    var reporter = new MutedErrorReporter();
    getLoader(reporter).import('./non_existing.js', {}).then(function(mod) {
      fail('should not have succeeded')
      done();
    }, function(error) {
      assert(error);
      done();
    }).catch(done);
  });

  test('LoaderImport.Fail.deperror', function(done) {
    var reporter = new MutedErrorReporter();
    var metadata = {traceurOptions: {sourceMaps: 'memory'}};
    getLoader(reporter).import('loads/main', {metadata: metadata}).then(
      function(mod) {
        fail('should not have succeeded')
        done();
      }, function(error) {
        assert((error + '').indexOf('ModuleEvaluationError: dep error in') !== -1);
        assert((error.stack + '').indexOf('eval at <anonymous>') === -1,
            '<eval> stacks are converted.');
        done();
      }).catch(done);
  });

  test('LoaderImportWithReferrer', function(done) {
    getLoader().import('../test_module.js',
      {referrerName: 'traceur@0.0.1/bin'}).then(function(mod) {
        assert.equal('test', mod.name);
        assert.equal('A', mod.a);
        assert.equal('B', mod.b);
        assert.equal('C', mod.c);
        done();
      }).catch(done);
  });

  test('Loader.define', function(done) {
    var name = System.normalize('./test_define.js');
    getLoader().import('./side-effect.js', {}).then(function(mod) {
      assert.equal(6, mod.currentSideEffect());  // starting value.
      var src = 'export {name as a} from \'./test_a.js\';\n' +
        'export var d = 4;\n' + 'this.sideEffect++;';
      return getLoader().define(name, src, {}).then(function() {
        return mod;
      });
    }).then(function(mod) {
      assert.equal(6, mod.currentSideEffect());  // no change
      var definedModule = System.get(name);
      assert.equal(7, mod.currentSideEffect());  // module body evaluated
      assert.equal(4, definedModule.d);  // define does exports
      assert.equal('A', definedModule.a);  // define does imports
      done();
    }).catch(done);
  });

  test('Loader.define.Fail', function(done) {
    var name = System.normalize('./test_define.js');
    getLoader().import('./side-effect.js', {}).then(function(mod) {
      var src = 'syntax error';
      getLoader().define(name, src, {}).then(function() {
          fail('should not have succeeded');
          done();
        }, function(error) {
          assert(error);
          done();
        });
    }).catch(done);
  });

  test('Loader.defineWithSourceMap', function(done) {
    var normalizedName = System.normalize('./test_define_with_source_map.js');
    var loader = getLoader();
    var metadata = {traceurOptions: {sourceMaps: true}};
    var src = 'export {name as a} from \'./test_a.js\';\nexport var d = 4;\n';
    loader.define(normalizedName, src, {metadata: metadata}).then(function() {
      var sourceMap = loader.getSourceMap(normalizedName);
      assert(sourceMap, normalizedName + ' has a sourceMap');
      var SourceMapConsumer = traceur.outputgeneration.SourceMapConsumer;
      var consumer = new SourceMapConsumer(sourceMap);
      var sourceContent = consumer.sourceContentFor(normalizedName);
      assert.equal(sourceContent, src, 'the sourceContent is correct');
      done();
    }).catch(done);
  });

  test('System.semverMap', function() {
    var semVerRegExp = System.semVerRegExp_();
    var m = semVerRegExp.exec('1.2.3-a.b.c.5.d.100');
    assert.equal(1, m[1]);
    assert.equal(2, m[2]);
    m = semVerRegExp.exec('1.2.X');
    assert(!m);
    m = semVerRegExp.exec('Any');
    assert(!m);

    var version = System.map['traceur'];
    assert(version);
    // This test must be updated if the major or minor version number changes.
    // If the change is intended, this is a reminder to update the documentation.
    assert.equal(version, System.map['traceur@0']);
    assert.equal(version, System.map['traceur@0.0']);
  });

  test('System.map', function() {
    System.map = System.semverMap('traceur@0.0.13/src/runtime/System.js');
    var version = System.map['traceur'];
    var remapped = System.normalize('traceur@0.0/src/runtime/System.js');
    var versionSegment = remapped.split('/')[0];
    assert.equal(version, versionSegment);
  });

  test('System.applyMap', function() {
    var originalMap = System.map;
    System.map['tests/contextual'] = {
      maptest: 'tests/contextual-map-dep'
    };
    var contexualRemap = System.normalize('maptest', 'tests/contextual');
    assert.equal('tests/contextual-map-dep', contexualRemap);
    // prefix must match up to segment delimiter '/'
    System.map = {
      jquery: 'jquery@2.0.0'
    };
    var remap = System.normalize('jquery-ui');
    assert.equal('jquery-ui', remap);
    System.map = originalMap;
  });

  test('AnonModuleSourceMap', function(done) {
    var src = "  import {name} from './test_a.js';";

    var loader = getLoader();
    traceur.options.sourceMaps = true;

    loader.module(src, {}).then(function (mod) {
      // TODO(jjb): where is the test that the source map exists?
      assert(mod);
      done();
    }).catch(done);
  });

  test('System.hookAPI', function(done) {
    // TODO(jjb): should be global System.
    var System = getLoader();

    // API testing only, function testing in Loader tests.
    var load = {
      metadata: {},
      normalizedName: System.normalize('./test_module.js')
    };

    var url = load.address = System.locate(load);
    assert(/test\/unit\/runtime\/test_module.js$/.test(url));
    System.fetch(load).then(function(text) {
      assert.typeOf(text, 'string');
      load.source = text;
      return load;
    }).then(System.translate.bind(System)).then(function(source) {
      assert.equal(source, load.source);
      return load;
    }).then(System.instantiate.bind(System)).then(function(nada) {
      assert.typeOf(nada, 'undefined');
      done();
    }).catch(done);
  });


});
