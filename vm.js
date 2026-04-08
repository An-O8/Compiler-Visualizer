/* VIRTUAL MACHINE  : Executes the bytecode instructions.

Architecture:
  > Stack - an array used as an operand stack
  > Memory -bobject used as variable storage
  > PC (program counter) - index of the next instruction

The VM can run in three modes:
  1. stepVM()  — execute one instruction at a time
  2. runVM()   — execute all instructions with a speed delay
  3. resetVM() — reset everything to the initial state  */

// VM State
let vmPC        = 0;       // program counter
let vmStack     = [];      // stack
let vmMemory    = {};      // variable memory
let vmRunning   = false;   // is the run loop active?
let vmFinished  = false;   // has HALT been reached?
let vmOutput    = [];      // collected PRINT output
// Exported API
window.runVM   = runVM;
window.stepVM  = stepVM;
window.resetVM = resetVM;
// resetVM
function resetVM() {
  vmRunning  = false;
  vmFinished = false;
  vmPC       = 0;
  vmStack    = [];
  vmMemory   = {};
  vmOutput   = [];
  renderStack();
  renderMemory();
  highlightInstruction(-1);
  setStatus('Ready', '');
}
// stepVM - Execute exactly one instruction and Returns a Promise (true) if more instructions remain.
async function stepVM() {
  const bytecode = window.CompilerState ? window.CompilerState.bytecode : [];
  if (!bytecode || !bytecode.length) {
    setStatus('No bytecode', 'error');
    return false;
  }
  if (vmFinished || vmPC >= bytecode.length) {
    setStatus('Finished', 'done');
    vmFinished = true;
    return false;
  }
  // Highlight the current line
  highlightInstruction(vmPC);
  // Parse the instruction 
  const raw   = bytecode[vmPC];
  const parts = raw.trim().split(/\s+/);
  const op    = parts[0].toUpperCase();
  const arg   = parts.slice(1).join(' ');
  let nextPC  = vmPC + 1;
  try {
    switch (op) {
      case 'PUSH': {
        // Parse the value: number, boolean or string
        const val = arg.startsWith('"')
          ? arg.replace(/"/g, '')  // strip quotes
          : parseValue(arg);
        vmStack.push(val);
        break;
      }
      case 'LOAD': {
        const val = vmMemory.hasOwnProperty(arg) ? vmMemory[arg] : 0;
        vmStack.push(val);
        break;
      }
      case 'STORE': {
        requireStack(1, 'STORE');
        vmMemory[arg] = vmStack.pop();
        break;
      }
      // Arithmetic 
      case 'ADD': { requireStack(2, 'ADD'); const b = vmStack.pop(), a = vmStack.pop(); vmStack.push(a + b); break; }
      case 'SUB': { requireStack(2, 'SUB'); const b = vmStack.pop(), a = vmStack.pop(); vmStack.push(a - b); break; }
      case 'MUL': { requireStack(2, 'MUL'); const b = vmStack.pop(), a = vmStack.pop(); vmStack.push(a * b); break; }
      case 'DIV': {
        requireStack(2, 'DIV');
        const b = vmStack.pop(), a = vmStack.pop();
        if (b === 0) throw new Error('Division by zero');
        vmStack.push(a / b);
        break;
      }
      case 'MOD': {
        requireStack(2, 'MOD');
        const b = vmStack.pop(), a = vmStack.pop();
        if (b === 0) throw new Error('Modulo by zero');
        vmStack.push(a % b);
        break;
      }
      // Comparison 
      case 'EQ':  { requireStack(2, 'EQ');  const b = vmStack.pop(), a = vmStack.pop(); vmStack.push(a == b  ? 1 : 0); break; }
      case 'NEQ': { requireStack(2, 'NEQ'); const b = vmStack.pop(), a = vmStack.pop(); vmStack.push(a != b  ? 1 : 0); break; }
      case 'LT':  { requireStack(2, 'LT');  const b = vmStack.pop(), a = vmStack.pop(); vmStack.push(a <  b  ? 1 : 0); break; }
      case 'GT':  { requireStack(2, 'GT');  const b = vmStack.pop(), a = vmStack.pop(); vmStack.push(a >  b  ? 1 : 0); break; }
      case 'LTE': { requireStack(2, 'LTE'); const b = vmStack.pop(), a = vmStack.pop(); vmStack.push(a <= b  ? 1 : 0); break; }
      case 'GTE': { requireStack(2, 'GTE'); const b = vmStack.pop(), a = vmStack.pop(); vmStack.push(a >= b  ? 1 : 0); break; }
      // Logical
      case 'AND': { requireStack(2, 'AND'); const b = vmStack.pop(), a = vmStack.pop(); vmStack.push((a && b) ? 1 : 0); break; }
      case 'OR':  { requireStack(2, 'OR');  const b = vmStack.pop(), a = vmStack.pop(); vmStack.push((a || b) ? 1 : 0); break; }
      case 'NOT': { requireStack(1, 'NOT'); vmStack.push(vmStack.pop() ? 0 : 1); break; }
      case 'NEG': { requireStack(1, 'NEG'); vmStack.push(-Number(vmStack.pop())); break; }
      // Jumps 
      case 'JMP':
        nextPC = parseInt(arg, 10);
        break;
      case 'JZ':
        requireStack(1, 'JZ');
        if (!vmStack.pop()) nextPC = parseInt(arg, 10);
        break;
      // Output 
      case 'PRINT': {
        requireStack(1, 'PRINT');
        const val = vmStack.pop();
        vmOutput.push(String(val));
        setStatus(`Output: ${vmOutput.join(', ')}`, 'running');
        break;
      }
      // End 
      case 'HALT':
        setStatus(vmOutput.length ? `Done. Output: ${vmOutput.join(', ')}` : 'Done', 'done');
        vmFinished = true;
        vmRunning  = false;
        renderStack();
        renderMemory(null);
        return false;
      default:
        console.warn('Unknown opcode:', op);
    }
  } catch (err) {
    setStatus(`Error: ${err.message}`, 'error');
    vmRunning = false;
    return false;
  }
  vmPC = nextPC;
  // Update the visual displays
  renderStack();
  renderMemory(op === 'STORE' ? arg : null);
  return true; 
}
// runVM - run all instructions with a configurable delay between steps.
function runVM() {
  if (vmRunning) return;
  const bytecode = window.CompilerState ? window.CompilerState.bytecode : [];
  if (!bytecode || !bytecode.length) { setStatus('No bytecode', 'error'); return; }
  // If we've already finished, restart from the beginning
  if (vmFinished) resetVM();
  vmRunning = true;
  setStatus('Running…', 'running');
  function loop() {
    if (!vmRunning) return;
    stepVM().then(function(shouldContinue) {
      if (!shouldContinue || !vmRunning) return;
      const speedSlider = document.getElementById('vm-speed');
      const speedVal    = speedSlider ? parseInt(speedSlider.value, 10) : 5;
      // Speed 1 = 900ms delay,  Speed 10 = 50ms delay
      const delay = 950 - (speedVal - 1) * 100;
      setTimeout(loop, delay);
    });
  }
  loop();
}
// Parse a string value into a number if it looks numeric
function parseValue(str) {
  if (str === '' || str === undefined) return 0;
  const n = Number(str);
  return isNaN(n) ? str : n;
}
function requireStack(n, opName) {
  if (vmStack.length < n) {
    throw new Error(`Stack underflow: ${opName} needs ${n} value(s) but stack has ${vmStack.length}`);
  }
}
//top of stack is shown at top
function renderStack() {
  const container = document.getElementById('stack-display');
  if (!container) return;
  if (!vmStack.length) {
    container.innerHTML = '<p class="empty-msg">empty</p>';
    return;
  }
  // Show items in reverse so top-of-stack is at the top of the display
  const reversed = [...vmStack].reverse();
  container.innerHTML = reversed.map(function(val, i) {
    const stackIdx = vmStack.length - 1 - i;
    return `<div class="stack-cell">
      <span class="stack-idx">[${stackIdx}]</span>
      <span class="stack-val">${val}</span>
    </div>`;
  }).join('');
}
//highlighting a recently-stored variable
function renderMemory(highlightVar) {
  const tbody = document.getElementById('mem-tbody');
  if (!tbody) return;
  const entries = Object.entries(vmMemory);
  if (!entries.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="2">No variables yet</td></tr>';
    return;
  }
  tbody.innerHTML = entries.map(function([name, val]) {
    const hl = highlightVar === name ? ' style="background:var(--bg-active)"' : '';
    return `<tr${hl}><td>${name}</td><td>${val}</td></tr>`;
  }).join('');
}
function highlightInstruction(pc) {
  // Remove old highlight
  document.querySelectorAll('#bytecode-lines .code-line.current').forEach(function(el) {
    el.classList.remove('current');
  });
  if (pc < 0) return;
  const el = document.getElementById('vm-line-' + pc);
  if (el) {
    el.classList.add('current');
    el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}
// Update the status text next to the VM controls
function setStatus(text, state) {
  const el = document.getElementById('vm-status');
  if (!el) return;
  el.textContent = text;
  el.className   = state || '';
}