/* Main controller

Functions:
  1. Initialises the Monaco code editor
  2. Provide functionality to all buttons (compile, VM controls, tabs, theme)
  4. Renders all the output tabs (tokens, IR, bytecode, etc)
  5. Draws the AST

Pipeline order:
  tokenize - parse - optimize(optional) - semantics - ir - bytecode */

//Global Compiler State
window.CompilerState = {
  source:   '',    // raw source code
  tokens:   [],    // lexer output
  ast:      null,  // AST from parser
  finalAst: null,  // AST after optimization
  ir:       [],    // IR instructions
  bytecode: [],    // VM bytecode
  errors:   [],    // all errors from all stages
};
//Default code
const SAMPLE_CODE = `// Welcome to LiteLang!
// A simple C-style language to learn how compilers work.

// Variable declarations
int a = 10;
int b = 3;
float pi = 3.14;
bool debug = true;

// Arithmetic
int sum = a + b;
int product = a * b;
float area = pi * a * a;

// If / else
if (sum > 10) {
  int big = sum * 2;
} else {
  int small = sum;
}

// While loop
int counter = 0;
while (counter < 5) {
  counter += 1;
}

// For loop
int total = 0;
for (int i = 0; i < 4; i += 1) {
  total += i;
}

// Print
print(total);
`;
function tokenColorClass(type) {
  if (type === 'KEYWORD')        return 'tok-type-keyword';
  if (type === 'BOOLEAN')        return 'tok-type-keyword';
  if (type === 'INT_LITERAL'  || type === 'FLOAT_LITERAL') return 'tok-type-number';
  if (type === 'STRING_LITERAL') return 'tok-type-string';
  if (type === 'IDENTIFIER')     return 'tok-type-ident';
  if (['PLUS','MINUS','STAR','SLASH','PERCENT',
       'EQ','NEQ','LT','GT','LTE','GTE','AND','OR','NOT',
       'ASSIGN','COMPOUND_ASSIGN'].includes(type)) return 'tok-type-op';
  return 'tok-type-punct';
}
//Node color map for the AST
const NODE_COLORS = {
  Program:'#667eea', VarDecl:'#f093fb', Assignment:'#e879f9', BinaryExpr:'#34d399', LogicalExpr:'#10b981',
  UnaryExpr:'#fb923c', Identifier:'#38bdf8', IntLiteral:'#facc15', FloatLiteral:'#fbbf24',
  BoolLiteral:'#f472b6', StringLiteral:'#a78bfa', IfStmt:'#f87171', WhileStmt:'#ef4444', ForStmt:'#f97316',
  Block:'#818cf8', PrintStmt:'#2dd4bf',
};
function nodeColor(type) { return NODE_COLORS[type] || '#6b7280'; }
function countNodes(node) {
  if (!node) return 0;
  return 1 + (node.children || []).reduce((s, c) => s + countNodes(c), 0);
}
//  COMPILE PIPELINE
function compileCode() {
  if (!window.monacoEditor) return;
  const source = window.monacoEditor.getValue();
  if (!source.trim()) { alert('Write some LiteLang code first!'); return; }
  const state      = window.CompilerState;
  state.source     = source;
  state.tokens     = [];
  state.ast        = null;
  state.finalAst   = null;
  state.ir         = [];
  state.bytecode   = [];
  state.errors     = [];
  const startTime  = performance.now();
  // Reset the VM so old execution state doesn't show
  if (window.resetVM) window.resetVM();
  resetPipelineStages();
  //STAGE 1: Lexer
  activateStage('lex');
  try {
    state.tokens = tokenize(source);
    doneStage('lex');
  } catch (e) {
    state.errors.push({ type: 'Lexer Error', message: e.message, line: '-', severity: 'error' });
    errorStage('lex');
  }
  // Remove EOF and ERROR tokens before parsing
  const cleanTokens = state.tokens.filter(
    t => t.type !== 'EOF' && t.type !== 'ERROR'
  );
  //STAGE 2: Parser
  activateStage('parse');
  try {
    const parser = new Parser(cleanTokens);
    state.ast    = parser.parse();
    parser.errors.forEach(e => state.errors.push({ ...e, severity: 'error' }));
    doneStage('parse');
  } catch (e) {
    state.errors.push({ type: 'Parser Error', message: e.message, line: '-', severity: 'error' });
    errorStage('parse');
  }
  if (!state.ast) { finishCompile(startTime); return; }
  //STAGE 3 (optional): Optimizer 
  const optimizerOn = document.getElementById('optimizer-on')?.checked;
  if (optimizerOn && typeof optimizeAST === 'function') {
    try {
      state.finalAst = optimizeAST(state.ast) || state.ast;
    } catch (e) {
      state.finalAst = state.ast;
      state.errors.push({ type: 'Optimizer Error', message: e.message, line: '-', severity: 'warning' });
    }
  } else {
    state.finalAst = state.ast;
  }
  //STAGE 4: Semantic Analysis 
  activateStage('sem');
  try {
    const semErrors = analyzeSemantics(state.finalAst);
    semErrors.forEach(e => state.errors.push(e));
    doneStage('sem');
  } catch (e) {
    state.errors.push({ type: 'Semantic Error', message: e.message, line: '-', severity: 'error' });
    errorStage('sem');
  }
  //STAGE 5: IR Generation
  activateStage('ir');
  try {
    state.ir = generateIR(state.finalAst);
    doneStage('ir');
  } catch (e) {
    state.errors.push({ type: 'IR Error', message: e.message, line: '-', severity: 'error' });
    errorStage('ir');
    state.ir = [];
  }
  //STAGE 6: Bytecode Generation
  activateStage('bc');
  try {
    state.bytecode = generateBytecode(state.finalAst);
    doneStage('bc');
  } catch (e) {
    state.errors.push({ type: 'Bytecode Error', message: e.message, line: '-', severity: 'error' });
    errorStage('bc');
    state.bytecode = [];
  }
  renderTokens(state.tokens);
  renderIR(state.ir);
  renderBytecode(state.bytecode);
  renderSymbols();
  renderErrors(state.errors);
  drawAST(state.finalAst);

  finishCompile(startTime);
}
// Update the timing metrics in the top bar
function finishCompile(startTime) {
  const state = window.CompilerState;
  const ms    = (performance.now() - startTime).toFixed(1);
  // Calculate memory
  const TYPE_SIZES = { int: 4, float: 8, bool: 1, string: 16, auto: 4 };
  const symbols    = window.SymbolTable ? window.SymbolTable.all() : [];
  const memBytes   = symbols.reduce((sum, s) => sum + (TYPE_SIZES[s.type] || 4), 0);
  const memStr     = memBytes >= 1024
    ? (memBytes / 1024).toFixed(1) + ' KB'
    : memBytes + ' B';
  const el = id => document.getElementById(id);
  el('stat-time'  ).textContent = ms + ' ms';
  el('stat-tokens').textContent = state.tokens.filter(t => t.type !== 'EOF').length;
  el('stat-nodes' ).textContent = state.finalAst ? countNodes(state.finalAst) : 0;
  if (el('stat-memory')) el('stat-memory').textContent = memStr;
  // Show the error badge on the errors tab
  const errCount    = state.errors.length;
  const badge       = document.getElementById('error-count');
  const errTab      = document.querySelector('.tab[data-tab="errors"]');
  if (badge && errTab) {
    if (errCount > 0) {
      badge.textContent = errCount;
      badge.style.display = 'inline-flex';
    } else {
      badge.style.display = 'none';
    }
  }
}
//  RENDER FUNCTIONS - fill each tab with data
//Tokens tab
function renderTokens(tokens) {
  const tbody = document.getElementById('token-tbody');
  if (!tbody) return;
  const visible = tokens.filter(t => t.type !== 'EOF');
  if (!visible.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="5">No tokens</td></tr>';
    return;
  }
  tbody.innerHTML = visible.map((t, i) => `
    <tr>
      <td class="col-num">${i + 1}</td>
      <td class="${tokenColorClass(t.type)}">${t.type}</td>
      <td>${escHtml(t.value)}</td>
      <td>${t.line}</td>
      <td>${t.col}</td>
    </tr>
  `).join('');
}
//IR tab
function renderIR(lines) {
  const container = document.getElementById('ir-lines');
  if (!container) return;

  if (!lines.length) {
    container.textContent = '// No IR generated';
    return;
  }
  container.innerHTML = lines.map((line, i) => {
    // First escape HTML so special chars are safe, then apply coloring
    const safe = escHtml(line);
    const colored = safe
      // Labels
      .replace(/\b(IF_TRUE|IF_FALSE|IF_END|WHILE_START|WHILE_BODY|WHILE_END|FOR_START|FOR_BODY|FOR_END|LOGIC_END)_\d+:/g,
        m => `<span class="ir-label">${m}</span>`)
      // Temp variables: t0, t1, ...
      .replace(/\b(t\d+)\b/g, m => `<span class="ir-temp">${m}</span>`)
      // Operators
      .replace(/(<[^>]+>)|([^<]+)/g, (_, tag, text) => {
        if (tag) return tag; // pass through HTML tags untouched
        return text.replace(/(==|!=|&lt;=|&gt;=|&lt;|&gt;|[+\-*/%])/g,
          m => `<span class="ir-op">${m}</span>`);
      });
    return `<div class="code-line">
      <span class="line-num">${i}</span>
      <span class="line-text">${colored}</span>
    </div>`;
  }).join('');
}
//Bytecode tab
function renderBytecode(instructions) {
  const container = document.getElementById('bytecode-lines');
  if (!container) return;
  if (!instructions.length) {
    container.textContent = '// No bytecode generated';
    return;
  }
  container.innerHTML = instructions.map((instr, i) =>
    `<div class="code-line" id="vm-line-${i}">
      <span class="line-num">${i}</span>
      <span class="line-text">${escHtml(instr)}</span>
    </div>`
  ).join('');
}
//Symbol table tab
function renderSymbols() {
  const tbody  = document.getElementById('sym-tbody');
  if (!tbody) return;
  const symbols = window.SymbolTable ? window.SymbolTable.all() : [];
  if (!symbols.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="5">No symbols declared</td></tr>';
    return;
  }
  tbody.innerHTML = symbols.map(s => `
    <tr>
      <td>${escHtml(s.name)}</td>
      <td class="tok-type-keyword">${s.type}</td>
      <td>${s.scope}</td>
      <td>${s.isConst ? '<span style="color:var(--accent);font-weight:700">YES</span>' : '<span style="color:var(--text-muted)">—</span>'}</td>
      <td>${s.value != null ? escHtml(String(s.value)) : '—'}</td>
    </tr>
  `).join('');
}
//Errors tab
function renderErrors(errors) {
  const container = document.getElementById('errors-list');
  if (!container) return;
  if (!errors.length) {
    container.innerHTML = `
      <div class="success-msg">
        Compilation successful!
      </div>`;
    return;
  }
  container.innerHTML = errors.map(e => {
    const sev = e.severity || (e.type && e.type.includes('Warning') ? 'warning' : 'error');
    const loc = e.line && e.line !== '-' ? `Line ${e.line}` : '';
    return `<div class="error-card severity-${sev}">
      <div class="error-dot"></div>
      <div>
        <div class="error-meta">${e.type || 'Error'}${loc ? ' · ' + loc : ''}</div>
        <div class="error-msg">${escHtml(e.message || '')}</div>
      </div>
    </div>`;
  }).join('');
}
//  D3 AST VISUALISER
function drawAST(ast) {
  const container = document.getElementById('ast-container');
  if (!container || !ast) return;
  container.innerHTML = ''; // clear old tree
  const W = container.clientWidth  || 800;
  const H = container.clientHeight || 500;
  // Create an SVG that fills the container
  const svg = d3.select(container).append('svg')
    .attr('width',  W)
    .attr('height', H);
  // g is the layer we will zoom/pan
  const g = svg.append('g'); 
  const zoom = d3.zoom()
    .scaleExtent([0.2, 4])
    .on('zoom', e => g.attr('transform', e.transform));
  svg.call(zoom);
  //Build D3 hierarchy from the AST 
  const root = d3.hierarchy(ast, n => (n.children && n.children.length) ? n.children : null);
  const treeLayout = d3.tree().nodeSize([160, 90]);
  treeLayout(root);
  const allNodes = root.descendants();
  const allLinks = root.links();
  // Centre the tree horizontally
  const minX = d3.min(allNodes, d => d.x);
  const maxX = d3.max(allNodes, d => d.x);
  g.attr('transform', `translate(${W / 2 - (minX + maxX) / 2}, 50)`);
  //Canvas for text measurement 
  const canvas  = document.createElement('canvas');
  const ctx     = canvas.getContext('2d');
  ctx.font      = '600 11px JetBrains Mono, monospace';
  function measureText(str) { return ctx.measureText(str).width; }
  const DEPTH_DELAY = 400; 
  //Draw edges 
  allLinks.forEach(link => {
    const path = g.append('path')
      .attr('class', 'ast-link')
      .attr('d', d3.linkVertical().x(d => d.x).y(d => d.y)(link));
    const len = path.node().getTotalLength();
    path
      .attr('stroke-dasharray', `${len} ${len}`)
      .attr('stroke-dashoffset', len)
      .transition()
      .duration(DEPTH_DELAY)
      .delay(link.source.depth * DEPTH_DELAY)
      .ease(d3.easeLinear)
      .attr('stroke-dashoffset', 0);
  });
  //Draw nodes 
  allNodes.forEach(nd => {
    const data  = nd.data;
    const label = data.value != null ? `${data.type}: ${data.value}` : data.type;
    const color = nodeColor(data.type);
    const PAD   = 18;
    const BOX_H = 32;
    const BOX_W = Math.max(90, measureText(label) + PAD * 2);
    const nodeGroup = g.append('g')
      .attr('class', 'ast-node')
      .attr('transform', `translate(${nd.x},${nd.y}) scale(0)`);
    // Spring ppop animation
    nodeGroup.transition()
      .duration(350)
      .delay(nd.depth * DEPTH_DELAY)
      .ease(d3.easeBackOut.overshoot(1.3))
      .attr('transform', `translate(${nd.x},${nd.y}) scale(1)`);
    // Box
    nodeGroup.append('rect')
      .attr('x', -BOX_W / 2).attr('y', -BOX_H / 2)
      .attr('width', BOX_W).attr('height', BOX_H)
      .attr('rx', 8)
      .attr('fill', color);
    // Label
    nodeGroup.append('text')
      .attr('dy', '1px')
      .attr('font-size', '11px')
      .text(label);
    // Click : show popup + highlight in editor
    nodeGroup.on('click', function(event) {
      event.stopPropagation();
      d3.selectAll('.ast-node').classed('selected', false);
      d3.select(this).classed('selected', true);
      showNodePopup(nd);
      highlightInEditor(data.start, data.end);
    });
  });
  // Click on empty space - close popup
  svg.on('click', () => {
    document.getElementById('node-popup').classList.add('hidden');
    d3.selectAll('.ast-node').classed('selected', false);
  });
}
//Node info popup 
function showNodePopup(nd) {
  const popup = document.getElementById('node-popup');
  const data  = nd.data;
  document.getElementById('popup-type').textContent = data.type;
  const rows = [
    ['Value',    data.value  != null ? data.value : '—'],
    ['Line',     data.line   || '—'],
    ['Depth',    nd.depth],
    ['Children', (data.children || []).length],
  ];
  document.getElementById('popup-body').innerHTML = rows.map(([k, v]) => `
    <div class="popup-row">
      <span class="popup-label">${k}</span>
      <span class="popup-value">${escHtml(String(v))}</span>
    </div>
  `).join('');
  popup.classList.remove('hidden');
}
//Highlight a range in the Monaco editor
function highlightInEditor(start, end) {
  const editor = window.monacoEditor;
  if (!editor || start === undefined || end === undefined) return;
  const model = editor.getModel();
  const sPos  = model.getPositionAt(start);
  const ePos  = model.getPositionAt(end);
  editor.setSelection({
    startLineNumber: sPos.lineNumber, startColumn: sPos.column,
    endLineNumber:   ePos.lineNumber, endColumn:   ePos.column,
  });
}
//  PIPELINE STAGE INDICATORS
function resetPipelineStages() {
  document.querySelectorAll('.stage').forEach(el => {
    el.classList.remove('active', 'done', 'error');
  });
}
function activateStage(name) {
  const el = document.querySelector(`.stage[data-stage="${name}"]`);
  if (el) el.classList.add('active');
}
function doneStage(name) {
  const el = document.querySelector(`.stage[data-stage="${name}"]`);
  if (el) { el.classList.remove('active'); el.classList.add('done'); }
}
function errorStage(name) {
  const el = document.querySelector(`.stage[data-stage="${name}"]`);
  if (el) { el.classList.remove('active'); el.style.borderColor = 'var(--err-error)'; }
}
//  TAB SWITCHING
function switchTab(tabId) {
  document.querySelectorAll('.tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabId);
  });
  document.querySelectorAll('.tab-pane').forEach(pane => {
    const active = pane.id === 'tab-' + tabId;
    pane.classList.toggle('hidden', !active);
    pane.classList.toggle('active', active);
  });
}
//  MONACO EDITOR
function initMonaco() {
  require.config({
    paths: { vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.44.0/min/vs' }
  });
  require(['vs/editor/editor.main'], function() {
    const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
    window.monacoEditor = monaco.editor.create(document.getElementById('monaco-editor'), {
      value:           SAMPLE_CODE,
      language:        'c',          
      theme:           isDark ? 'vs-dark' : 'vs',
      fontSize:        13,
      fontFamily:      "'JetBrains Mono', monospace",
      minimap:         { enabled: false },
      scrollBeyondLastLine: false,
      automaticLayout: true,
      lineNumbers:     'on',
      scrollbar:       { vertical: 'auto', horizontal: 'auto' },
      renderLineHighlight: 'line',
      wordWrap:        'on',
    });
    // Ctrl+Enter : compile
    window.monacoEditor.addCommand(
      monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter,
      compileCode
    );
    window.updateMonacoTheme = function(isDark) {
      monaco.editor.setTheme(isDark ? 'vs-dark' : 'vs');
    };
  });
}
//  THEME TOGGLE
function initTheme() {
  const html    = document.documentElement;
  const btn     = document.getElementById('theme-toggle');
  const stored  = localStorage.getItem('liteLangTheme') || 'dark';
  html.setAttribute('data-theme', stored);
  btn.addEventListener('click', function() {
    const current = html.getAttribute('data-theme');
    const next    = current === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-theme', next);
    localStorage.setItem('liteLangTheme', next);
    if (window.updateMonacoTheme) window.updateMonacoTheme(next === 'dark');
  });
}
// Escape HTML special characters so values display safely
function escHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
// wire everything up once the page is ready
document.addEventListener('DOMContentLoaded', function() {
  initTheme();  initMonaco();
  // Compile button
  document.getElementById('compile-btn').addEventListener('click', compileCode);
  // Tab buttons
  document.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
  // AST popup close button
  document.getElementById('popup-close').addEventListener('click', function() {
    document.getElementById('node-popup').classList.add('hidden');
    d3.selectAll('.ast-node').classed('selected', false);
  });
  // VM buttons
  document.getElementById('btn-run'  ).addEventListener('click', () => window.runVM());
  document.getElementById('btn-step' ).addEventListener('click', () => window.stepVM());
  document.getElementById('btn-reset').addEventListener('click', () => window.resetVM());
});