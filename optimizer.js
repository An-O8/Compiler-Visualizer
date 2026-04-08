/* OPTIMIZER - Optional Stage of the compiler pipeline

ROLE: Walks the AST and simplifies it before code generation. This is called "constant folding" - 
if both sides of an expression are known at compile time, we compute the result now instead of at runtime.

Examples of what gets simplified:
  2 + 3          - 5
  10 * 0         - 0
  x + 0          - x
  true && false  - false
  if (false) { } - removed entirely
  while (false)  - removed entirely

The optimizer never changes the meaning of the program, it only makes it faster or smaller.

 optimizeAST(root)
  @param {ASTNode} root  -  The root node of the AST
 @returns {ASTNode}   -   A new (possibly simpler) AST */

function optimizeAST(root) {
  //copy a node so we never mutate the original AST
  function clone(node) {
    if (!node) return null;
    return new ASTNode(
      node.type, node.value,
      (node.children || []).map(clone),
      node.line, node.col, node.start, node.end
    );
  }
  // Type checks
  const isInt   = n => n && n.type === 'IntLiteral';
  const isFloat = n => n && n.type === 'FloatLiteral';
  const isBool  = n => n && n.type === 'BoolLiteral';
  const isNum   = n => isInt(n) || isFloat(n);
  // Value converters
  const toNum  = n => parseFloat(n.value);
  const toBool = n => n.value === 'true';

  function makeInt(val, ref) {
    return new ASTNode('IntLiteral', String(val), [], ref.line, ref.col, ref.start, ref.end);
  }
  function makeFloat(val, ref) {
    //a clean decimal representation
    const s = Number.isInteger(val) ? val.toFixed(1) : String(val);
    return new ASTNode('FloatLiteral', s, [], ref.line, ref.col, ref.start, ref.end);
  }
  function makeBool(val, ref) {
    return new ASTNode('BoolLiteral', val ? 'true' : 'false', [], ref.line, ref.col, ref.start, ref.end);
  }
  function makeNumber(val, hasFloat, ref) {
    return hasFloat ? makeFloat(val, ref) : makeInt(val, ref);
  }
  //Constant folding for binary operations 
  function foldBinary(node, left, right) {
    // Both sides are numbers then compute at compile time
    if (isNum(left) && isNum(right)) {
      const a = toNum(left);
      const b = toNum(right);
      const f = isFloat(left) || isFloat(right);
      switch (node.value) {
        case '+':  return makeNumber(a + b, f, node);
        case '-':  return makeNumber(a - b, f, node);
        case '*':  return makeNumber(a * b, f, node);
        case '/':  return b !== 0 ? makeNumber(a / b, true, node) : null; // avoid divide by zero
        case '%':  return b !== 0 ? makeInt(a % b, node) : null;
        case '==': return makeBool(a === b, node);
        case '!=': return makeBool(a !== b, node);
        case '<':  return makeBool(a <   b, node);
        case '>':  return makeBool(a >   b, node);
        case '<=': return makeBool(a <=  b, node);
        case '>=': return makeBool(a >=  b, node);
      }
    }
    // Both sides are booleans
    if (isBool(left) && isBool(right)) {
      const a = toBool(left);
      const b = toBool(right);
      switch (node.value) {
        case '==': return makeBool(a === b, node);
        case '!=': return makeBool(a !== b, node);
        case '&&': return makeBool(a && b, node);
        case '||': return makeBool(a || b, node);
      }
    }
    return null; // can't fold
  }
  // Main visitor (post-order: children first, then parent)
  function visit(node) {
    if (!node) return null;
    node = clone(node);
    //Visit all children first 
    if (node.children) {
      node.children = node.children.map(visit).filter(Boolean);
    }
    // Simplification
    // Unary expressions
    if (node.type === 'UnaryExpr') {
      const val = node.children[0];
      if (val && isNum(val)  && node.value === '-') return makeNumber(-toNum(val), isFloat(val), node);
      if (val && isBool(val) && node.value === '!') return makeBool(!toBool(val), node);
    }
    // Binary expressions - first try constant folding
    if (node.type === 'BinaryExpr') {
      const [left, right] = node.children;
      if (!left || !right) return node;
      const folded = foldBinary(node, left, right);
      if (folded) return folded;
      // Algebraic things (x + 0 = x, x * 1 = x etc)
      if (node.value === '+') {
        if (isNum(right) && toNum(right) === 0) return left;
        if (isNum(left)  && toNum(left)  === 0) return right;
      }
      if (node.value === '-') {
        if (isNum(right) && toNum(right) === 0) return left;
      }
      if (node.value === '*') {
        if (isNum(right) && toNum(right) === 1) return left;
        if (isNum(left)  && toNum(left)  === 1) return right;
        if (isNum(right) && toNum(right) === 0) return makeInt(0, node);
        if (isNum(left)  && toNum(left)  === 0) return makeInt(0, node);
      }
      if (node.value === '/') {
        if (isNum(right) && toNum(right) === 1) return left;
      }
    }
    // Logical expressions
    if (node.type === 'LogicalExpr') {
      const [left, right] = node.children;
      if (!left || !right) return node;
      const folded = foldBinary(node, left, right);
      if (folded) return folded;
  
      if (node.value === '&&') {
        if (isBool(left)  && !toBool(left))  return makeBool(false, node);
        if (isBool(right) && !toBool(right)) return makeBool(false, node);
        if (isBool(left)  && toBool(left))   return right;
        if (isBool(right) && toBool(right))  return left;
      }
      if (node.value === '||') {
        if (isBool(left)  && toBool(left))   return makeBool(true, node);
        if (isBool(right) && toBool(right))  return makeBool(true, node);
        if (isBool(left)  && !toBool(left))  return right;
        if (isBool(right) && !toBool(right)) return left;
      }
    }
    // If statement with a known condition
    if (node.type === 'IfStmt') {
      const cond = node.children[0];
      if (isBool(cond)) {
        if (toBool(cond)) return node.children[1] || null;  // always true : keep then-branch
        else              return node.children[2] || null;  // always false : keep else-branch (or nothing)
      }
    }
    // While loop with condition = false : remove the loop entirely
    if (node.type === 'WhileStmt') {
      const cond = node.children[0];
      if (isBool(cond) && !toBool(cond)) return null;
    }
    // Empty blocks
    if (node.type === 'Block' && node.children.length === 0) return null;
    //remove any null statements
    if (node.type === 'Program') {
      node.children = node.children.filter(Boolean);
    }
    return node;
  }
  return visit(root) || root;
}
window.optimizeAST = optimizeAST;
