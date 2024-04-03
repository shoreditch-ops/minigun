const { test, beforeEach, afterEach } = require('tap');
const { runGenericRunnerTest } = require('./helper');
const createTestServer = require('../../targets/simple_socketio');

let server;
let port;
beforeEach(async () => {
  server = createTestServer().listen(0, function () {
    port = server.address().port;
  });
});

afterEach(() => {
  server.close();
});

test('generic socketio test works', (t) => {
  const script = require('../../scripts/hello_socketio.json');
  script.config.target = `http://127.0.0.1:${port}`;

  runGenericRunnerTest(script, t);
});
