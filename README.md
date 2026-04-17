# LiteLang Compiler Visualizer

A browser-based tool that compiles a small language called **LiteLang** and visualizes every stage of the compilation pipeline - from raw source text to executing bytecode, step by step.

🔗 **Live Demo:** https://compiler-visualizer.netlify.app/

Built with vanilla JavaScript. No installation or build step needed.

---

## LiteLang

LiteLang is a small, statically typed language designed to be easy to compile and visualize.

### Syntax

**Variable Declarations**
```
let x = 10;
const pi = 3.14;
var name = "Alice";
int count = 0;
float temp = 36.6;
bool flag = true;
string msg = "hello";
```

**Control Flow**
```
if (x > 0) {
  print(x);
} else {
  print(0);
}
```

```
while (x > 0) {
  x -= 1;
}
```

```
for (int i = 0; i < 5; i += 1) {
  print(i);
}
```

**Operators**
- Arithmetic: `+ - * / %`
- Comparison: `== != < > <= >=`
- Logical: `&& || !`
- Compound assignment: `+= -= *= /= %=`

**Comments**
```
// line comment
/* block comment */
```

### Example Program — Fibonacci
```
int a = 0;
int b = 1;
int i = 0;
while (i < 10) {
  int temp = a + b;
  a = b;
  b = temp;
  i += 1;
  print(a);
}
```

---

## The Compiler Pipeline

Each stage runs in sequence and gets its own tab in the UI:

| Stage | File | Description |
|-------|------|-------------|
| 1. Lexer | `lexer.js` | Breaks source into a token stream, tagging every word and symbol with its type and position |
| 2. Parser | `parser.js` | Builds an Abstract Syntax Tree (AST) using recursive descent parsing |
| 3. Optimizer | `optimizer.js` | Simplifies the AST via constant folding before code generation |
| 4. Semantic Analysis | `semantic.js` | Validates types and scopes, catching errors like undeclared variables or type mismatches |
| 5. IR Generation | `ir.js` | Converts the AST into a three address intermediate representation |
| 6. Bytecode | `bytecode.js` | Compiles the IR into stack machine instructions |
| 7. VM | `vm.js` | Executes the bytecode, one instruction at a time |

---

## Features

- **Monaco Editor** — VS Code's editor with full keyboard shortcuts and syntax highlighting
- **D3 AST Visualizer** — interactive, pannable and zoomable tree of your program's structure
- **Step-through VM** — execute one bytecode instruction at a time, watching the stack and memory change live
- **Errors tab** — all parser, semantic, and runtime errors shown in one place with line numbers
- **Dark / Light theme** toggle
- **Optimizer toggle** — compile with or without constant folding to compare outputs

---

## Running Locally

```bash
git clone https://github.com/An-O8/Compiler-Visualizer.git
cd Compiler-Visualizer
open index.html
```

If your browser blocks local file imports, serve it with any static server:

```bash
npx serve .
# or
python3 -m http.server 8080
```

Then open `http://localhost:8080` in your browser.

---

## Project Structure

```
Compiler-Visualizer/
├── index.html       # UI layout and tab structure
├── style.css        # Theme variables and layout
├── app.js           # Pipeline orchestration and D3 AST renderer
├── lexer.js         # Stage 1 - tokenizer
├── parser.js        # Stage 2 - recursive descent parser
├── optimizer.js     # Stage 3 - constant folding optimizer
├── semantic.js      # Stage 4 - type checker and scope analyzer
├── ir.js            # Stage 5 - IR generator
├── bytecode.js      # Stage 6 - bytecode compiler
└── vm.js            # Stage 7 - stack-based virtual machine
```

---

## Deployment

Deployed on **Netlify** via GitHub integration.

Live at: https://compiler-visualizer.netlify.app/
