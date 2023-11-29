'use strict';

const debug = require('debug')('plugin:publish-metrics:open-telemetry');

const {
  diag,
  DiagConsoleLogger,
  DiagLogLevel,
  context
} = require('@opentelemetry/api');
const { Resource } = require('@opentelemetry/resources');
const {
  SemanticResourceAttributes
} = require('@opentelemetry/semantic-conventions');

const {
  AsyncLocalStorageContextManager
} = require('@opentelemetry/context-async-hooks');
const contextManager = new AsyncLocalStorageContextManager();
contextManager.enable();
context.setGlobalContextManager(contextManager);

class OTelReporter {
  constructor(config, events, script) {
    this.config = config;
    this.script = script;
    this.events = events;
    this.engines = new Set();

    this.getEngines(this.script.scenarios || []);

    // DEBUGGING SETUP
    if (
      process.env.DEBUG &&
      process.env.DEBUG === 'plugin:publish-metrics:open-telemetry'
    ) {
      diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.ERROR);
    }

    // RESOURCES SETUP
    this.resource = Resource.default().merge(
      new Resource({
        [SemanticResourceAttributes.SERVICE_NAME]:
          config.serviceName || 'Artillery-test'
      })
    );

    // HANDLING METRICS
    if (config.metrics) {
      const { OTelMetricsReporter } = require('./metrics');
      this.metricReporter = new OTelMetricsReporter(
        config.metrics,
        this.events,
        this.resource
      );
    }

    // HANDLING TRACES
    if (config.traces) {
      // Shared tracing configuration
      const { OTelTraceConfig } = require('./trace-base');
      this.traceConfig = new OTelTraceConfig(config.traces, this.resource);
      this.traceConfig.configure();

      // Run HTTP engine tracing
      if (this.engines.has('http')) {
        const { OTelHTTPTraceReporter } = require('./trace-http');
        this.httpReporter = new OTelHTTPTraceReporter(config.traces, script);
        this.httpReporter.run();
      }

      // Run Playwright tracing
      if (this.engines.has('playwright')) {
        const { OTelPlaywrightTraceReporter } = require('./trace-playwright');
        this.playwrightReporter = new OTelPlaywrightTraceReporter(
          config.traces,
          script
        );
        this.playwrightReporter.run();
      }
    }
  }

  // Create set of all engines used in test -> even though we only support Playwright and HTTP engine for now this is future compatible
  getEngines(scenarios) {
    scenarios.forEach((scenario) => {
      scenario.engine
        ? this.engines.add(scenario.engine)
        : this.engines.add('http');
    });
  }

  async cleanup(done) {
    debug('Cleaning up');
    if (this.metricReporter) {
      await this.metricReporter.cleanup();
    }

    if (!this.httpReporter && !this.playwrightReporter) {
      return done();
    }
    if (this.httpReporter) {
      await this.httpReporter.cleanup();
    }
    if (this.playwrightReporter) {
      await this.playwrightReporter.cleanup();
    }
    await this.traceConfig.shutDown();
    return done();
  }
}

function createOTelReporter(config, events, script) {
  return new OTelReporter(config, events, script);
}

module.exports = {
  createOTelReporter
};
