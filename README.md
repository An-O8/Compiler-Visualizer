# LiteLang Compiler Visualizer

A browser-based tool that compiles a small language called **LiteLang** and lets you see exactly what happens at every stage i.e, from raw source text to executing bytecode.

Built with vanilla JavaScript, no build step needed.

## LiteLang

LiteLang is a small, statically typed language designed to be easy to compile and visualize. It supports:

- Types : `int`, `float`, `bool`, `string`
- Variable declarations : `let`, `const`, `var`
- Control flow: `if / else`, `while`, `for`, `break`, `continue`, `return`
- Operators : arithmetic (`+ - * / %`), comparison (`== != < > <= >=`), logical (`&& || !`), compound assignment (`+= -= *= /= %=`)
- Built-in `print()` statement
- Line comments `//` and block comments `/* */`

Example: let int x = 10;
let int y = 3;
if (x > y) {
print(x - y);
}

## The Compiler Pipeline

Each stage runs in sequence and gets its own tab in the UI:

**1. Lexer** (`lexer.js`) — Breaks raw source into a token stream, tagging every word and symbol with its type and source position.

**2. Parser** (`parser.js`) — Builds an Abstract Syntax Tree (AST) from the token stream. Visualized as an interactive D3 tree diagram.

**3. Optimizer** (`optimizer.js`) — Simplifies the AST before code generation via constant folding.

**4. Semantic Analysis** (`semantic.js`) — Walks the AST to validate types and scopes, catching errors like undeclared variables or type mismatches.

**5. IR Generation** (`ir.js`) — Converts the AST into a three address intermediate representation.

**6. Bytecode** (`bytecode.js`) — Compiles the IR down to a list of stack machine instructions.

**7. VM** (`vm.js`) — Executes the bytecode. You can step through one instruction at a time and watch the stack and memory change live.

## Running It

No installation or build step - just open `index.html` in your browser :

```bash
git clone https://github.com/YOUR_USERNAME/compiler-visualizer.git
cd compiler-visualizer
open index.html
```

If your browser blocks local file imports, serve it with any static server:

```bash
npx serve .
# or
python3 -m http.server 8080
```
## Features

- **Monaco Editor** (VS Code's editor) with full keyboard shortcuts
- **D3 AST visualizer** - pannable and zoomable tree of your program's structure
- **Step through VM** - execute one bytecode instruction at a time, inspecting the stack and memory at each step
- **Dark / light theme** toggle
- **Optimizer toggle** - compile with or without constant folding to compare outputs

## Project Structure


```md
Compiler Visualizer/
├── index.html      # UI layout and tab structure
├── style.css       # Theme variables and layout
├── app.js          # Pipeline and D3 AST renderer
├── lexer.js        # Stage 1 - tokenizer
├── parser.js       # Stage 2 - recursive descent parser
├── optimizer.js    # Stage 3 - constant folding optimizer
├── semantic.js     # Stage 4 - type checker and scope analyzer
├── ir.js           # Stage 5 - IR generator
├── bytecode.js     # Stage 6 - bytecode compiler
└── vm.js           # Stage 7 - stack-based virtual machine
```
