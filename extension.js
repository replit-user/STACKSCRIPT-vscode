const vscode = require('vscode');
const fs = require('fs');
const path = require('path');

function activate(context) {
    // Autocomplete
    const provider = vscode.languages.registerCompletionItemProvider('stackscript', {
        provideCompletionItems(document, position) {
            const completions = [];
            // Opcodes
            const keywords = [
                'ADD', 'SUB', 'MUL', 'DIV', 'EXP', 'PUSH', 'POP', 'OUT', 'HALT',
                'CALL', 'READ', 'SPREAD', 'JMP', 'JMPGT', 'JMPLT', 'JMPEQ', 'BOTOP',
                'CLEAR', 'COPY', 'DUP', 'SPUSH', 'PUD', 'SWAP', 'SPOUTV', 'S-SWAP',
                'READFILE', 'WRITEFILE', 'APPENDFILE', 'DELETEFILE', 'CREATEFILE',
                'CREATEFOLDER', 'DELETEFOLDER', 'SWAPMEM', 'CHOICE-1', 'CHOICE-2',
                'RANDINT', 'RANDOM', 'SYSTEM', 'OUTV', 'TOP', "LOAD", "TOP"
            ];

            keywords.forEach(keyword => {
                const item = new vscode.CompletionItem(keyword, vscode.CompletionItemKind.Keyword);
                item.detail = 'StackScript Opcode';
                completions.push(item);
            });

            return completions;
        }
    });

    // Diagnostics (Error checking)
    const diagnosticCollection = vscode.languages.createDiagnosticCollection('stackscript');
    context.subscriptions.push(diagnosticCollection);

    vscode.workspace.onDidOpenTextDocument(validateDocument);
    vscode.workspace.onDidSaveTextDocument(validateDocument);
    vscode.workspace.onDidChangeTextDocument(e => validateDocument(e.document));

    function validateDocument(document) {
        if (document.languageId !== 'stackscript') return;

        const diagnostics = [];
        const text = document.getText();
        const lines = text.split('\n');
        const functions = new Set();
        let inFunction = false;

        // Collect local functions
        lines.forEach((line, lineNumber) => {
            const trimmed = line.trim();
            if (trimmed.endsWith(':')) {
                const funcName = trimmed.slice(0, -1).trim();
                functions.add(funcName);
                inFunction = true;
            }
            if (trimmed === 'ENDFUNC') {
                inFunction = false;
            }
        });

        // Process LOAD commands
        const currentDir = path.dirname(document.uri.fsPath);
        const modulesToLoad = [];

        // Find and validate LOAD commands
        lines.forEach((line, lineNumber) => {
            const trimmed = line.trim();
            if (trimmed.startsWith('LOAD')) {
                const match = trimmed.match("LOAD .*");
                if (match) {
                    const moduleName = match[1];
                    const modulePath = path.join(currentDir, `${moduleName}.stackm`);
                    modulesToLoad.push({ modulePath, lineNumber, originalLine: line });
                } else {
                    // Invalid LOAD syntax
                    const range = new vscode.Range(
                        new vscode.Position(lineNumber, 0),
                        new vscode.Position(lineNumber, line.length)
                    );
                    diagnostics.push(new vscode.Diagnostic(
                        range,
                        'Invalid LOAD syntax. Expected LOAD "filename"',
                        vscode.DiagnosticSeverity.Error
                    ));
                }
            }
        });

        // Process modules
        modulesToLoad.forEach(({ modulePath, lineNumber, originalLine }) => {
            if (!fs.existsSync(modulePath)) {
                // Module not found error
                const range = new vscode.Range(
                    new vscode.Position(lineNumber, 0),
                    new vscode.Position(lineNumber, originalLine.length)
                );
                diagnostics.push(new vscode.Diagnostic(
                    range,
                    `Module not found: ${path.basename(modulePath)}`,
                    vscode.DiagnosticSeverity.Error
                ));
            } else {
                // Read module and collect EXTERN functions
                try {
                    const content = fs.readFileSync(modulePath, 'utf8');
                    content.split('\n').forEach(moduleLine => {
                        const trimmedLine = moduleLine.trim();
                        if (trimmedLine.startsWith('EXTERN ')) {
                            const funcName = trimmedLine.substring(7).trim();
                            functions.add(funcName);
                        }
                    });
                } catch (err) {
                    const range = new vscode.Range(
                        new vscode.Position(lineNumber, 0),
                        new vscode.Position(lineNumber, originalLine.length)
                    );
                    diagnostics.push(new vscode.Diagnostic(
                        range,
                        `Error reading module: ${err.message}`,
                        vscode.DiagnosticSeverity.Error
                    ));
                }
            }
        });

        // Check for missing HALT
        if (!text.includes('HALT')) {
            const lastLine = document.lineAt(document.lineCount - 1);
            const range = new vscode.Range(lastLine.range.start, lastLine.range.end);
            diagnostics.push(new vscode.Diagnostic(
                range,
                'No HALT instruction found',
                vscode.DiagnosticSeverity.Warning
            ));
        }

        // Check function calls
        lines.forEach((line, lineNumber) => {
            const trimmed = line.trim();
            if (trimmed.startsWith('CALL')) {
                const match = trimmed.match(/^CALL\s+(\S+)/);
                if (match) {
                    const funcName = match[1];
                    if (!functions.has(funcName)) {
                        const range = new vscode.Range(
                            new vscode.Position(lineNumber, 0),
                            new vscode.Position(lineNumber, line.length)
                        );
                        diagnostics.push(new vscode.Diagnostic(
                            range,
                            `Undefined function: ${funcName}`,
                            vscode.DiagnosticSeverity.Error
                        ));
                    }
                } else {
                    const range = new vscode.Range(
                        new vscode.Position(lineNumber, 0),
                        new vscode.Position(lineNumber, line.length)
                    );
                    diagnostics.push(new vscode.Diagnostic(
                        range,
                        'Invalid CALL syntax. Expected CALL functionName',
                        vscode.DiagnosticSeverity.Error
                    ));
                }
            }
        });

        diagnosticCollection.set(document.uri, diagnostics);
    }

    context.subscriptions.push(provider);
}

function deactivate() {}

module.exports = { activate, deactivate };