/* IR GENERATOR  : Stage 4 of the compiler pipeline.

Role : Converts the AST into a 3 address code that is a simple, linear list of instructions that looks almost like assembly language.

> Temporary variables are named t0, t1, t2, ...
> Labels are named like IF_TRUE_0, WHILE_START_1, etc */

/**
 * generateIR(ast)
 *   @param {ASTNode} ast    AST (possibly optimised)
 *   @returns {string[]}     Array of TAC instruction strings
 */
function generateIR(ast) {
  const instructions = [];
  let tempCount  = 0;
  let labelCount = 0;
  // Create a new temporary variable name: t0, t1, ...
  function newTemp() { return `t${tempCount++}`; }
  // Create a new label name: IF_TRUE_0, WHILE_START_1, ...
  function newLabel(prefix) { return `${prefix}_${labelCount++}`; }
  function emit(str) { instructions.push(str); }
  //Normalize literal values
  // Booleans become 1/0 so the VM is simpler to implement
  function normalize(val) {
    if (val === 'true'  || val === true)  return '1';
    if (val === 'false' || val === false) return '0';
    return String(val);
  }
  //AST walker
  function walk(node) {
    if (!node) return '0';
    switch (node.type) {
      //Program / Block
      case 'Program':
      case 'Block':
        (node.children || []).forEach(walk);
        return '';
      //Literals
      case 'IntLiteral':
      case 'FloatLiteral':
        return node.value;
      case 'BoolLiteral':
        return normalize(node.value);
      case 'StringLiteral':
        return `"${node.value}"`;
      case 'Identifier':
        return node.value;
      //Unary expression (ex :  -x  becomes t0 = NEG x)
      case 'UnaryExpr': {
        const operand = walk(node.children[0]);
        const temp    = newTemp();
        const opName  = node.value === '-' ? 'NEG' : 'NOT';
        emit(`${temp} = ${opName} ${operand}`);
        return temp;
      }
      //Binary expression
      case 'BinaryExpr': {
        const left  = walk(node.children[0]);
        const right = walk(node.children[1]);
        const temp  = newTemp();
        emit(`${temp} = ${left} ${node.value} ${right}`);
        return temp;
      }
      //Logical expression
      case 'LogicalExpr': {
        const result   = newTemp();
        const endLabel = newLabel('LOGIC_END');
        const left = walk(node.children[0]);
        emit(`${result} = ${left}`);
        if (node.value === '&&') {
          // If left is false, skip evaluating right
          emit(`if ${left} == 0 goto ${endLabel}`);
        } else {
          // || — if left is true, skip evaluating right
          emit(`if ${left} != 0 goto ${endLabel}`);
        }
        const right = walk(node.children[1]);
        emit(`${result} = ${right}`);
        emit(`${endLabel}:`);
        return result;
      }
      //Variable declaration
      case 'VarDecl': {
        const rhs = walk(node.children[1]);
        const lhs = node.children[0].value;
        emit(`${lhs} = ${rhs}`);
        return lhs;
      }
      //Assignment
      case 'Assignment': {
        const rhs = walk(node.children[1]);
        const lhs = node.children[0].value;
        emit(`${lhs} = ${rhs}`);
        return lhs;
      }
      //If statement
      // Pattern:
      //   if cond goto IF_TRUE
      //   goto IF_FALSE
      //   IF_TRUE:
      //     <then body>
      //   goto IF_END          - only if there's an else
      //   IF_FALSE:
      //     <else body>
      //   IF_END:
      case 'IfStmt': {
        const cond       = walk(node.children[0]);
        const trueLabel  = newLabel('IF_TRUE');
        const falseLabel = newLabel('IF_FALSE');
        const endLabel   = newLabel('IF_END');
        emit(`if ${cond} goto ${trueLabel}`);
        emit(`goto ${falseLabel}`);
        emit(`${trueLabel}:`);
        walk(node.children[1]); // then-branch
        if (node.children[2]) {
          // There's an else branch
          emit(`goto ${endLabel}`);
          emit(`${falseLabel}:`);
          walk(node.children[2]);
          emit(`${endLabel}:`);
        } else {
          emit(`${falseLabel}:`);
        }
        return '';
      }
      //While loop
      // Pattern:
      //   WHILE_START:
      //     compute cond
      //   if cond goto WHILE_BODY
      //   goto WHILE_END
      //   WHILE_BODY:
      //     <body>
      //   goto WHILE_START
      //   WHILE_END:
      case 'WhileStmt': {
        const startLabel = newLabel('WHILE_START');
        const bodyLabel  = newLabel('WHILE_BODY');
        const endLabel   = newLabel('WHILE_END');
        emit(`${startLabel}:`);
        const cond = walk(node.children[0]);
        emit(`if ${cond} goto ${bodyLabel}`);
        emit(`goto ${endLabel}`);
        emit(`${bodyLabel}:`);
        walk(node.children[1]); // loop body
        emit(`goto ${startLabel}`);
        emit(`${endLabel}:`);
        return '';
      }
      //For loop
      //   FOR_START:
      //   if cond goto FOR_BODY
      //   goto FOR_END
      //   FOR_BODY:
      //     body
      //     update
      //   goto FOR_START
      //   FOR_END:
      case 'ForStmt': {
        let init = null, cond = null, update = null, body = null;
        const ch = node.children || [];
        if (ch.length === 4) { [init, cond, update, body] = ch; }
        else if (ch.length === 3) { [cond, update, body] = ch; }
        else if (ch.length === 2) { [cond, body] = ch; }
        else if (ch.length === 1) { [body] = ch; }
        if (init) walk(init);
        const startLabel = newLabel('FOR_START');
        const bodyLabel  = newLabel('FOR_BODY');
        const endLabel   = newLabel('FOR_END');
        emit(`${startLabel}:`);
        if (cond && cond.type !== 'Block') {
          const condVal = walk(cond);
          emit(`if ${condVal} goto ${bodyLabel}`);
          emit(`goto ${endLabel}`);
        }
        emit(`${bodyLabel}:`);
        if (body) walk(body);
        if (update) walk(update);
        emit(`goto ${startLabel}`);
        emit(`${endLabel}:`);
        return '';
      }
      //Print statement
      case 'PrintStmt': {
        const val = walk(node.children[0]);
        emit(`print ${val}`);
        return '';
      }
      //Unknown node
      default:
        (node.children || []).forEach(walk);
        return '0';
    }
  }
  walk(ast);
  return instructions;
}
//Export
window.generateIR = generateIR;
