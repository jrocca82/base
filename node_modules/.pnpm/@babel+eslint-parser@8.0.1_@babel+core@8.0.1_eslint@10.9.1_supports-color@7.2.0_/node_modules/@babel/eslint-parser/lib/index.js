import { types, version } from '@babel/core';
import * as eslintScope from 'eslint-scope';
import { getKeys } from 'eslint-visitor-keys';
import semver from 'semver';
import { getParserPlugins, convertFile, getTokLabels, getVisitorKeys, convertError, WorkerClient } from './configuration-shared.js';
import { createRequire } from 'node:module';

function normalizeESLintConfig(options) {
  const {
    babelOptions = {},
    ecmaVersion = "latest",
    sourceType = "module",
    requireConfigFile = true,
    ...otherOptions
  } = options;
  return {
    babelOptions: {
      cwd: process.cwd(),
      ...babelOptions,
      browserslistConfigFile: false
    },
    ecmaVersion: ecmaVersion === "latest" ? 1e8 : ecmaVersion,
    sourceType,
    requireConfigFile,
    ...otherOptions
  };
}

const {
  Definition,
  PatternVisitor: OriginalPatternVisitor,
  Referencer: OriginalReferencer,
  Scope,
  ScopeManager
} = eslintScope;
let visitorKeysMap;
function getVisitorValues(nodeType) {
  if (visitorKeysMap) return visitorKeysMap[nodeType];
  const flowFlippedAliasKeys = new Set(types.FLIPPED_ALIAS_KEYS.Flow.concat(["ArrayPattern", "ClassDeclaration", "ClassExpression", "FunctionDeclaration", "FunctionExpression", "Identifier", "ObjectPattern", "RestElement"]));
  visitorKeysMap = Object.entries(types.VISITOR_KEYS).reduce((acc, [key, value]) => {
    if (!flowFlippedAliasKeys.has(value)) {
      acc[key] = value;
    }
    return acc;
  }, {});
  return visitorKeysMap[nodeType];
}
const propertyTypes = {
  callProperties: {
    type: "loop",
    values: ["value"]
  },
  indexers: {
    type: "loop",
    values: ["key", "value"]
  },
  properties: {
    type: "loop",
    values: ["argument", "value"]
  },
  types: {
    type: "loop"
  },
  params: {
    type: "loop"
  },
  argument: {
    type: "single"
  },
  elementType: {
    type: "single"
  },
  qualification: {
    type: "single"
  },
  rest: {
    type: "single"
  },
  returnType: {
    type: "single"
  },
  typeAnnotation: {
    type: "typeAnnotation"
  },
  typeParameters: {
    type: "typeParameters"
  },
  id: {
    type: "id"
  }
};
class PatternVisitor extends OriginalPatternVisitor {
  ArrayPattern(node) {
    node.elements.forEach(this.visit, this);
  }
  ObjectPattern(node) {
    node.properties.forEach(this.visit, this);
  }
}
class Referencer extends OriginalReferencer {
  constructor(options, scopeManager) {
    super(options, scopeManager);
  }
  visitPattern(node, options, callback) {
    if (!node) {
      return;
    }
    this._checkIdentifierOrVisit(node.typeAnnotation);
    if (node.type === "AssignmentPattern") {
      this._checkIdentifierOrVisit(node.left.typeAnnotation);
    }
    if (typeof options === "function") {
      callback = options;
      options = {
        processRightHandNodes: false
      };
    }
    const visitor = new PatternVisitor(this.options, node, callback);
    visitor.visit(node);
    if (options.processRightHandNodes) {
      visitor.rightHandNodes.forEach(this.visit, this);
    }
  }
  visitClass(node) {
    this._visitArray(node.decorators);
    const typeParamScope = this._nestTypeParamScope(node);
    this._visitTypeAnnotation(node.implements);
    this._visitTypeAnnotation(node.superTypeArguments?.params);
    super.visitClass(node);
    if (typeParamScope) {
      this.close(node);
    }
  }
  visitFunction(node) {
    const typeParamScope = this._nestTypeParamScope(node);
    this._checkIdentifierOrVisit(node.returnType);
    super.visitFunction(node);
    if (typeParamScope) {
      this.close(node);
    }
  }
  visitProperty(node) {
    if (node.value?.type === "TypeCastExpression") {
      this._visitTypeAnnotation(node.value);
    }
    this._visitArray(node.decorators);
    super.visitProperty(node);
  }
  InterfaceDeclaration(node) {
    this._createScopeVariable(node, node.id);
    const typeParamScope = this._nestTypeParamScope(node);
    this._visitArray(node.extends);
    this.visit(node.body);
    if (typeParamScope) {
      this.close(node);
    }
  }
  TypeAlias(node) {
    this._createScopeVariable(node, node.id);
    const typeParamScope = this._nestTypeParamScope(node);
    this.visit(node.right);
    if (typeParamScope) {
      this.close(node);
    }
  }
  AccessorProperty(node) {
    this._visitClassProperty(node);
  }
  PropertyDefinition(node) {
    this._visitClassProperty(node);
  }
  DeclareModule(node) {
    this._visitDeclareX(node);
  }
  DeclareFunction(node) {
    this._visitDeclareX(node);
  }
  DeclareVariable(node) {
    this._visitDeclareX(node);
  }
  DeclareClass(node) {
    this._visitDeclareX(node);
  }
  _visitClassProperty(node) {
    const {
      computed,
      key,
      typeAnnotation,
      decorators,
      value
    } = node;
    this._visitArray(decorators);
    if (computed) this.visit(key);
    this._visitTypeAnnotation(typeAnnotation);
    if (value) {
      this.scopeManager.__nestClassFieldInitializerScope(value);
      this.visit(value);
      this.close(value);
    }
  }
  _visitDeclareX(node) {
    if (node.id) {
      this._createScopeVariable(node, node.id);
    }
    const typeParamScope = this._nestTypeParamScope(node);
    if (typeParamScope) {
      this.close(node);
    }
  }
  _createScopeVariable(node, name) {
    this.currentScope().variableScope.__define(name, new Definition("Variable", name, node));
  }
  _nestTypeParamScope(node) {
    if (!node.typeParameters) {
      return null;
    }
    const parentScope = this.scopeManager.__currentScope;
    const scope = new Scope(this.scopeManager, "type-parameters", parentScope, node, false);
    this.scopeManager.__nestScope(scope);
    for (let j = 0; j < node.typeParameters.params.length; j++) {
      const name = node.typeParameters.params[j];
      scope.__define(name, new Definition("TypeParameter", name, name));
      if (name.typeAnnotation) {
        this._checkIdentifierOrVisit(name);
      }
    }
    scope.__define = parentScope.__define.bind(parentScope);
    return scope;
  }
  _visitTypeAnnotation(node) {
    if (!node) {
      return;
    }
    if (Array.isArray(node)) {
      node.forEach(this._visitTypeAnnotation, this);
      return;
    }
    const visitorValues = getVisitorValues(node.type);
    if (!visitorValues) {
      return;
    }
    for (let i = 0; i < visitorValues.length; i++) {
      const visitorValue = visitorValues[i];
      const propertyType = propertyTypes[visitorValue];
      const nodeProperty = node[visitorValue];
      if (propertyType == null || nodeProperty == null) {
        continue;
      }
      if (propertyType.type === "loop") {
        for (let j = 0; j < nodeProperty.length; j++) {
          if (Array.isArray(propertyType.values)) {
            for (let k = 0; k < propertyType.values.length; k++) {
              const loopPropertyNode = nodeProperty[j][propertyType.values[k]];
              if (loopPropertyNode) {
                this._checkIdentifierOrVisit(loopPropertyNode);
              }
            }
          } else {
            this._checkIdentifierOrVisit(nodeProperty[j]);
          }
        }
      } else if (propertyType.type === "single") {
        this._checkIdentifierOrVisit(nodeProperty);
      } else if (propertyType.type === "typeAnnotation") {
        this._visitTypeAnnotation(node.typeAnnotation);
      } else if (propertyType.type === "typeParameters") {
        for (let l = 0; l < node.typeParameters.params.length; l++) {
          this._checkIdentifierOrVisit(node.typeParameters.params[l]);
        }
      } else if (propertyType.type === "id") {
        if (node.id.type === "Identifier") {
          this._checkIdentifierOrVisit(node.id);
        } else {
          this._visitTypeAnnotation(node.id);
        }
      }
    }
  }
  _checkIdentifierOrVisit(node) {
    if (node?.typeAnnotation) {
      this._visitTypeAnnotation(node.typeAnnotation);
    } else if (node?.type === "Identifier") {
      this.visit(node);
    } else {
      this._visitTypeAnnotation(node);
    }
  }
  _visitArray(nodeList) {
    if (nodeList) {
      for (const node of nodeList) {
        this.visit(node);
      }
    }
  }
}
function analyzeScope(ast, parserOptions) {
  const options = {
    ignoreEval: true,
    optimistic: false,
    directive: false,
    nodejsScope: ast.sourceType === "script" && parserOptions.ecmaFeatures?.globalReturn === true,
    impliedStrict: false,
    sourceType: ast.sourceType,
    ecmaVersion: parserOptions.ecmaVersion,
    fallback: getKeys,
    childVisitorKeys: types.VISITOR_KEYS
  };
  const scopeManager = new ScopeManager(options);
  const referencer = new Referencer(options, scopeManager);
  referencer.visit(ast);
  return scopeManager;
}

const require$1 = createRequire(import.meta.url);
const babelParser = require$1(require$1.resolve("@babel/parser", {
  paths: [require$1.resolve("@babel/core/package.json")]
}));
let isRunningMinSupportedCoreVersion = null;
let client;
function parse$1(code, options) {
  const minSupportedCoreVersion = "^7.2.0 || ^8.0.0";
  if (typeof isRunningMinSupportedCoreVersion !== "boolean") {
    isRunningMinSupportedCoreVersion = semver.satisfies(version, minSupportedCoreVersion);
  }
  if (!isRunningMinSupportedCoreVersion) {
    throw new Error(`@babel/eslint-parser@${"8.0.1"} does not support @babel/core@${version}. Please upgrade to @babel/core@${minSupportedCoreVersion}.`);
  }
  if (options.babelOptions.babelrc === false && options.babelOptions.configFile === false) {
    const parserOpts = {
      sourceType: options.sourceType,
      sourceFilename: options.filePath,
      ...(options.sourceType !== "commonjs" ? {
        allowReturnOutsideFunction: options.ecmaFeatures?.globalReturn ?? false
      } : {}),
      ...options.babelOptions.parserOpts,
      plugins: getParserPlugins(options.babelOptions),
      attachComment: false,
      ranges: true,
      tokens: true
    };
    try {
      return convertFile(babelParser.parse(code, parserOpts), code, getTokLabels(), getVisitorKeys());
    } catch (err) {
      throw convertError(err);
    }
  }
  client ??= new WorkerClient();
  const {
    ast,
    parserOptions
  } = client.maybeParse(code, options);
  if (ast) return ast;
  try {
    return convertFile(babelParser.parse(code, parserOptions), code, getTokLabels(), getVisitorKeys());
  } catch (err) {
    throw convertError(err);
  }
}

const meta = {
  name: "@babel/eslint-parser",
  version: "8.0.1"
};
function parse(code, options = {}) {
  return parse$1(code, normalizeESLintConfig(options));
}
function parseForESLint(code, options = {}) {
  const normalizedOptions = normalizeESLintConfig(options);
  const ast = parse$1(code, normalizedOptions);
  const scopeManager = analyzeScope(ast, normalizedOptions);
  return {
    ast,
    scopeManager,
    visitorKeys: getVisitorKeys()
  };
}
const index = {
  meta,
  parse,
  parseForESLint
};

export { index as default, meta, parse, parseForESLint };
//# sourceMappingURL=index.js.map
