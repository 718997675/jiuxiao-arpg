const puppeteer = require('puppeteer-core');
const path = require('path');
const wait = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox','--enable-webgl','--use-gl=angle'] });
  const p = await b.newPage();
  await p.goto('file://' + path.resolve('index.html') + '?cls=warrior', { waitUntil: 'load' });
  await wait(2000);
  const r = await p.evaluate(() => {
    const rows = UNIQUE_ITEMS.map(u => ({ id: u.id, name: u.name, cls: u.cls || '通用', traits: u.traits || [], skill: u.skill || null }));
    const cnt = {};
    rows.forEach(r => r.traits.forEach(t => cnt[t] = (cnt[t] || 0) + 1));
    const dupTrait = Object.keys(cnt).filter(k => cnt[k] > 1).map(k => k + '×' + cnt[k]);
    const combos = rows.map(r => r.traits.slice().sort().join('+'));
    const dupCombo = combos.filter((c, i) => combos.indexOf(c) !== i);
    return { rows, dupTrait, dupCombo, traitCount: Object.keys(UNIQUE_TRAITS).length, withSkill: rows.filter(r => r.skill).length };
  });
  console.log('特性总数:', r.traitCount, ' 有技能的传世:', r.withSkill, '/', r.rows.length);
  console.log('重复单特性:', r.dupTrait);
  console.log('重复组合:', r.dupCombo);
  r.rows.forEach(x => console.log(`  ${x.id.padEnd(18)} ${x.name.padEnd(12)} ${x.cls.padEnd(4)} [${x.traits.join(',')}] ${x.skill ? '技能:' + (x.skill.grant ? 'grant ' : '') + (x.skill.id || '') : ''}`));
  await b.close();
})();
