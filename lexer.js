/*
LEXER - Stage 1 of the compilation

ROLE : Takes raw source code and breaks it into a list of TOKEN objects. Each token has:
    type  – category (KEYWORD, IDENTIFIER etc)
    value – exact text from the source code
    line  – line number
    col   – column number
    
LiteLang supports:
  1. int / float / bool / string types
  2. let / const / var declarations
  3. if / else / while / for
  4. true / false literals
  5. arithmetic: + - * / %
  6. comparison: == != < > <= >=
  7. logical: && || !
  8. assignment: = += -= *= /= %=
  9. blocks: { }  parenthesis: ( )  semicolons: ;  commas: ,
  10. line comments and block comments
*/

// Token type constants
const TT = {
  KEYWORD:      'KEYWORD',
  BOOLEAN:      'BOOLEAN',
  IDENTIFIER:   'IDENTIFIER',
  INT_LIT:      'INT_LITERAL',
  FLOAT_LIT:    'FLOAT_LITERAL',
  STRING_LIT:   'STRING_LITERAL',
  ASSIGN:       'ASSIGNMENT OP',
  COMPOUND_ASSIGNMENT: 'COMPOUND_ASSIGNMENT',  // +=  -=  etc
  ADDITION_OP:         'ADDITION_OP',
  SUBTRACTION_OP:        'SUBTRACTION_OP',
  MULTIPLICATION_OP:         'MULTIPLICATION_OP',
  DIVISION_OP:        'DIVISION_OP',
  MODULO_OP:      'MODULO_OP',
  EQ:           'EQ',      // ==
  NEQ:          'NEQ',     // !=
  LT:           'LT',      // <
  GT:           'GT',      // >
  LTE:          'LTE',     // <=
  GTE:          'GTE',     // >=
  AND:          'AND',     // &&
  OR:           'OR',      // ||
  NOT:          'NOT',     // !
  LPAREN:       'LPAREN',  // (
  RPAREN:       'RPAREN',  // )
  LBRACE:       'LBRACE',  // {
  RBRACE:       'RBRACE',  // }
  SEMICOLON:    'SEMICOLON',
  COMMA:        'COMMA',
  EOF:          'EOF',
  ERROR:        'ERROR',
};

// Keywords
const KEYWORDS = new Set([
  'int', 'float', 'bool', 'string',
  'let', 'const', 'var',
  'if', 'else', 'while', 'for', 'break', 'continue', 'return',
  'print',
]);
// Main tokenize function
/**
 * tokenize(source)
 *   @param {string} source  Raw LiteLang source code
 *   @returns {Token[]}      Array of token objects
 */
function tokenize(source) {
  const tokens = [];
  let i    = 0;   // current position in source
  let line = 1;   // current line
  let col  = 1;   // current column
  // build a token and add it to the list
  function add(type, value, startPos) {
    tokens.push({ type, value, line, col: col - value.length, start: startPos, end: i });
  }
  // move one character
  function advance() {
    if (source[i] === '\n') { line++; col = 1; }
    else { col++; }
    i++;
  }
  // scanning loop
  while (i < source.length) {
    // Skip whitespace
    if (/\s/.test(source[i])) {
      advance();
      continue;
    }
    // Skip // line comments
    if (source[i] === '/' && source[i + 1] === '/') {
      while (i < source.length && source[i] !== '\n') advance();
      continue;
    }
    // Skip /* block comments */
    if (source[i] === '/' && source[i + 1] === '*') {
      advance(); advance(); // skip /*
      while (i < source.length) {
        if (source[i] === '*' && source[i + 1] === '/') {
          advance(); advance(); // skip */
          break;
        }
        advance();
      }
      continue;
    }
    const start = i;
    // String literals
    if (source[i] === '"' || source[i] === "'") {
      const quote = source[i];
      advance(); // skip opening quote
      let str = '';
      while (i < source.length && source[i] !== quote) {
        if (source[i] === '\\') advance(); // skip escape character
        str += source[i];
        advance();
      }
      advance(); // skip closing quote
      tokens.push({ type: TT.STRING_LIT, value: str, line, col: col - str.length - 2, start, end: i });
      continue;
    }
    // Numbers
    if (/[0-9]/.test(source[i]) || (source[i] === '.' && /[0-9]/.test(source[i + 1]))) {
      let num = '';
      let isFloat = false;
      while (i < source.length && /[0-9]/.test(source[i])) { num += source[i]; advance(); }
      if (i < source.length && source[i] === '.' && /[0-9]/.test(source[i + 1])) {
        isFloat = true;
        num += source[i]; advance();
        while (i < source.length && /[0-9]/.test(source[i])) { num += source[i]; advance(); }
      }
      // scientific notation, example - 1.5e10
      if (i < source.length && (source[i] === 'e' || source[i] === 'E')) {
        isFloat = true;
        num += source[i]; advance();
        if (i < source.length && (source[i] === '+' || source[i] === '-')) { num += source[i]; advance(); }
        while (i < source.length && /[0-9]/.test(source[i])) { num += source[i]; advance(); }
      }
      tokens.push({ type: isFloat ? TT.FLOAT_LIT : TT.INT_LIT, value: num, line, col: col - num.length, start, end: i });
      continue;
    }
    // Identifiers and keywords
    if (/[a-zA-Z_]/.test(source[i])) {
      let word = '';
      while (i < source.length && /[a-zA-Z0-9_]/.test(source[i])) { word += source[i]; advance(); }
      let type;
      if (word === 'true' || word === 'false') type = TT.BOOLEAN;
      else if (KEYWORDS.has(word))             type = TT.KEYWORD;
      else                                     type = TT.IDENTIFIER;
      tokens.push({ type, value: word, line, col: col - word.length, start, end: i });
      continue;
    }
    // Two-character operators
    const two = source.slice(i, i + 2);
    if (two === '==') { advance(); advance(); add(TT.EQ,  '==', start); continue; }
    if (two === '!=') { advance(); advance(); add(TT.NEQ, '!=', start); continue; }
    if (two === '<=') { advance(); advance(); add(TT.LTE, '<=', start); continue; }
    if (two === '>=') { advance(); advance(); add(TT.GTE, '>=', start); continue; }
    if (two === '&&') { advance(); advance(); add(TT.AND, '&&', start); continue; }
    if (two === '||') { advance(); advance(); add(TT.OR,  '||', start); continue; }
    if (two === '+=') { advance(); advance(); add(TT.COMPOUND_ASSIGN, '+=', start); continue; }
    if (two === '-=') { advance(); advance(); add(TT.COMPOUND_ASSIGN, '-=', start); continue; }
    if (two === '*=') { advance(); advance(); add(TT.COMPOUND_ASSIGN, '*=', start); continue; }
    if (two === '/=') { advance(); advance(); add(TT.COMPOUND_ASSIGN, '/=', start); continue; }
    if (two === '%=') { advance(); advance(); add(TT.COMPOUND_ASSIGN, '%=', start); continue; }
    // Single-character operators and punctuation
    const ch = source[i];
    const single = {
      '=': TT.ASSIGN,    '+': TT.PLUS,   '-': TT.MINUS,
      '*': TT.STAR,      '/': TT.SLASH,  '%': TT.MODULO_OP,
      '<': TT.LT,        '>': TT.GT,     '!': TT.NOT,
      '(': TT.LPAREN,    ')': TT.RPAREN,
      '{': TT.LBRACE,    '}': TT.RBRACE,
      ';': TT.SEMICOLON, ',': TT.COMMA,
    };
    if (single[ch]) {
      advance();
      add(single[ch], ch, start);
      continue;
    }
    // Unrecognised character
    tokens.push({ type: TT.ERROR, value: ch, line, col, start, end: i + 1 });
    advance();
  }
  // Always end with EOF (END OF FILE)
  tokens.push({ type: TT.EOF, value: '', line, col, start: i, end: i });

  return tokens;
}
// Export so other scripts can use
window.tokenize = tokenize;
window.TT       = TT;         
window.KEYWORDS = KEYWORDS;