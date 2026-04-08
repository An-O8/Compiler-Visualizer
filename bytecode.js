/* BYTECODE GENERATOR : Stage 5 of the compiler.

Function : Converts the AST into a list of instructions for our virtual machine (VM).

STACK:
  PUSH <val>     - push a literal value
  LOAD <name>    - push the value of a variable
  STORE <name>   - pop and store into a variable
  ADD SUB MUL DIV MOD  - arithmetic on top two values
  EQ NEQ LT GT LTE GTE - comparison : 1 (true) or 0 (false)
  AND OR NOT NEG        - logical / negation
  JMP <line>     - jump to instruction at index <line>
  JZ  <line>     - jump if top of the stack is 0 (false)
  PRINT          - pop and display top of stack
  HALT           - end execution */

/**
 * generateBytecode(ast)
 *   @param {ASTNode} ast   AST 
 *   @returns {string[]}    Array of instruction strings
 */
function generateBytecode(ast) {
  const instructions = [];
  // Append one instruction string
  function emit(instr) {
    instructions.push(instr);
    return instructions.length - 1; // return its index
  }
  function nextIndex() { return instructions.length; }
  // Back-patching : When we emit a JZ or JMP before we know the target, we store a placeholder ("JZ 0") and record the index.
  // Then we call patch (index) later to fill in the real target.
  function emitJump(opcode) {
    const idx = emit(`${opcode} 0`);  // placeholder
    return function patch() {
      instructions[idx] = `${opcode} ${nextIndex()}`;
    };
  }
  // AST walker
  function walk(node) {
    if (!node) return;
    switch (node.type) {
      // Program / Block
      case 'Program':
      case 'Block':
        (node.children || []).forEach(walk);
        break;
      // Literals
      case 'IntLiteral':
      case 'FloatLiteral':
        emit(`PUSH ${node.value}`);
        break;
      case 'BoolLiteral':
        emit(`PUSH ${node.value === 'true' ? 1 : 0}`);
        break;
      case 'StringLiteral':
        emit(`PUSH "${node.value}"`);
        break;
      // Identifier read from memory
      case 'Identifier':
        emit(`LOAD ${node.value}`);
        break;
      // Variable declaration 
      case 'VarDecl': {
        walk(node.children[1]);              // evaluate the expression
        emit(`STORE ${node.children[0].value}`); // pop and store
        break;
      }
      // Assignment
      case 'Assignment': {
        walk(node.children[1]);              // evaluate RHS
        emit(`STORE ${node.children[0].value}`); // pop and store
        break;
      }
      // Unary expressions
      case 'UnaryExpr':
        walk(node.children[0]);
        if (node.value === '-') emit('NEG');
        if (node.value === '!') emit('NOT');
        break;
      // Binary expressions
      case 'BinaryExpr': {
        walk(node.children[0]);
        walk(node.children[1]);
        const opMap = {
          '+': 'ADD', '-': 'SUB', '*': 'MUL', '/': 'DIV', '%': 'MOD',
          '==': 'EQ',  '!=': 'NEQ',
          '<':  'LT',  '>':  'GT',
          '<=': 'LTE', '>=': 'GTE',
        };
        emit(opMap[node.value] || `UNKNOWN_OP ${node.value}`);
        break;
      }
      // Logical AND / OR
      case 'LogicalExpr':
        walk(node.children[0]);
        walk(node.children[1]);
        emit(node.value === '&&' ? 'AND' : 'OR');
        break;
      // If statement
      //   evaluate condition
      //   JZ  - jump to else start (if condition is false)
      //   <then body>
      //   JMP - jump to end        (skip else)
      //   <else body>              (if any)
      //   <end>
      case 'IfStmt': {
        const [cond, thenBranch, elseBranch] = node.children;
        walk(cond);                          // condition on stack
        const patchJumpFalse = emitJump('JZ');
        walk(thenBranch);
        if (elseBranch) {
          const patchJumpEnd = emitJump('JMP');
          patchJumpFalse();  // JZ lands here (start of else)
          walk(elseBranch);
          patchJumpEnd();    // JMP lands here (after else)
        } else {
          patchJumpFalse();  // JZ lands here (after if)
        }
        break;
      }
      // While loop
      //   <loopStart>:
      //   evaluate condition
      //   JZ  - jump to loopEnd    (exit if false)
      //   <loop body>
      //   JMP - loopStart
      //   <loopEnd>:
      case 'WhileStmt': {
        const [cond, body] = node.children;
        const loopStart = nextIndex();
        walk(cond);
        const patchExit = emitJump('JZ');
        walk(body);
        emit(`JMP ${loopStart}`);
        patchExit(); // JZ lands here
        break;
      }
      // For loop
      case 'ForStmt': {
        const ch = node.children || [];
        let init = null, cond = null, update = null, body = null;
        if (ch.length === 4) [init, cond, update, body] = ch;
        else if (ch.length === 3) [cond, update, body] = ch;
        else if (ch.length === 2) [cond, body] = ch;
        else if (ch.length === 1) [body] = ch;
        if (init) walk(init);
        const loopStart = nextIndex();
        if (cond && cond.type !== 'Block') {
          walk(cond);
          const patchExit = emitJump('JZ');
          if (body) walk(body);
          if (update) walk(update);
          emit(`JMP ${loopStart}`);
          patchExit();
        } else {
          if (body) walk(body);
          if (update) walk(update);
          emit(`JMP ${loopStart}`);
        }
        break;
      }
      // Print statement
      case 'PrintStmt':
        walk(node.children[0]);
        emit('PRINT');
        break;
      default:
        (node.children || []).forEach(walk);
    }
  }
  walk(ast);
  emit('HALT'); // every program ends with HALT
  return instructions;
}
// Export
window.generateBytecode = generateBytecode;
