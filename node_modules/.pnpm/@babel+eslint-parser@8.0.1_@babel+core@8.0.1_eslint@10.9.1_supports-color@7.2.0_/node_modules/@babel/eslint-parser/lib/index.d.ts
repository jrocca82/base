import { Linter, AST, ESLint } from 'eslint';

declare const meta: ESLint.ObjectMetaProperties["meta"];
declare function parse(code: string, options?: Linter.ParserOptions): AST.Program;
declare function parseForESLint(code: string, options?: Linter.ParserOptions): Linter.ESLintParseResult;
declare const _default: {
    meta: {
        name?: string | undefined;
        version?: string | undefined;
    };
    parse: typeof parse;
    parseForESLint: typeof parseForESLint;
};

export { _default as default, meta, parse, parseForESLint };
