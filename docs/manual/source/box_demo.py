"""Builds a 4-sided box the way chapter 'Building a box' describes, through the same store calls the buttons make."""
import capture_lib as L
c = L.c
L.fresh(example=False)
out = c.js(r"""(function(){
  var S=TLA.store, log=[];
  function add(name, len, ang){ S.addTruss({hoists:[]}); var t=S.rig.trusses.filter(function(x){return !x.isBlock}).slice(-1)[0]; t.name=name; t.pieceLength=len; t.angle=ang||0; S.commit(); return t; }
  function blk(t, at){ var r=S.addBlockToLine(t.id, S.ui.blockTypeId || S.blockFor(t), {at:at}); if(typeof r==='string') log.push('ERR '+r); return r; }
  var W=add('West', 20, 270); var wn=blk(W,'start'), ws=blk(W,'end');
  var N=add('North', 30, 0); log.push('boltN '+(S.boltToBlock(N.id, wn.id, 'start', 'east')||'ok'));
  var E=add('East', 20, 270); E.x=40; E.y=0; S.commit(); var en=blk(E,'start'), es=blk(E,'end');
  log.push('boltN-end '+(S.boltToBlock(N.id, en.id, 'end', 'auto')||'ok'));
  var So=add('South', 30, 0); log.push('boltS '+(S.boltToBlock(So.id, ws.id, 'start', 'east')||'ok')); log.push('boltS-end '+(S.boltToBlock(So.id, es.id, 'end', 'auto')||'ok'));
  [W,E].forEach(function(t){ [0.5, t.length-0.5].forEach(function(d){ var sp=S.addHoist(t.id); sp.from='start'; delete sp.pos; sp.distance=d; }); }); S.commit();
  [N,So].forEach(function(t){ t.loads.push({id:S.newId('l'), distance:t.length/2-5, weight:80, note:'Moving light', mirror:true}); }); S.commit();
  var byName={}; S.rig.trusses.forEach(function(t){ byName[t.name]=[+t.x.toFixed(2), +t.y.toFixed(2), t.angle, t.length, t.anchor? (t.anchor.mode||'')+(t.anchor.reverse?' reverse':''):'free']; });
  return JSON.stringify({log:log, trusses:byName, warns:S.results.warnings.map(function(w){return w.level+': '+w.message}), hoists:S.results.hoists.map(function(x){return x.trussName+'@'+x.distance+' '+Math.round(x.hoist.staticLoad)+' '+x.hoist.status})}, null, 1);
})()""", 0.8)
print(out)
c.js("document.getElementById('legend').style.display='none'; TLA.plan.fit(); TLA.plan.zoom(0.9); TLA.store.select({})", 0.6)
L.shot("box-built.jpg", (0, 44, 1040, 526))
c.close()
