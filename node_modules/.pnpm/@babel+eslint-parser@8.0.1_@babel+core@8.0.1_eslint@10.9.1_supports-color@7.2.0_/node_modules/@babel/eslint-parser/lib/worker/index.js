import { parentPort } from 'node:worker_threads';
import { createConfigItemAsync, parseAsync } from '@babel/core';
import { convertError, convertFile, getVisitorKeys, getTokLabels, ACTIONS, normalizeBabelParseConfig } from '../configuration-shared.js';

function extractParserOptionsPlugin() {
  return {
    parserOverride(code, opts) {
      return opts;
    }
  };
}

const ref = {};
let extractParserOptionsConfigItem;
const MULTIPLE_OVERRIDES = /More than one plugin attempted to override parsing/;
async function maybeParse(code, options) {
  if (!extractParserOptionsConfigItem) {
    extractParserOptionsConfigItem = await createConfigItemAsync([extractParserOptionsPlugin, ref], {
      dirname: import.meta.dirname,
      type: "plugin"
    });
  }
  const {
    plugins
  } = options;
  options.plugins = plugins.concat(extractParserOptionsConfigItem);
  let ast;
  try {
    return {
      parserOptions: await parseAsync(code, options),
      ast: null
    };
  } catch (err) {
    if (!MULTIPLE_OVERRIDES.test(err.message)) {
      throw err;
    }
  }
  options.plugins = plugins;
  try {
    ast = await parseAsync(code, options);
  } catch (err) {
    throw convertError(err);
  }
  return {
    ast: convertFile(ast, code, getTokLabels(), getVisitorKeys()),
    parserOptions: null
  };
}

async function handleMessage(action, payload) {
  switch (action) {
    case ACTIONS.MAYBE_PARSE:
      return await maybeParse(payload.code, await normalizeBabelParseConfig(payload.options));
  }
}

parentPort.addListener("message", async ({
  signal,
  port,
  action,
  payload
}) => {
  let response;
  try {
    response = {
      result: await handleMessage(action, payload)
    };
  } catch (error) {
    response = {
      error,
      errorData: {
        ...error
      }
    };
  }
  try {
    port.postMessage(response);
  } catch {
    port.postMessage({
      error: new Error("Cannot serialize worker response")
    });
  } finally {
    port.close();
    Atomics.store(signal, 0, 1);
    Atomics.notify(signal, 0);
  }
});
//# sourceMappingURL=index.js.map
