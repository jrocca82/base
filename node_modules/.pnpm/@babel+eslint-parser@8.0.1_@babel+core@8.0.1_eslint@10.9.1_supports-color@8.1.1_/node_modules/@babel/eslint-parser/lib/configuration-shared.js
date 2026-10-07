import path from 'node:path';
import { Worker, SHARE_ENV, MessageChannel, receiveMessageOnPort } from 'node:worker_threads';
import { ESLint } from 'eslint';
import { KEYS } from 'eslint-visitor-keys';
import { types, tokTypes, loadPartialConfigAsync } from '@babel/core';

const ACTIONS = {
  MAYBE_PARSE: "MAYBE_PARSE"
};
class Client {
  #send;
  constructor(send) {
    this.#send = send;
  }
  maybeParse(code, options) {
    return this.#send(ACTIONS.MAYBE_PARSE, {
      code,
      options
    });
  }
}
class WorkerClient extends Client {
  #worker = new Worker(path.resolve(import.meta.dirname, "../lib/worker/index.js"), {
    env: SHARE_ENV
  });
  constructor() {
    super((action, payload) => {
      const signal = new Int32Array(new SharedArrayBuffer(8));
      const subChannel = new MessageChannel();
      this.#worker.postMessage({
        signal,
        port: subChannel.port1,
        action,
        payload
      }, [subChannel.port1]);
      Atomics.wait(signal, 0, 0);
      const {
        message
      } = receiveMessageOnPort(subChannel.port2);
      if (message.error) throw Object.assign(message.error, message.errorData);else return message.result;
    });
    this.#worker.unref();
  }
}

function convertToken(token, source, tl) {
  const {
    type
  } = token;
  const {
    label
  } = type;
  const newToken = token;
  newToken.range = [token.start, token.end];
  if (label === tl.name) {
    const tokenValue = token.value;
    if (tokenValue === "let" || tokenValue === "static" || tokenValue === "yield") {
      newToken.type = "Keyword";
    } else {
      newToken.type = "Identifier";
    }
  } else if (label === tl.semi || label === tl.comma || label === tl.parenL || label === tl.parenR || label === tl.braceL || label === tl.braceR || label === tl.slash || label === tl.dot || label === tl.bracketL || label === tl.bracketR || label === tl.ellipsis || label === tl.arrow || label === tl.pipeline || label === tl.star || label === tl.incDec || label === tl.colon || label === tl.question || label === tl.template || label === tl.backQuote || label === tl.dollarBraceL || label === tl.at || label === tl.logicalOR || label === tl.logicalAND || label === tl.nullishCoalescing || label === tl.bitwiseOR || label === tl.bitwiseXOR || label === tl.bitwiseAND || label === tl.equality || label === tl.relational || label === tl.bitShift || label === tl.plusMin || label === tl.modulo || label === tl.exponent || label === tl.bang || label === tl.tilde || label === tl.doubleColon || label === tl.hash || label === tl.questionDot || label === tl.braceHashL || label === tl.braceBarL || label === tl.braceBarR || label === tl.bracketHashL || label === tl.bracketBarL || label === tl.bracketBarR || label === tl.doubleCaret || label === tl.doubleAt || type.isAssign) {
    newToken.type = "Punctuator";
    newToken.value ??= label;
  } else if (label === tl.jsxTagStart) {
    newToken.type = "Punctuator";
    newToken.value = "<";
  } else if (label === tl.jsxTagEnd) {
    newToken.type = "Punctuator";
    newToken.value = ">";
  } else if (label === tl.jsxName) {
    newToken.type = "JSXIdentifier";
  } else if (label === tl.jsxText) {
    newToken.type = "JSXText";
  } else if (type.keyword === "null") {
    newToken.type = "Null";
  } else if (type.keyword === "false" || type.keyword === "true") {
    newToken.type = "Boolean";
  } else if (type.keyword) {
    newToken.type = "Keyword";
  } else if (label === tl.num) {
    newToken.type = "Numeric";
    newToken.value = source.slice(token.start, token.end);
  } else if (label === tl.string) {
    newToken.type = "String";
    newToken.value = source.slice(token.start, token.end);
  } else if (label === tl.regexp) {
    newToken.type = "RegularExpression";
    const value = token.value;
    newToken.regex = {
      pattern: value.pattern,
      flags: value.flags
    };
    newToken.value = `/${value.pattern}/${value.flags}`;
  } else if (label === tl.bigint) {
    newToken.type = "Numeric";
    newToken.value = `${token.value}n`;
  } else if (label === tl.privateName) {
    newToken.type = "PrivateIdentifier";
  } else if (label === tl.templateNonTail || label === tl.templateTail || label === tl.Template) {
    newToken.type = "Template";
  }
  return newToken;
}
function convertTokens(tokens, code, tokLabels) {
  const result = [];
  const templateTypeMergedTokens = tokens;
  for (let i = 0, {
      length
    } = templateTypeMergedTokens; i < length - 1; i++) {
    const token = templateTypeMergedTokens[i];
    const tokenType = token.type;
    if (tokenType === "CommentLine" || tokenType === "CommentBlock") {
      continue;
    }
    result.push(convertToken(token, code, tokLabels));
  }
  return result;
}

function convertComments(comments) {
  for (const comment of comments) {
    comment.type = comment.type === "CommentBlock" ? "Block" : "Line";
    comment.range ||= [comment.start, comment.end];
  }
}

const eslintVersion = parseInt(ESLint.version, 10);

function* it(children) {
  if (Array.isArray(children)) yield* children;else yield children;
}
function traverse(node, visitorKeys, visitor) {
  const {
    type
  } = node;
  if (!type) return;
  const keys = visitorKeys[type];
  if (!keys) return;
  for (const key of keys) {
    for (const child of it(node[key])) {
      if (child && typeof child === "object") {
        visitor.enter(child);
        traverse(child, visitorKeys, visitor);
        visitor.exit(child);
      }
    }
  }
}
const convertNodesVisitor = {
  enter(node) {
    if (node.innerComments) {
      delete node.innerComments;
    }
    if (node.trailingComments) {
      delete node.trailingComments;
    }
    if (node.leadingComments) {
      delete node.leadingComments;
    }
  },
  exit(node) {
    if (node.extra) {
      delete node.extra;
    }
    if (node.loc.identifierName) {
      delete node.loc.identifierName;
    }
    if (node.type === "TypeParameter") {
      node.type = "Identifier";
      node.typeAnnotation = node.bound;
      delete node.bound;
    }
    if (node.type === "QualifiedTypeIdentifier") {
      delete node.id;
    }
    if (node.type === "ObjectTypeProperty") {
      delete node.key;
    }
    if (node.type === "ObjectTypeIndexer") {
      delete node.id;
    }
    if (node.type === "FunctionTypeParam") {
      delete node.name;
    }
    if (node.type === "ImportDeclaration") {
      delete node.isType;
    }
    if (node.type === "TemplateLiteral" || node.type === "TSTemplateLiteralType") {
      for (let i = 0; i < node.quasis.length; i++) {
        const q = node.quasis[i];
        q.range[0] -= 1;
        if (q.tail) {
          q.range[1] += 1;
        } else {
          q.range[1] += 2;
        }
        q.loc.start.column -= 1;
        if (q.tail) {
          q.loc.end.column += 1;
        } else {
          q.loc.end.column += 2;
        }
        q.start -= 1;
        if (q.tail) {
          q.end += 1;
        } else {
          q.end += 2;
        }
      }
    }
  }
};
function convertNodes(ast, visitorKeys) {
  traverse(ast, visitorKeys, convertNodesVisitor);
}
function convertProgramNode(ast) {
  const body = ast.program.body;
  Object.assign(ast, {
    type: "Program",
    sourceType: ast.program.sourceType,
    body
  });
  delete ast.program;
  delete ast.errors;
  if (eslintVersion < 10) {
    if (ast.comments.length) {
      const lastComment = ast.comments[ast.comments.length - 1];
      if (ast.tokens.length) {
        const lastToken = ast.tokens[ast.tokens.length - 1];
        if (lastComment.end > lastToken.end) {
          ast.range[1] = lastToken.end;
          ast.loc.end.line = lastToken.loc.end.line;
          ast.loc.end.column = lastToken.loc.end.column;
          ast.end = lastToken.end;
        }
      }
    } else {
      if (!ast.tokens.length) {
        ast.loc.start.line = 1;
        ast.loc.end.line = 1;
      }
    }
    if (body?.length) {
      ast.loc.start.line = body[0].loc.start.line;
      ast.range[0] = body[0].start;
      ast.start = body[0].start;
    }
  }
}
function convertAST(ast, visitorKeys) {
  convertNodes(ast, visitorKeys);
  convertProgramNode(ast);
}

function convertFile(ast, code, tokLabels, visitorKeys) {
  ast.tokens = convertTokens(ast.tokens, code, tokLabels);
  convertComments(ast.comments);
  convertAST(ast, visitorKeys);
  return ast;
}
function convertError(err) {
  if (err instanceof SyntaxError) {
    err.lineNumber = err.loc.line;
    err.column = err.loc.column;
  }
  return err;
}

let visitorKeys;
function getVisitorKeys() {
  if (!visitorKeys) {
    const newTypes = {
      ChainExpression: KEYS.ChainExpression,
      ImportExpression: KEYS.ImportExpression,
      Literal: KEYS.Literal,
      MethodDefinition: ["decorators"].concat(KEYS.MethodDefinition),
      Property: ["decorators"].concat(KEYS.Property),
      PropertyDefinition: ["decorators", "typeAnnotation"].concat(KEYS.PropertyDefinition)
    };
    const conflictTypes = {
      ExportAllDeclaration: KEYS.ExportAllDeclaration
    };
    visitorKeys = {
      ...newTypes,
      ...types.VISITOR_KEYS,
      ...conflictTypes
    };
  }
  return visitorKeys;
}
let tokLabels;
function getTokLabels() {
  return tokLabels ||= Object.fromEntries(Object.entries(tokTypes).map(([key, tok]) => [key, tok.label]));
}

function getParserPlugins(babelOptions) {
  const babelParserPlugins = babelOptions.parserOpts?.plugins ?? [];
  const estreeOptions = {
    classFeatures: true
  };
  for (const plugin of babelParserPlugins) {
    if (Array.isArray(plugin) && plugin[0] === "estree") {
      Object.assign(estreeOptions, plugin[1]);
      break;
    }
  }
  return [["estree", estreeOptions], ...babelParserPlugins];
}
function normalizeParserOptions(options) {
  return {
    sourceType: options.sourceType,
    filename: options.filePath,
    ...options.babelOptions,
    parserOpts: {
      ...(options.sourceType !== "commonjs" ? {
        allowReturnOutsideFunction: options.ecmaFeatures?.globalReturn ?? false
      } : {}),
      ...options.babelOptions.parserOpts,
      plugins: getParserPlugins(options.babelOptions),
      attachComment: false,
      ranges: true,
      tokens: true
    },
    caller: {
      name: "@babel/eslint-parser",
      ...options.babelOptions.caller
    }
  };
}
function validateResolvedConfig(config, options, parseOptions) {
  if (config !== null) {
    if (options.requireConfigFile !== false) {
      if (!config.hasFilesystemConfig()) {
        let error = `No Babel config file detected for ${config.options.filename}. Either disable config file checking with requireConfigFile: false, or configure Babel so that it can find the config files.`;
        if (config.options.filename.includes("node_modules")) {
          error += `\nIf you have a .babelrc.js file or use package.json#babel, keep in mind that it's not used when parsing dependencies. If you want your config to be applied to your whole app, consider using babel.config.js or babel.config.json instead.`;
        }
        throw new Error(error);
      }
    }
    if (config.options) return config.options;
  }
  return getDefaultParserOptions(parseOptions);
}
function getDefaultParserOptions(options) {
  return {
    plugins: [],
    ...options,
    babelrc: false,
    configFile: false,
    ignore: undefined,
    only: undefined
  };
}
async function normalizeBabelParseConfig(options) {
  const parseOptions = normalizeParserOptions(options);
  const config = await loadPartialConfigAsync(parseOptions);
  return validateResolvedConfig(config, options, parseOptions);
}

export { ACTIONS, WorkerClient, convertError, convertFile, getParserPlugins, getTokLabels, getVisitorKeys, normalizeBabelParseConfig };
//# sourceMappingURL=configuration-shared.js.map
