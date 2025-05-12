function validateDocument(document) {
    if (document.languageId !== 'stackscript') return;

    const diagnostics = [];
    const text = document.getText();
    const lines = text.split('\n');
    const variables = new Set();
    // ... (keep existing function/module logic)

    // Collect variables declared with SET
    lines.forEach((line, lineNumber) => {
        const trimmed = line.trim();
        if (trimmed.startsWith('SET')) {
            const parts = trimmed.split(/\s+/);
            if (parts.length < 2) {
                diagnostics.push(new vscode.Diagnostic(
                    new vscode.Range(lineNumber, 0, lineNumber, line.length),
                    'SET command missing variable name',
                    vscode.DiagnosticSeverity.Error
                ));
                return;
            }
            const varName = parts[1];
            variables.add(varName);
        }
    });

    // Validate variable references
    lines.forEach((line, lineNumber) => {
        const varRefs = Array.from(line.matchAll(/%VAR<([A-Za-z_][A-Za-z0-9_]*)>/g));
        varRefs.forEach(match => {
            const varName = match[1];
            const startPos = match.index;
            const endPos = startPos + match[0].length;
            
            if (!variables.has(varName)) {
                diagnostics.push(new vscode.Diagnostic(
                    new vscode.Range(
                        lineNumber,
                        startPos,
                        lineNumber,
                        endPos
                    ),
                    `Undefined variable: ${varName}`,
                    vscode.DiagnosticSeverity.Error
                ));
            }
        });
    });

    // ... (rest of existing validation logic)
    diagnosticCollection.set(document.uri, diagnostics);
}