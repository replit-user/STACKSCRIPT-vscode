const vscode = require('vscode');
const fs = require('fs');
const path = require('path');

function activate(context) {
    const commandHandler = vscode.commands.registerCommand('stackscript-activate', () => {
        vscode.window.showInformationMessage('STACKSCRIPT activated');
    })
    context.subscriptions.push(commandHandler);
    const provider = vscode.languages.registerCompletionItemProvider('stackscript', {
        provideCompletionItems(document, position) {
            const completions = [];
            const keywords = [
                'ADD', 'SUB', 'MUL', 'DIV', 'EXP', 'PUSH', 'POP', 'OUT', 'HALT',
                'CALL', 'READ', 'SPREAD', 'JMP', 'JMPGT', 'JMPLT', 'JMPEQ', 'BOTOP',
                'CLEAR', 'COPY', 'DUP', 'SPUSH', 'PUD', 'SWAP', 'SPOUTV', 'S-SWAP',
                'READFILE', 'WRITEFILE', 'APPENDFILE', 'DELETEFILE', 'CREATEFILE',
                'CREATEFOLDER', 'DELETEFOLDER', 'SWAPMEM', 'CHOICE-1', 'CHOICE-2',
                'RANDINT', 'RANDOM', 'SYSTEM', 'OUTV', 'TOP', "LOAD", "TOP","ENDFUNC", "BREAKPOINT"
            ];

            keywords.forEach(keyword => {
                const item = new vscode.CompletionItem(keyword, vscode.CompletionItemKind.Keyword);
                item.detail = 'StackScript Opcode';
                completions.push(item);
            });

            return completions;
        }
    }
    
);

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
        const modulesProcessed = new Set();
        const currentDir = path.dirname(document.uri.fsPath);

        // Validate EXTERN usage in main file
        lines.forEach((line, lineNumber) => {
            if (line.trim().startsWith('EXTERN')) {
                diagnostics.push(new vscode.Diagnostic(
                    new vscode.Range(lineNumber, 0, lineNumber, line.length),
                    "EXTERN can only be used in module files",
                    vscode.DiagnosticSeverity.Error
                ));
            }
        });

        // Collect local functions
        lines.forEach((line, lineNumber) => {
            const trimmed = line.trim();
            if (trimmed.endsWith(':')) {
                functions.add(trimmed.slice(0, -1).trim());
            }
        });

        // Process LOAD commands
        lines.forEach((line, lineNumber) => {
            const trimmed = line.trim();
            if (trimmed.startsWith('LOAD')) {
                const moduleArg = trimmed.slice(4).trim(); // Get part after LOAD
                const match = moduleArg.match(/^"([^"]+)"|(\S+)/); // Handle quoted and unquoted module names
                if (!match) {
                    diagnostics.push(new vscode.Diagnostic(
                        new vscode.Range(lineNumber, 0, lineNumber, line.length),
                        'Invalid LOAD syntax. Expected LOAD "modulename"',
                        vscode.DiagnosticSeverity.Error
                    ));
                    return;
                }

                const moduleName = match[1] || match[2];
                if (!moduleName) {
                    diagnostics.push(new vscode.Diagnostic(
                        new vscode.Range(lineNumber, 0, lineNumber, line.length),
                        'Invalid LOAD syntax. Module name missing',
                        vscode.DiagnosticSeverity.Error
                    ));
                    return;
                }

                const moduleBase = path.join(currentDir, moduleName);
                const stackmPath = `${moduleBase}.stackm`;
                const stackPath = `${moduleBase}.stack`;

                // Check if both module files exist
                let missingFiles = [];
                if (!fs.existsSync(stackmPath)) missingFiles.push(`${moduleName}.stackm`);
                if (!fs.existsSync(stackPath)) missingFiles.push(`${moduleName}.stack`);
                if (missingFiles.length > 0) {
                    diagnostics.push(new vscode.Diagnostic(
                        new vscode.Range(lineNumber, 0, lineNumber, line.length),
                        `Missing module files: ${missingFiles.join(', ')}`,
                        vscode.DiagnosticSeverity.Error
                    ));
                    return;
                }

                // Process module metadata (.stackm)
                try {
                    const stackmContent = fs.readFileSync(stackmPath, 'utf8');
                    stackmContent.split('\n').forEach(moduleLine => {
                        const trimmedLine = moduleLine.trim();
                        if (trimmedLine.startsWith('EXTERN')) {
                            trimmedLine.substring(6).trim().split(/\s+/).forEach(funcName => {
                                if (funcName) functions.add(`${moduleName}.${funcName}`);
                            });
                        }
                    });
                } catch (err) {
                    diagnostics.push(new vscode.Diagnostic(
                        new vscode.Range(lineNumber, 0, lineNumber, line.length),
                        `Error reading module metadata: ${err.message}`,
                        vscode.DiagnosticSeverity.Error
                    ));
                }

                modulesProcessed.add(moduleName);
            }
        });

        // Validate CALL instructions
        lines.forEach((line, lineNumber) => {
            const trimmed = line.trim();
            if (trimmed.startsWith('CALL')) {
                const match = trimmed.match(/^CALL\s+([\w.]+)/);
                if (!match) {
                    diagnostics.push(new vscode.Diagnostic(
                        new vscode.Range(lineNumber, 0, lineNumber, line.length),
                        'Invalid CALL syntax. Expected CALL [module.]function',
                        vscode.DiagnosticSeverity.Error
                    ));
                    return;
                }

                const fullName = match[1];
                if (!functions.has(fullName)) {
                    if (fullName.includes('.')) {
                        const [moduleName, funcName] = fullName.split('.');
                        if (!modulesProcessed.has(moduleName)) {
                            diagnostics.push(new vscode.Diagnostic(
                                new vscode.Range(lineNumber, 0, lineNumber, line.length),
                                `Module not loaded: ${moduleName}`,
                                vscode.DiagnosticSeverity.Error
                            ));
                        } else {
                            diagnostics.push(new vscode.Diagnostic(
                                new vscode.Range(lineNumber, 0, lineNumber, line.length),
                                `Function not exported by module: ${funcName}`,
                                vscode.DiagnosticSeverity.Error
                            ));
                        }
                    } else {
                        diagnostics.push(new vscode.Diagnostic(
                            new vscode.Range(lineNumber, 0, lineNumber, line.length),
                            `Undefined function: ${fullName}`,
                            vscode.DiagnosticSeverity.Error
                        ));
                    }
                }
            }
        });

        // HALT instruction check
        if (!text.includes('HALT')) {
            const lastLine = document.lineAt(document.lineCount - 1);
            diagnostics.push(new vscode.Diagnostic(
                lastLine.range,
                'No HALT instruction found',
                vscode.DiagnosticSeverity.Warning
            ));
        }

        diagnosticCollection.set(document.uri, diagnostics);
    }

    context.subscriptions.push(provider);
}

function deactivate() {}

module.exports = { activate, deactivate };