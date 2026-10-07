import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';

const html = readFileSync(new URL('./full-site.html', import.meta.url), 'utf8');
const inline = html.match(/<script>([\s\S]*)<\/script>/)[1];
const source = inline.slice(0, inline.indexOf("document.addEventListener('click'")) +
  inline.match(/const privateScreens=\[[^;]+;/)[0] +
  inline.slice(inline.indexOf('function onHash()'), inline.indexOf("window.addEventListener('hashchange'")) +
  inline.match(/document.addEventListener\('change',[^\n]+/)[0];

function fixture() {
  const elements = new Map();
  const forms = [];
  const handlers = {};
  const context = createContext({
    structuredClone, URL, console,
    location: { hash: '#plan', href: 'http://localhost/full-site.html#plan' },
    history: { back() {} },
    window: { scrollTo() {} },
    navigator: {},
    FormData: class { constructor(form) { return form.values[Symbol.iterator](); } },
    document: {
      addEventListener(name, fn) { handlers[name] = fn; },
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
  return { run, forms, elements, handlers };
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

test('admin support drafts stay with the requester across store switching', () => {
  const { run } = fixture();
  run("S.role='admin'; S.person='June'; route='admin-support'; S.supportPerson='Mara'; formDrafts[draftKey()]={reply:'Only for Mara'}");
  run("S.supportPerson='Evelyn'");
  assert.doesNotMatch(run('renderPage()'), /Only for Mara/);
  run("S.supportPerson='Mara'; S.ownerStore='cedar'");
  assert.match(run('renderPage()'), /Only for Mara/);
});

test('support preserves ordered replies and shows the same conversation to both roles', () => {
  const { run } = fixture();
  run("route='request'; submit('request',{topic:'Using the site',message:'Mara initial question'})");
  run("S.role='admin'; S.person='June'; S.supportPerson='Mara'; route='admin-support'; submit('admin-support',{reply:'June first answer',status:'Waiting on You'})");
  run("S.role='shopper'; S.person='Mara'; route='support-detail'; submit('support-reply',{message:'Mara follow-up'})");
  run("S.role='admin'; S.person='June'; route='admin-support'; submit('admin-support',{reply:'June final answer',status:'Resolved'})");
  const admin = run('renderPage()');
  for (const text of ['Mara initial question','June first answer','Mara follow-up','June final answer']) assert.match(admin, new RegExp(text));
  run("S.role='shopper'; S.person='Mara'; route='support-detail'");
  const shopper = run('renderPage()');
  assert.ok(shopper.indexOf('Mara initial question') < shopper.indexOf('June first answer'));
  assert.ok(shopper.indexOf('June first answer') < shopper.indexOf('Mara follow-up'));
  assert.ok(shopper.indexOf('Mara follow-up') < shopper.indexOf('June final answer'));
  assert.match(shopper, /Resolved/);
  run("S.person='Alex'");
  assert.doesNotMatch(run('renderPage()'), /Mara initial question|June final answer/);
  assert.match(run('S.audit.at(-1).text'), /Mara/);
  assert.equal(run('S.audit[0].store'), null);
  assert.equal(run('S.audit[0].name'), 'Mara');
});

test('support rejects blank replies and failure-state writes; messages render as text', () => {
  const { run } = fixture();
  run("route='request'; submit('request',{topic:'Using the site',message:'<img src=x onerror=alert(1)>'})");
  run("route='support-detail'; submit('support-reply',{message:'   '})");
  assert.equal(run('requestRecord().messages.length'), 1);
  assert.match(run('lastNotice'), /Enter/);
  run("S.role='admin'; S.person='June'; S.supportPerson='Mara'; route='admin-support'; submit('admin-support',{reply:'   ',status:'Resolved'})");
  assert.equal(run('requestRecord().messages.length'), 1);
  assert.equal(run('requestRecord().status'), 'Submitted');
  for (const state of ['offline','error','expired']) {
    run(`scenario=${JSON.stringify(state)}; submit('admin-support',{reply:'Must remain unsent',status:'Resolved'})`);
    assert.equal(run('requestRecord().messages.length'), 1);
  }
  run("scenario='normal'");
  assert.match(run('renderPage()'), /&lt;img/);
  assert.doesNotMatch(run('renderPage()'), /<img src=x/);
});

test('new support questions preserve prior conversations and their unsent drafts', () => {
  const { run } = fixture();
  run("route='request'; submit('request',{topic:'Using the site',message:'Original question'}); route='support-detail'; formDrafts[draftKey()]={message:'Unsent original follow-up'}");
  const original = 1; // Seeded Mara request is first; this submitted question is second.
  run("S.role='admin'; S.person='June'; S.supportPerson='Mara'; route='admin-support'; submit('admin-support',{reply:'Original resolution',status:'Resolved'})");
  run("S.role='shopper'; S.person='Mara'; route='request'; submit('request',{topic:'Account access',message:'Separate question'}); route='support-detail'");
  assert.doesNotMatch(run('renderPage()'), /Unsent original follow-up|Original resolution/);
  assert.match(run('renderPage()'), /Original question|Using the site/);
  run(`action('open-support',{dataset:{id:${JSON.stringify(String(original))}}})`);
  assert.match(run('renderPage()'), /Original resolution/);
  assert.match(run('renderPage()'), /Unsent original follow-up/);
  run("S.role='admin'; S.person='June'; route='admin'");
  assert.match(run('renderPage()'), /Using the site/);
  assert.match(run('renderPage()'), /Account access/);
});

test('submitted support status cannot override a reopened request', () => {
  const { run, forms } = fixture();
  run("S.role='admin'; S.person='June'; S.supportPerson='Mara'; route='admin-support'; submit('admin-support',{reply:'Resolved answer',status:'Resolved'})");
  const key = run('draftKey()');
  forms.push({dataset:{draftKey:key},elements:[{name:'reply'},{name:'status'}],values:[['reply',''],['status','Resolved']]});
  run('stash()');
  assert.equal(run(`formDrafts[${JSON.stringify(key)}].status`), undefined);
  forms.length = 0;
  run("S.role='shopper'; S.person='Mara'; route='support-detail'; submit('support-reply',{message:'Still need help'})");
  run("S.role='admin'; S.person='June'; route='admin-support'");
  assert.doesNotMatch(run('renderPage()'), /<option selected>Resolved/);
  assert.match(run('renderPage()'), /<option selected>In Review/);
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

test('active visits stay stable and completed stops cannot move or disappear', () => {
  const { run } = fixture();
  run('currentTrip().started=true; tripProgress().arrived=true; completeStop()');
  run("mutate('move',{id:'cedar',direction:-1})");
  assert.equal(run('selectedStop().id'), 'blue');
  run("mutate('removeStop',{id:'blue'})");
  assert.equal(run('selectedStop().id'), 'blue');
  assert.equal(run('suggestedStops()[0].id'), 'blue');
});

test('failure states do not commit browsing durations', () => {
  for (const scenario of ['offline','error','expired']) {
    const { run, handlers } = fixture();
    run(`scenario=${JSON.stringify(scenario)}`);
    handlers.change({target:{dataset:{duration:'blue'},value:'90'}});
    assert.equal(run('currentTrip().stops[0].duration'), 60, scenario);
  }
});

test('saving optional notes cannot manufacture an unconfirmed visit', () => {
  const { run } = fixture();
  const before = run('S.memories.Mara.length');
  run("route='visit'; submit('visit',{note:'Fictional unconfirmed visit'})");
  assert.equal(run('S.memories.Mara.length'), before);
  assert.equal(run('tripProgress().completed.length'), 0);
});

test('explicit location permission preview sets only the selected trip start', () => {
  const { run } = fixture();
  run("action('location-yes', {})");
  assert.match(run('currentTrip().start'), /fictional/);
  assert.equal(run('S.profiles.Mara.home'), undefined);
});

test('failure states do not commit a simulated trip starting location', () => {
  for (const scenario of ['offline','error','expired']) {
    const { run } = fixture();
    run(`scenario=${JSON.stringify(scenario)}; action('location-yes', {})`);
    assert.equal(run('currentTrip().start'), undefined, scenario);
    assert.match(run('lastNotice'), /paused/);
  }
});

test('Clear filters resets both data and visible filter drafts', () => {
  const { run } = fixture();
  run("route='browse'; S.category='Copper & brass'; formDrafts[draftKey()]={category:'Copper & brass',area:'Lawrence'}; action('clear', {})");
  assert.equal(run('S.category'), 'All categories');
  assert.match(run('searchPanel()'), /<option selected>All categories/);
  assert.match(run('searchPanel()'), /<option selected>All areas/);
});
