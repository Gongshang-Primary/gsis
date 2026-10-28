'use strict';
// Extracted request-handler fixtures must use the same build label as the full backend.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),{parse}=require('acorn');
const source=fs.readFileSync(path.resolve(__dirname,'../../backend/Roster.gs'),'utf8');
const declaration=parse(source,{ecmaVersion:2020}).body.find(node=>node.type==='FunctionDeclaration'&&node.id.name==='rosterDiagnosticBuild_');
assert(declaration,'The canonical diagnostic helper must be present');
module.exports=context=>vm.runInContext(source.slice(declaration.start,declaration.end),context);
