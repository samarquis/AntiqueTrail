import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';

const html = readFileSync(new URL('./full-site.html', import.meta.url), 'utf8');
const inline = html.match(/<script>([\s\S]*)<\/script>/)[1];
const source = inline.slice(0, inline.indexOf("document.addEventListener('click'")) +
  inline.match(/const privateScreens=\[[^;]+;/)[0] +
  inline.slice(inline.indexOf('function onHash()'), inline.indexOf("window.addEventListener('hashchange'"));

function fixture() {
  const elements = new Map();
  const forms = [];
  const context = createContext({
    structuredClone, URL, console,
    location: { hash: '#plan', href: 'http://localhost/full-site.html#plan' },
    history: { back() {} },
    window: { scrollTo() {} },
    navigator: {},
    FormData: class { constructor(form) { return form.values[Symbol.iterator](); } },
    document: {
      body: { classList: { toggle() {} } }, activeElement: null,
      querySelectorAll(selector) { return selector === 'main form' ? forms : []; },
      querySelector(selector) {
        if (selector === 'main form') return forms[0];
        if (!elements.has(selector)) elements.set(selector, { innerHTML: '', dataset: {}, showModal() {}, focus() {} });
        return elements.get(selector);
      },
    },
  });
  runInContext(source, context);
  const run = code => runInContext(code, context);
  run("S.role='shopper'; S.person='Mara'; route='plan'");
  return { run, forms, elements };
}

test('visit drafts stay with the account, outing and stop', () => {
  const { run } = fixture();
  const blue = run("route='visit'; draftKey()");
  run("formDrafts[draftKey()]={note:'Blue Finch only',rating:'5'}; tripProgress().stop=1");
  assert.notEqual(run('draftKey()'), blue);
  assert.equal(run("formDrafts[draftKey()]?.note"), undefined);
  run('tripProgress().stop=0');
  assert.equal(run('formDrafts[draftKey()].note'), 'Blue Finch only');
  run("currentTrip().id='another-outing'; selectTrip('another-outing')");
  assert.notEqual(run('draftKey()'), blue);
  run("S.person='Alex'");
  assert.notEqual(run('draftKey()'), blue);
});

test('all Plan forms retain unfinished input without retaining unchecked values', () => {
  const { run, forms } = fixture();
  const key = run('draftKey()');
  forms.push({ dataset: { draftKey: key }, elements: [{name:'date'}], values: [['date','2026-10-18']] });
  forms.push({ dataset: { draftKey: key }, elements: [{name:'start'},{name:'time'},{name:'ack'}], values: [['start','Fictional café ☕'],['time','11:30']] });
  run('formDrafts[draftKey()]={ack:"on"}; stash()');
  assert.equal(run('formDrafts[draftKey()].date'), '2026-10-18');
  assert.equal(run('formDrafts[draftKey()].start'), 'Fictional café ☕');
  assert.equal(run('formDrafts[draftKey()].time'), '11:30');
  assert.equal(run('formDrafts[draftKey()].ack'), undefined);
});

test('ordinary links stash unfinished forms before replacing the page', () => {
  const { run, forms } = fixture();
  const key = run('draftKey()');
  forms.push({ dataset: { draftKey: key }, elements: [{name:'start'}], values: [['start','Fictional café ☕']] });
  run("location.hash='#suggestion'; onHash()");
  assert.equal(run(`formDrafts[${JSON.stringify(key)}]?.start`), 'Fictional café ☕');
});

test('My Trip resumes the selected outing and unfinished visit', () => {
  const { run } = fixture();
  assert.equal(run('tripRoute()'), 'plan');
  run('currentTrip().started=true');
  assert.equal(run('tripRoute()'), 'go');
  run('tripProgress().arrived=true; completeStop()');
  assert.equal(run('tripRoute()'), 'visit');
  run('finishTrip()');
  assert.equal(run('tripRoute()'), 'summary');
  run("S.role='owner'; S.person='Evelyn'");
  assert.match(run('navigation()'), /My store/);
  assert.doesNotMatch(run('navigation()'), /My Trip/);
  run("S.role='admin'; S.person='June'");
  assert.match(run('navigation()'), /Reviews/);
  assert.doesNotMatch(run('navigation()'), /My Trip/);
});

test('readiness names affected stops and retains unknown travel warnings', () => {
  const { run } = fixture();
  const result = run('readiness()');
  assert.match(result, /Blue Finch Curios/);
  assert.match(result, /outside/);
  assert.match(result, /Driving time/);
  assert.match(result, /Review hours and timing/);
  run("S.storeEdits.blue={address:'New fictional address'}");
  assert.match(run('readiness()'), /destination changed/);
  assert.match(run("route='ready'; renderPage()"), /disabled/);
});

test('visit feeling has semantic names and restores this stop selection', () => {
  const { run } = fixture();
  run("route='visit'; formDrafts[draftKey()]={rating:'4'}");
  const result = run('renderPage()');
  assert.match(result, /Enjoyable/);
  assert.match(result, /Loved it/);
  assert.match(result, /value="4" checked/);
});

test('dialogs expose an escaped name; back links retain task context', () => {
  const { run, elements } = fixture();
  run("modal('Share <store>', '<p>Public only</p>')");
  assert.match(elements.get('#dialog').innerHTML, /id="dialog-title">Share &lt;store&gt;/);
  run("route='visit'");
  assert.match(run('contextLink()'), /Your current stop/);
  run("route='admin-photo'; S.role='admin'");
  assert.match(run('contextLink()'), /Needs review/);
});

test('in-place actions preserve drafts and Draft applications offer resume', () => {
  const { run, forms } = fixture();
  run("route='visit'");
  const key = run('draftKey()');
  forms.push({ dataset: { draftKey: key }, elements: [{name:'note'}], values: [['note','Fictional unfinished note']] });
  run("action('theme', {})");
  assert.equal(run(`formDrafts[${JSON.stringify(key)}]?.note`), 'Fictional unfinished note');
  run("S.role='owner'; S.person='Evelyn'; route='owner-status'; S.ownerResumeRoute='owner-evidence'");
  const status = run('renderPage()');
  assert.match(status, /Resume application/);
  assert.doesNotMatch(status, /waiting for Site Admin review/);
  assert.match(status, /href="#owner-evidence"/);
});

test('all 78 screens render across five fresh role fixtures with access gates', () => {
  const routes = fixture().run('Object.values(groups).flat()');
  assert.equal(routes.length, 78);
  for (const [role, person] of [['visitor','Mara'],['shopper','Mara'],['other','Alex'],['owner','Evelyn'],['admin','June']]) {
    for (const route of routes) {
      const { run } = fixture();
      run(`S.role=${JSON.stringify(role)}; S.person=${JSON.stringify(person)}; route=${JSON.stringify(route)}`);
      const output = run('renderPage()');
      assert.equal(typeof output, 'string', `${role}: ${route}`);
      assert.match(output, /<(section|h1)/, `${role}: ${route}`);
      if (run('guarded()')) assert.match(output, /no current permission/, `${role}: ${route}`);
      if (role !== 'admin' && route.startsWith('admin')) assert.equal(run('guarded()'), true);
      if (role === 'owner' && route === 'portal') assert.equal(run('guarded()'), true);
    }
  }
});
