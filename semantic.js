/* SEMANTIC ANALYSER : Stage 3 of the compiler pipeline

ROle : Walks the AST and checks that the program makes sense and not just that it's syntactically correct.

Checks performed:
~ Undeclared variables
~ Re-declaration in the same scope
~ Assigning to a 'const' variable
~ Basic type mismatches 

Side effects: Populates window.SymbolTable with every declared variable

Symbol Table : A very simple two-level symbol table : global scope + nested scopes. 
Each symbol record has:  name, type, isConst, value, scope, line */

class SymbolTable {
  constructor() {
    this.reset();
  }
  reset() {
    this.scopes  = [new Map()];
    this.records = []; 
  }
  // Enter a new block scope
  enterScope() { this.scopes.push(new Map()); }
  // Exit the current block scope
  exitScope() {
    if (this.scopes.length > 1) this.scopes.pop();
  }
  // Current depth (0 = global)
  get depth() { return this.scopes.length - 1; }
  // Look up a name, searching from innermost scope to outward
  lookup(name) {
    for (let i = this.scopes.length - 1; i >= 0; i--) {
      if (this.scopes[i].has(name)) return this.scopes[i].get(name);
    }
    return null;
  }
  // Check only the current scope : used for re-declaration check
  lookupLocal(name) {
    return this.scopes[this.scopes.length - 1].get(name) || null;
  }
  // Define a new symbol in the current scope
  define(name, type, isConst, value, line) {
    const record = {
      name,
      type:    type || 'auto',
      isConst: !!isConst,
      value:   value ?? null,
      scope:   this.depth === 0 ? 'global' : `block-${this.depth}`,
      line,
    };
    this.scopes[this.scopes.length - 1].set(name, record);
    this.records.push(record);
    return record;
  }
  // Update the value of an existing symbol (used after assignment)
  update(name, value) {
    const sym = this.lookup(name);
    if (sym) sym.value = value;
  }
  // Return a array of all symbols across all scopes
  all() { return this.records; }
}
// Create a single global instance that other stages can read
window.SymbolTable = new SymbolTable();

// Semantic analyser function
/**
 * analyzeSemantics(ast)
 *   @param {ASTNode} ast   The AST returned by the parser
 *   @returns {Array}       Array of error/warning objects
 */
function analyzeSemantics(ast) {
  const errors = [];
  const ST     = window.SymbolTable;
  ST.reset(); 

  function err(message, node, severity = 'error') {
    errors.push({
      type:     severity === 'warning' ? 'Warning' : 'Semantic Error',
      message,
      line:     node ? node.line : '?',
      col:      node ? node.col  : '?',
      severity,
    });
  }
  //Type inference
  // Given an expression node, return a string like 'int', 'float', 'bool', 'string'
  function inferType(node) {
    if (!node) return 'unknown';
    switch (node.type) {
      case 'IntLiteral':    return 'int';
      case 'FloatLiteral':  return 'float';
      case 'BoolLiteral':   return 'bool';
      case 'StringLiteral': return 'string';
      case 'Identifier': {
        const sym = ST.lookup(node.value);
        return sym ? sym.type : 'unknown';
      }
      case 'UnaryExpr':
        return node.value === '!' ? 'bool' : inferType(node.children[0]);
      case 'BinaryExpr': {
        const lType = inferType(node.children[0]);
        const rType = inferType(node.children[1]);
        if (['==','!=','<','>','<=','>='].includes(node.value)) return 'bool';
        if (lType === 'float' || rType === 'float') return 'float';
        if (lType === 'int'   && rType === 'int')   return 'int';
        return lType;
      }
      case 'LogicalExpr': return 'bool';
      default:            return 'unknown';
    }
  }
  // Literal value extraction
  function literalValue(node) {
    if (!node) return null;
    if (node.type === 'IntLiteral'  || node.type === 'FloatLiteral' ||
        node.type === 'BoolLiteral' || node.type === 'StringLiteral') {
      return node.value;
    }
    return null;
  }
  // AST visitor
  function visit(node) {
    if (!node) return;
    switch (node.type) {
      // visit all statements
      case 'Program':
        node.children.forEach(visit);
        break;
      // enter and exit a scope 
      case 'Block':
        ST.enterScope();
        node.children.forEach(visit);
        ST.exitScope();
        break;
      // Variable declaration: let/const/var/int/etc 
      case 'VarDecl': {
        const [idNode, exprNode] = node.children;
        visit(exprNode); // visit the right-hand side first
        const name    = idNode.value;
        const kw      = node.value; // the keyword: 'let', 'int', 'float' etc
        const isConst = kw === 'const';
        // Re-declaration check (only in the same scope)
        if (ST.lookupLocal(name)) {
          err(`Variable '${name}' is already declared in this scope`, idNode);
          break;
        }
        // Determine the type
        const exprType = inferType(exprNode);
        let finalType  = exprType;
        const TYPE_KW  = ['int','float','bool','string'];
        if (TYPE_KW.includes(kw)) {
          finalType = kw;
          if (exprType !== 'unknown' && exprType !== finalType) {
            err(`Type mismatch: declared '${finalType}' but got '${exprType}'`, idNode, 'warning');
          }
        }
        ST.define(name, finalType, isConst, literalValue(exprNode), idNode.line);
        break;
      }
      case 'Assignment': {
        const [idNode, exprNode] = node.children;
        visit(exprNode);
        const name = idNode.value;
        const sym  = ST.lookup(name);
        if (!sym) {
          err(`Variable '${name}' is not declared`, idNode);
          break;
        }
        if (sym.isConst) {
          err(`Cannot assign to const variable '${name}'`, idNode);
          break;
        }
        const exprType = inferType(exprNode);
        if (sym.type !== 'unknown' && exprType !== 'unknown' && sym.type !== exprType) {
          err(`Type mismatch: '${name}' is ${sym.type} but value is ${exprType}`, idNode, 'warning');
        }
        ST.update(name, literalValue(exprNode));
        break;
      }
      // ─IDENTIFER
      case 'Identifier': {
        if (!ST.lookup(node.value)) {
          err(`Variable '${node.value}' is used before declaration`, node);
        }
        break;
      }
      // Binary expressions
      case 'BinaryExpr': {
        node.children.forEach(visit);
        const lType = inferType(node.children[0]);
        const rType = inferType(node.children[1]);
        // String concatenation
        if ((lType === 'string' || rType === 'string') && node.value !== '+') {
          err(`Operator '${node.value}' cannot be used with strings`, node, 'warning');
        }
        break;
      }
      // Logical expressions
      case 'LogicalExpr': {
        node.children.forEach(visit);
        const lType = inferType(node.children[0]);
        const rType = inferType(node.children[1]);
        if (lType === 'string' || rType === 'string') {
          err(`Logical operator '${node.value}' cannot be used with strings`, node, 'warning');
        }
        break;
      }
      // Unary not: ! expects bool
      case 'UnaryExpr': {
        visit(node.children[0]);
        if (node.value === '!') {
          const t = inferType(node.children[0]);
          if (t !== 'bool' && t !== 'unknown') {
            err(`'!' operator expects a boolean, got '${t}'`, node, 'warning');
          }
        }
        break;
      }
      // If statement
      case 'IfStmt': {
        const [cond, thenBranch, elseBranch] = node.children;
        visit(cond);
        const condType = inferType(cond);
        if (condType !== 'unknown' && condType === 'string') {
          err(`If condition must not be a string`, cond, 'warning');
        }
        visit(thenBranch);
        if (elseBranch) visit(elseBranch);
        break;
      }
      // While loop
      case 'WhileStmt': {
        const [cond, body] = node.children;
        visit(cond);
        visit(body);
        break;
      }
      // For loop
      case 'ForStmt': {
        ST.enterScope(); 
        node.children.forEach(visit);
        ST.exitScope();
        break;
      }
      // Print statement
      case 'PrintStmt':
        node.children.forEach(visit);
        break;
      // Literals
      case 'IntLiteral':
      case 'FloatLiteral':
      case 'BoolLiteral':
      case 'StringLiteral':
        break;
      default:
        if (node.children) node.children.forEach(visit);
    }
  }
  visit(ast);
  return errors;
}

window.analyzeSemantics = analyzeSemantics;