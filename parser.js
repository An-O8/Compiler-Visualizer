/* PARSER : Stage 2 of the compilation process

Role: Takes the token list from the lexer and builds an Abstract Syntax Tree (AST). The AST is a tree of ASTNode
  objects that describes the program's structure.

Grammar:
 program     : START
 statement   : varDecl | assignment | ifStmt | whileStmt | printStmt | block | exprStmt
 varDecl     : (let|const|var|int|float|bool|string) IDENTIFIER = expression ;
 assignment  : IDENTIFIER = expression ; OR IDENTIFIER compoundOp expression ;
 ifStmt      : if-else block
 whileStmt   : while block
 forStmt     : for block
 printStmt   : print ( expression ) ;
 block       : { statement }
 exprStmt    : value | expression operator expression | !expression | (expression)
 value       : number | string | boolean | idemtifier
 type        : let | const | var | int | float | boolean | string
operator    : +  -  *  /  % | ==  !=  <  >  <=  >= | &&  ||

ASTNode : Every node in the tree is an ASTNode.
  type     – kind of node it is ("Program", "BinaryExpr" etc.)
  value    – 42, + , - etc.
  children – array of child ASTNodes
  line/col – source location (for error messages)
  start/end– character offsets (for editor highlighting)
 */
class ASTNode {
  constructor(type, value = null, children = [], line = 0, col = 0, start = 0, end = 0) {
    this.type     = type;
    this.value    = value;
    this.children = children;
    this.line     = line;
    this.col      = col;
    this.start    = start;
    this.end      = end;
  }
}
//Parser class
class Parser {
  constructor(tokens) {
        this.tokens = tokens.filter(t => t.type !== 'ERROR');
    this.pos    = 0;
    this.errors = [];   
  }
  // Look at the current token
  peek(offset = 0) {
    const idx = this.pos + offset;
    return this.tokens[idx] || { type: TT.EOF, value: '', line: 0, col: 0, start: 0, end: 0 };
  }
  // Check whether the current token type matches any of the given types
  check(...types) {
    return types.includes(this.peek().type);
  }
  // Consume the current token and return it
  advance() {
    const tok = this.peek();
    if (tok.type !== TT.EOF) this.pos++;
    return tok;
  }
  // Consume and return the token if it matches the expected type
  expect(type, value = null) {
    const tok = this.peek();
    const valMatch = value === null || tok.value === value;
    if (tok.type === type && valMatch) {
      return this.advance();
    }
    const msg = value
      ? `Expected '${value}' but got '${tok.value}'`
      : `Expected ${type} but got '${tok.value}'`;
    this.errors.push({ type: 'Parser Error', message: msg, line: tok.line, col: tok.col });
    // Return a dummy token so parsing can continue
    return { type, value: value || '', line: tok.line, col: tok.col, start: tok.start, end: tok.end };
  }
  parse() {
    const body = [];
    while (!this.check(TT.EOF)) {
      try {
        const stmt = this.parseStatement();
        if (stmt) body.push(stmt);
      } catch (err) {
        this.errors.push({ type: 'Parser Error', message: err.message || String(err), line: 0 });
        this.syncToSafePoint();
      }
    }
    const last = body[body.length - 1];
    return new ASTNode('Program', null, body, 1, 1, 0, last ? last.end : 0);
  }
  // Skip tokens until we reach a ; or } - used for error recovery
  syncToSafePoint() {
    while (!this.check(TT.EOF, TT.SEMICOLON, TT.RBRACE)) this.advance();
    if (this.check(TT.SEMICOLON)) this.advance();
  }
  //Statements
  parseStatement() {
    const tok = this.peek();
    if (tok.type === TT.EOF) return null;
    // { block }
    if (tok.type === TT.LBRACE) return this.parseBlock();
    // if statement
    if (tok.type === TT.KEYWORD && tok.value === 'if') return this.parseIf();
    // while statement
    if (tok.type === TT.KEYWORD && tok.value === 'while') return this.parseWhile();
    // for statement
    if (tok.type === TT.KEYWORD && tok.value === 'for') return this.parseFor();
    // print statement
    if (tok.type === TT.KEYWORD && tok.value === 'print') return this.parsePrint();
    // variable declaration
    const DECL_KW = ['let','const','var','int','float','bool','string'];
    if (tok.type === TT.KEYWORD && DECL_KW.includes(tok.value)) {
      return this.parseVarDecl();
    }
    //assignment
    if (tok.type === TT.IDENTIFIER &&
        (this.peek(1).type === TT.COMPOUND_ASSIGNMENT || 
         this.peek(1).type === TT.COMPOUND_ASSIGN ||
         this.peek(1).type === TT.ASSIGN)) {
     return this.parseAssignment();
    }
    // expression statement
    const expr = this.parseExpression();
    if (this.check(TT.SEMICOLON)) this.advance();
    return expr;
  }
  // { stmts...}
  parseBlock() {
    const open = this.expect(TT.LBRACE, '{');
    const body = [];
    while (!this.check(TT.RBRACE) && !this.check(TT.EOF)) {
      try {
        const s = this.parseStatement();
        if (s) body.push(s);
      } catch (err) {
        this.errors.push({ type: 'Parser Error', message: err.message || String(err), line: 0 });
        this.syncToSafePoint();
      }
    }
    const close = this.expect(TT.RBRACE, '}');
    return new ASTNode('Block', null, body, open.line, open.col, open.start, close.end);
  }
  // let / const / var / int / float / bool / string  name [= expr] ;
  parseVarDecl() {
    const kw   = this.advance();   // consume the type keyword
    const id   = this.expect(TT.IDENTIFIER);
    const idNode = new ASTNode('Identifier', id.value, [], id.line, id.col, id.start, id.end);
  // Optional initializer
    if (this.check(TT.ASSIGN)) {
      this.advance(); // consume '='
      const expr = this.parseExpression();
      this.expect(TT.SEMICOLON, ';');
      return new ASTNode('VarDecl', kw.value, [idNode, expr], kw.line, kw.col, kw.start, expr.end);
    }
    // No initializer - default to 0 / "" depending on type
    this.expect(TT.SEMICOLON, ';');
    const defaultVal = (kw.value === 'float') ? '0.0'
                     : (kw.value === 'bool')  ? 'false'
                     : (kw.value === 'string') ? '""'
                     : '0';
    const defNode = new ASTNode(
      kw.value === 'float' ? 'FloatLiteral' :
      kw.value === 'bool'  ? 'BoolLiteral'  :
      kw.value === 'string'? 'StringLiteral': 'IntLiteral',
      defaultVal, [], id.line, id.col, id.start, id.end
    );
    return new ASTNode('VarDecl', kw.value, [idNode, defNode], kw.line, kw.col, kw.start, id.end);
  }
  // name = expr ;   OR   name += expr ;
  parseAssignment() {
    const id  = this.advance(); // identifier
    const op  = this.advance(); // = or +=, -= etc
    const expr = this.parseExpression();
    this.expect(TT.SEMICOLON, ';');
    const idNode = new ASTNode('Identifier', id.value, [], id.line, id.col, id.start, id.end);
    // compound assign:  x += e  : Assignment(x, BinaryExpr(x + e))
    if (op.type === TT.COMPOUND_ASSIGNMENT) {
      const plainOp = op.value[0]; // '+', '-', '*', '/', '%'
      const loadId  = new ASTNode('Identifier', id.value, [], id.line, id.col, id.start, id.end);
      const binExpr = new ASTNode('BinaryExpr', plainOp, [loadId, expr], op.line, op.col, op.start, expr.end);
      return new ASTNode('Assignment', null, [idNode, binExpr], id.line, id.col, id.start, expr.end);
    }
    return new ASTNode('Assignment', null, [idNode, expr], id.line, id.col, id.start, expr.end);
  }
  // if-else block
  parseIf() {
    const kw = this.advance(); // if
    this.expect(TT.LPAREN, '(');
    const cond = this.parseExpression();
    this.expect(TT.RPAREN, ')');
    const then = this.parseBlock();
    let elseB  = null;
    if (this.peek().type === TT.KEYWORD && this.peek().value === 'else') {
      this.advance(); // consume 'else'
      elseB = this.peek().type === TT.KEYWORD && this.peek().value === 'if'
        ? this.parseIf()     // else if
        : this.parseBlock(); // else { }
    }
    const children = elseB ? [cond, then, elseB] : [cond, then];
    return new ASTNode('IfStmt', null, children, kw.line, kw.col, kw.start, (elseB || then).end);
  }
  // while block
  parseWhile() {
    const kw = this.advance(); // 'while'
    this.expect(TT.LPAREN, '(');
    const cond = this.parseExpression();
    this.expect(TT.RPAREN, ')');
    const body = this.parseBlock();
    return new ASTNode('WhileStmt', null, [cond, body], kw.line, kw.col, kw.start, body.end);
  }
  // for block
  parseFor() {
    const kw = this.advance(); // 'for'
    this.expect(TT.LPAREN, '(');
    let init = null;
    if (!this.check(TT.SEMICOLON)) {
      const DECL_KW = ['let','const','var','int','float','bool','string'];
      if (this.peek().type === TT.KEYWORD && DECL_KW.includes(this.peek().value)) {
        init = this.parseVarDecl();
      } else if (this.peek().type === TT.IDENTIFIER &&
                 (this.peek(1).type === TT.COMPOUND_ASSIGNMENT || this.peek(1).type === TT.COMPOUND_ASSIGN)) {
        init = this.parseAssignment();
      } else {
        init = this.parseExpression();
        if (this.check(TT.SEMICOLON)) this.advance();
      }
    } else {
      this.advance(); // skip ;
    }
    // condition
    let cond = null;
    if (!this.check(TT.SEMICOLON)) cond = this.parseExpression();
    this.expect(TT.SEMICOLON, ';');
    // update
    let update = null;
    if (!this.check(TT.RPAREN)) {
      if (this.peek().type === TT.IDENTIFIER &&
          (this.peek(1).type === TT.ASSIGN || this.peek(1).type === TT.COMPOUND_ASSIGN)) {
        const id  = this.advance();
        const op  = this.advance();
        const expr = this.parseExpression();
        const idNode = new ASTNode('Identifier', id.value, [], id.line, id.col, id.start, id.end);
        if (op.type === TT.COMPOUND_ASSIGNMENT) {
          const plainOp = op.value[0];
          const loadId  = new ASTNode('Identifier', id.value, [], id.line, id.col, id.start, id.end);
          const bin     = new ASTNode('BinaryExpr', plainOp, [loadId, expr], op.line, op.col, op.start, expr.end);
          update = new ASTNode('Assignment', null, [idNode, bin], id.line, id.col, id.start, expr.end);
        } else {
          update = new ASTNode('Assignment', null, [idNode, expr], id.line, id.col, id.start, expr.end);
        }
      } else {
        update = this.parseExpression();
      }
    }
    this.expect(TT.RPAREN, ')');
    const body = this.parseBlock();
    const children = [init, cond, update, body].filter(Boolean);
    return new ASTNode('ForStmt', null, children, kw.line, kw.col, kw.start, body.end);
  }
  // print(expr);
  parsePrint() {
    const kw = this.advance(); // 'print'
    this.expect(TT.LPAREN, '(');
    const expr = this.parseExpression();
    this.expect(TT.RPAREN, ')');
    if (this.check(TT.SEMICOLON)) this.advance();
    return new ASTNode('PrintStmt', null, [expr], kw.line, kw.col, kw.start, expr.end);
  }

  //Expressions
  parseExpression() { return this.parseLogical(); }
  parseLogical() {
    let left = this.parseComparison();
    while (this.check(TT.AND, TT.OR)) {
      const op    = this.advance();
      const right = this.parseComparison();
      left = new ASTNode('LogicalExpr', op.value, [left, right], op.line, op.col, left.start, right.end);
    }
    return left;
  }
  parseComparison() {
    let left = this.parseAdditive();
    while (this.check(TT.EQ, TT.NEQ, TT.LT, TT.GT, TT.LTE, TT.GTE)) {
      const op    = this.advance();
      const right = this.parseAdditive();
      left = new ASTNode('BinaryExpr', op.value, [left, right], op.line, op.col, left.start, right.end);
    }
    return left;
  }
  parseAdditive() {
    let left = this.parseMultiplicative();
    while (this.check(TT.ADDITION_OP, TT.SUBTRACTION_OP)) {
      const op    = this.advance();
      const right = this.parseMultiplicative();
      left = new ASTNode('BinaryExpr', op.value, [left, right], op.line, op.col, left.start, right.end);
    }
    return left;
  }
  parseMultiplicative() {
    let left = this.parseUnary();
    while (this.check(TT.MULTIPLICATION_OP, TT.DIVISION_OP, TT.MODULO_OP)) {
      const op    = this.advance();
      const right = this.parseUnary();
      left = new ASTNode('BinaryExpr', op.value, [left, right], op.line, op.col, left.start, right.end);
    }
    return left;
  }
  parseUnary() {
    if (this.check(TT.NOT)) {
      const op   = this.advance();
      const expr = this.parseUnary();
      return new ASTNode('UnaryExpr', '!', [expr], op.line, op.col, op.start, expr.end);
    }
    if (this.check(TT.SUBTRACTION_OP)) {
      const op   = this.advance();
      const expr = this.parseUnary();
      return new ASTNode('UnaryExpr', '-', [expr], op.line, op.col, op.start, expr.end);
    }
    return this.parsePrimary();
  }
  parsePrimary() {
    const tok = this.peek();
    // Parenthesised expression
    if (tok.type === TT.LPAREN) {
      this.advance(); // (
      const expr = this.parseExpression();
      this.expect(TT.RPAREN, ')');
      return expr;
    }
    // Literals
    if (tok.type === TT.INT_LIT) {
      this.advance();
      return new ASTNode('IntLiteral', tok.value, [], tok.line, tok.col, tok.start, tok.end);
    }
    if (tok.type === TT.FLOAT_LIT) {
      this.advance();
      return new ASTNode('FloatLiteral', tok.value, [], tok.line, tok.col, tok.start, tok.end);
    }
    if (tok.type === TT.STRING_LIT) {
      this.advance();
      return new ASTNode('StringLiteral', tok.value, [], tok.line, tok.col, tok.start, tok.end);
    }
    if (tok.type === TT.BOOLEAN) {
      this.advance();
      return new ASTNode('BoolLiteral', tok.value, [], tok.line, tok.col, tok.start, tok.end);
    }
    // Identifier
    if (tok.type === TT.IDENTIFIER) {
      this.advance();
      return new ASTNode('Identifier', tok.value, [], tok.line, tok.col, tok.start, tok.end);
    }
    // Nothing matched - error
    this.advance(); 
    throw new Error(`Unexpected token '${tok.value}' at line ${tok.line}`);
  }
}
window.ASTNode = ASTNode;
window.Parser  = Parser;
