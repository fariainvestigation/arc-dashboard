import fs from 'node:fs';

function read(path){ return fs.readFileSync(path,'utf8'); }
function expect(cond,msg){ if(!cond){ console.error('FAIL:',msg); process.exitCode=1; } }

const intake=read('cases/arc_case_intake.js');
const intakePage=read('cases/intake/index.html');
const notebook=read('arc-notebook.html');
const bridge=read('arc_unified_bridge.js');
const assets=read('arc_report_assets.js');
const preflight=read('arc_preflight.html');

expect(/async function intakeGenerate\(/.test(intake),'Initiate Case must be async.');
expect(/saveCaseAsync/.test(intake),'Initiate Case must await the server case save.');
expect(/await intakePromoteUploadsToServer/.test(intake),'Initiate Case must secure intake files before navigation.');
expect(/arc-notebook\.html\?case=/.test(intake),'Initiate Case must navigate to the canonical case Notebook.');
expect(!/arc:case-updated[\s\S]{0,700}window\.location\.href/.test(intakePage),'Intake page must not redirect before R2 promotion finishes.');
expect(/saveCaseAsync: saveCaseAsync/.test(bridge),'Unified bridge must expose saveCaseAsync.');
expect(/source\.case && typeof source\.case/.test(bridge),'Unified bridge must unwrap GET case responses.');
expect(/params\.get\("caseId"\) \|\| params\.get\("case"\)/.test(bridge),'Unified bridge must hydrate Notebook ?case= URLs.');
expect(/MutationObserver/.test(bridge) && /input\[type="file"\]/.test(bridge),'Universal drag/drop must cover dynamically rendered file inputs.');
expect(/SOURCE_TYPES = \["source-document"\]/.test(assets),'Case source documents must be a first-class R2 asset type.');
expect(/arc-logo-real\.webp/.test(notebook),'Notebook must use the real ARC logo.');
expect(/Extract all pictures/.test(notebook) && /extractAllPictures/.test(notebook),'Notebook must expose picture extraction.');
expect(/syncFromServerAssets/.test(notebook) && /source-document/.test(notebook),'Notebook must automatically hydrate case documents from R2.');
expect(/Notebook could not finish loading/.test(notebook),'Notebook must show a visible startup error instead of freezing.');
expect(/runDetailed\("evidence\.extract"[\s\S]{0,180}caseId:caseId/.test(preflight),'Gemini preflight must pass the active case id explicitly.');
expect(/runDetailed\("report\.final\.draft"[\s\S]{0,220}caseId:caseId/.test(preflight),'Claude preflight must pass the active case id explicitly.');

if(!process.exitCode) console.log('Notebook upgrade check passed: case handoff, R2 document sync, real logo, drag/drop, picture extraction, and visible startup errors are wired.');
