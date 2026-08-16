import { describe, expect, it } from 'vitest';
import crypto from 'node:crypto';
import { auditTrackedJavaScript, compareJavaScriptAuditSnapshots, countPhysicalLines, createJavaScriptAuditSnapshot } from './JavaScriptAuditGate.js';

const hash = source => crypto.createHash('sha256').update(source).digest('hex');

function audit(files, exceptions = []) {
  return auditTrackedJavaScript({
    root: process.cwd(),
    paths: Object.keys(files),
    readFile: file => files[file],
    exceptionManifest: { exceptions }
  });
}

describe('JavaScriptAuditGate', () => {
  it('counts every physical line, including empty lines and comments', () => {
    expect(countPhysicalLines('// one\n\n// three\n')).toBe(4);
    const report = audit({ 'src/systems/LineCounter.js': '// one\n\n// three\n' });
    expect(report.units[0]).toMatchObject({ physicalLines: 4, responsibility: 'businessLogic' });
  });

  it('uses tracked scope and reports inclusion and exclusion reasons', () => {
    const report = audit({
      'src/systems/Active.js': 'export const active = true;\n',
      'editor/index.html': '<script>window.boot = true;</script>',
      'test/a.test.js': 'throw new Error();',
      'example/sanguo_zhangjiao/data/content.js': 'export default {};',
      'desktop/main.js': 'console.log(1);',
      'dist/out.js': 'console.log(1);',
      'docs/guide.js': 'console.log(1);'
    });
    expect(report.included.map(entry => entry.file)).toEqual(['editor/index.html', 'src/systems/Active.js']);
    expect(report.units.find(unit => unit.file === 'editor/index.html#script:1')).toMatchObject({
      physicalLines: 1,
      responsibility: 'editorInteraction'
    });
    expect(report.excluded).toEqual(expect.arrayContaining([
      expect.objectContaining({ file: 'test/a.test.js', reason: 'test source' }),
      expect.objectContaining({ file: 'desktop/main.js' }),
      expect.objectContaining({ file: 'dist/out.js' }),
      expect.objectContaining({ file: 'docs/guide.js' })
    ]));
  });

  it('classifies execution units into exactly one permitted responsibility', () => {
    const report = audit({
      'src/core/SceneGameplaySystemAssembler.js': 'export const make = () => ({});',
      'src/systems/QuestTransactionService.js': 'export const apply = () => ({});',
      'src/ui/QuestPanel.js': 'export const render = () => ({});',
      'editor/SceneEditorInteraction.js': 'export const bind = () => ({});'
    });
    expect(report.units.map(unit => unit.responsibility)).toEqual([
      'editorInteraction', 'assembly', 'businessLogic', 'presentation'
    ]);
    expect(report.units.every(unit => ['assembly', 'businessLogic', 'presentation', 'editorInteraction'].includes(unit.responsibility))).toBe(true);
  });

  it('finds responsibility-boundary violations and forbidden architecture shortcuts', () => {
    const report = audit({
      'src/systems/IllegalBusiness.js': 'document.querySelector("#app");\nnew Date();\nMath.random();\nif (online) {}',
      'src/ui/IllegalView.js': 'inventory.quantity = 1;',
      'editor/IllegalEditor.js': 'fetch("/api/save-file", { method: "POST" });\nstory.chapter = 2;',
      'src/core/IllegalAssembler.js': 'document.createElement("canvas");\nstats.hp = 1;',
      'src/systems/IllegalFlow.js': 'function S11Action() {}\nif (sceneId === "S11") {}\nsetTimeout(() => {}, 1);\nimport(modulePath);\nconst singleton = Singleton;\nsync(clientState);'
    });
    expect(report.violations.map(violation => violation.code)).toEqual(expect.arrayContaining([
      'business-dom-or-canvas-access',
      'direct-business-clock-or-random',
      'business-online-branch',
      'presentation-business-state-write',
      'editor-command-service-bypass',
      'editor-business-state-write',
      'assembly-presentation-overreach',
      'assembly-business-overreach',
      'content-named-handler',
      'content-flow-branch',
      'story-timer',
      'arbitrary-module-path',
      'singleton-or-service-locator',
      'whole-client-state-submit'
    ]));
  });


  it('accepts only exact external-contract exceptions and never exempts responsibility checks', () => {
    const oversized = Array.from({ length: 1001 }, () => '// contract line').join('\n');
    const validException = {
      file: 'src/systems/ExternalContract.js',
      evidence: 'https://example.invalid/external-contract',
      lines: 1001,
      responsibility: 'businessLogic',
      owner: 'architecture-owner',
      date: '2026-08-14',
      contentHash: hash(oversized)
    };
    const accepted = audit({ 'src/systems/ExternalContract.js': oversized }, [validException]);
    expect(accepted.units[0].exception.status).toBe('valid');
    expect(accepted.violations.some(violation => violation.code === 'line-limit-or-invalid-exception')).toBe(false);

    const grown = audit({ 'src/systems/ExternalContract.js': `${oversized}\n// added` }, [validException]);
    expect(grown.units[0].exception).toMatchObject({ status: 'invalid' });
    expect(grown.violations).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'line-limit-or-invalid-exception' })
    ]));

    const presentationSource = `${Array.from({ length: 1001 }, () => '// contract line').join('\n')}\ninventory.quantity = 2;`;
    const presentationException = {
      ...validException,
      file: 'src/ui/ExternalContractView.js',
      responsibility: 'presentation',
      lines: 1002,
      contentHash: hash(presentationSource)
    };
    const stillChecked = audit({ 'src/ui/ExternalContractView.js': presentationSource }, [presentationException]);
    expect(stillChecked.units[0].exception.status).toBe('valid');
    expect(stillChecked.violations).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'presentation-business-state-write' })
    ]));
  });
});


describe('JavaScriptAuditGate hash snapshots', () => {
  it('records each audited executable unit and reports added, removed, and changed hashes', () => {
    const before = createJavaScriptAuditSnapshot({
      root: process.cwd(),
      paths: ['src/systems/A.js', 'src/systems/Removed.js'],
      readFile: file => ({
        'src/systems/A.js': 'export const value = 1;\n',
        'src/systems/Removed.js': 'export const removed = true;\n'
      })[file]
    });
    const after = createJavaScriptAuditSnapshot({
      root: process.cwd(),
      paths: ['src/systems/A.js', 'src/systems/Added.js'],
      readFile: file => ({
        'src/systems/A.js': 'export const value = 2;\n',
        'src/systems/Added.js': 'export const added = true;\n'
      })[file]
    });

    expect(before.hashes).toEqual(expect.objectContaining({ 'src/systems/A.js': expect.any(String) }));
    expect(compareJavaScriptAuditSnapshots(before, before)).toMatchObject({ equal: true, changeCount: 0 });
    expect(compareJavaScriptAuditSnapshots(before, after).changes).toEqual([
      expect.objectContaining({ file: 'src/systems/A.js', kind: 'changed' }),
      expect.objectContaining({ file: 'src/systems/Added.js', kind: 'added' }),
      expect.objectContaining({ file: 'src/systems/Removed.js', kind: 'removed' })
    ]);
  });
});