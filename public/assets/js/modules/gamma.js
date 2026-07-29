function gammaRows(){
  var sym=(ticker.value||state.symbol||'SPY').toUpperCase(),source=window.riskStoryDataSource||riskStoryDataSource,snap=source.getSnapshot(sym,state.commandRange||'0DTE');
  var live=snap.exposure&&Array.isArray(snap.exposure.rows)&&snap.exposure.rows.length?snap.exposure.rows:null;
  if(live){
    return live.map(function(row){
      return {
        strike:Number(row.strike),
        callOi:Number(row.callOpenInterest)||0,
        putOi:Number(row.putOpenInterest)||0,
        callVolume:Number(row.callVolume)||0,
        putVolume:Number(row.putVolume)||0,
        gex:{call:Number(row.callGex)||0,put:Number(row.putGex)||0,net:Number(row.netGex)||0},
        dex:{call:Number(row.callDex)||0,put:Number(row.putDex)||0,net:Number(row.netDex)||0},
        vanna:{call:Number(row.callVanna)||0,put:Number(row.putVanna)||0,net:Number(row.netVanna)||0},
        charm:{call:Number(row.callCharm)||0,put:Number(row.putCharm)||0,net:Number(row.netCharm)||0},
        combined:{call:Math.max(0,Number(row.combined)||0),put:Math.min(0,Number(row.combined)||0),net:Number(row.combined)||0}
      };
    }).sort(function(a,b){return b.strike-a.strike});
  }

  return [];
}

function gammaMetric(){
  var key=state.exposureMode||'gex';
  var metrics={
    gex:{key:'gex',short:'GEX',name:'Gamma Exposure',method:'Provider gamma x open interest x 100 x spot',coverage:'Gamma from option chain'},
    dex:{key:'dex',short:'DEX',name:'Delta Exposure',method:'Provider delta x open interest x 100 x spot',coverage:'Delta coverage'},
    vanna:{key:'vanna',short:'VANNA',name:'Vanna Proxy',method:'Delta change for a +1 volatility-point move',coverage:'IV model coverage'},
    charm:{key:'charm',short:'CHARM',name:'Charm Proxy',method:'Estimated one-day delta drift',coverage:'IV model coverage'},
    combined:{key:'combined',short:'COMBINED',name:'Combined Pressure',method:'Normalized GEX 45% / DEX 25% / Vanna 18% / Charm 12%',coverage:'Composite score'}
  };
  return metrics[key]||metrics.gex;
}

function gammaMetricValues(row){
  var metric=gammaMetric();
  return row[metric.key]||row.gex;
}

function gammaFormat(value){
  if((state.exposureMode||'gex')==='combined'){
    var number=Number(value)||0;
    return (number>0?'+':'')+number.toFixed(1);
  }
  return money(Number(value)||0);
}

function gammaCoverage(snap,metric){
  var profile=snap.exposure;
  if(!profile)return 'Unavailable';
  if(metric.key==='dex')return (Number(profile.deltaCoverage)||0)+'% delta';
  if(metric.key==='vanna'||metric.key==='charm')return (Number(profile.ivCoverage)||0)+'% IV';
  if(metric.key==='combined')return Math.min(Number(profile.deltaCoverage)||0,Number(profile.ivCoverage)||0)+'% model';
  return 'Chain gamma';
}

function gammaNearestRowIndex(rows,value){
  return rows.reduce(function(best,row,index){
    var distance=Math.abs(Number(row.strike)-Number(value));
    return distance<best.distance?{index:index,distance:distance}:best;
  },{index:0,distance:Infinity}).index;
}

function gammaExposureTabs(){
  var active=state.exposureMode||'gex';
  return '<div class="gammaExposureTabs" role="tablist" aria-label="Exposure metric">'+[
    ['gex','GEX'],['dex','DEX'],['vanna','Vanna'],['charm','Charm'],['combined','Combined']
  ].map(function(item){return '<button type="button" role="tab" aria-selected="'+(active===item[0])+'" class="'+(active===item[0]?'active':'')+'" data-exposure-mode="'+item[0]+'">'+item[1]+'</button>'}).join('')+'</div>';
}

function renderGammaTable(){
  var sym=(ticker.value||state.symbol||'SPY').toUpperCase(),source=window.riskStoryDataSource||riskStoryDataSource,snap=source.getSnapshot(sym,state.commandRange||'0DTE');
  var rows=gammaRows(),metric=gammaMetric(),callWall=Number(snap.callWall||0),putWall=Number(snap.putWall||0),spot=Number(snap.spot||0);
  var range=state.commandRange||'0DTE',provider=(snap.provider||source.provider||'MarketData'),coverage=gammaCoverage(snap,metric);
  var expiryLabel=snap.exposure&&snap.exposure.expirations&&snap.exposure.expirations.length?snap.exposure.expirations.map(function(item){return item.expiration}).join(', '):range;
  var html='<div class="gammaReadBar"><div><b>'+sym+' '+metric.name+' Table</b><span>'+expiryLabel+' / '+provider+' / '+metric.method+'</span></div><div class="gammaReadMeta"><em>'+coverage+'</em><strong>Spot '+(spot?spot.toFixed(spot>1000?0:2):'--')+'</strong></div></div>'+gammaExposureTabs();
  if(!rows.length){html+='<div class="surfaceEmpty"><strong>Gamma table unavailable</strong><span>No provider-backed option-chain rows were returned for '+sym+' / '+range+'.</span></div>';var emptyEl=document.getElementById('strikeProfile');if(emptyEl){emptyEl.removeAttribute('style');emptyEl.className='strikeProfile';emptyEl.innerHTML=html}return}
  html+='<div class="gammaTableWrap"><table class="gammaTable"><thead><tr><th>Strike</th><th>Expiry</th><th>Put '+metric.short+'</th><th>Call '+metric.short+'</th><th>Net '+metric.short+'</th><th>Call OI</th><th>Put OI</th><th>Total OI</th><th>Volume</th></tr></thead><tbody>';
  rows.forEach(function(row){
    var strike=Number(row.strike),values=gammaMetricValues(row),cls=Math.abs(strike-spot)<.01?'spotRow':'';
    var label=Math.abs(strike-callWall)<.01?'<span class="callWall">CALL WALL</span>':Math.abs(strike-putWall)<.01?'<span class="putWall">PUT WALL</span>':'';
    html+='<tr class="'+cls+'"><td><b>$'+strike.toFixed(strike%1?1:0)+'</b> '+label+'</td><td><span class="expiryPill">'+expiryLabel+'</span></td><td class="'+(values.put>=0?'green':'red')+'">'+gammaFormat(values.put)+'</td><td class="'+(values.call>=0?'green':'red')+'">'+gammaFormat(values.call)+'</td><td class="'+(values.net>=0?'green':'red')+'">'+gammaFormat(values.net)+'</td><td>'+row.callOi.toLocaleString()+'</td><td>'+row.putOi.toLocaleString()+'</td><td>'+(row.callOi+row.putOi).toLocaleString()+'</td><td>'+(row.callVolume+row.putVolume).toLocaleString()+'</td></tr>';
  });
  html+='</tbody></table></div>';
  var el=document.getElementById('strikeProfile');
  if(!el)return;
  el.removeAttribute('style');el.className='strikeProfile';el.innerHTML=html;
}

function renderStrike(){
  if(state.gammaMode==='table'){renderGammaTable();return}
  var sym=(ticker.value||state.symbol||'SPY').toUpperCase(),source=window.riskStoryDataSource||riskStoryDataSource,snap=source.getSnapshot(sym,state.commandRange||'0DTE');
  var rows=gammaRows(),metric=gammaMetric(),spot=Number(snap.spot||0),callWall=Number(snap.callWall||0),putWall=Number(snap.putWall||0),zero=Number(snap.zeroGamma||0);
  var range=state.commandRange||'0DTE',provider=(snap.provider||source.provider||'MarketData'),coverage=gammaCoverage(snap,metric);
  var mode=state.gammaMode==='callput'?'callput':'net';
  if(!rows.length){var unavailable=document.getElementById('strikeProfile');if(unavailable){unavailable.removeAttribute('style');unavailable.className='strikeProfile';unavailable.innerHTML=gammaExposureTabs()+'<div class="surfaceEmpty"><strong>Gamma profile unavailable</strong><span>No provider-backed option-chain rows were returned for '+sym+' / '+range+'.</span></div>'}var unavailableRead=getRiskStoryRead(sym,range);signals.innerHTML='<div class="head"><h2>Signals - '+sym+'</h2></div>'+storySignalPanel(unavailableRead)+flowConfirmationPanel(sym,range);return}
  var maxValue=Math.max(1,Math.max.apply(null,rows.map(function(row){var values=gammaMetricValues(row);return mode==='net'?Math.abs(values.net):Math.max(Math.abs(values.call),Math.abs(values.put))})));
  var spotIndex=gammaNearestRowIndex(rows,spot),callIndex=gammaNearestRowIndex(rows,callWall),putIndex=gammaNearestRowIndex(rows,putWall),zeroIndex=gammaNearestRowIndex(rows,zero);
  function fmt(value){return Number(value||0).toFixed(spot>1000?0:2)}
  function distance(value){var pct=(Number(value)-spot)/Math.max(spot,1)*100;return (pct>=0?'+':'')+pct.toFixed(2)+'%'}
  function width(value){return Math.max(2,Math.min(100,Math.abs(Number(value)||0)/maxValue*100)).toFixed(1)}
  function levelTags(index){
    var tags='';
    if(index===callIndex)tags+='<span class="gammaTag callTag">CALL WALL '+fmt(callWall)+'</span>';
    if(index===putIndex)tags+='<span class="gammaTag putTag">PUT WALL '+fmt(putWall)+'</span>';
    if(index===zeroIndex)tags+='<span class="gammaTag zeroTag">ZERO '+fmt(zero)+'</span>';
    return tags;
  }
  var rowHtml='';
  rows.forEach(function(row,index){
    var values=gammaMetricValues(row),negative=mode==='net'?Math.min(0,values.net):values.put,positive=mode==='net'?Math.max(0,values.net):values.call;
    var classes=['gammaLadderRow'];
    if(index===spotIndex)classes.push('isSpot');
    if(index===callIndex)classes.push('isCallWall');
    if(index===putIndex)classes.push('isPutWall');
    if(index===zeroIndex)classes.push('isZero');
    var title='Strike '+row.strike+' | '+metric.short+' Call '+gammaFormat(values.call)+' | Put '+gammaFormat(values.put)+' | Net '+gammaFormat(values.net)+' | Total OI '+(row.callOi+row.putOi).toLocaleString();
    rowHtml+='<div class="'+classes.join(' ')+'" title="'+title+'">'+
      '<strong class="gammaAmount negativeAmount">'+(negative?gammaFormat(negative):'')+'</strong>'+
      '<div class="gammaTrack negativeTrack"><i style="--w:'+width(negative)+'%"></i></div>'+
      '<div class="gammaStrike"><b>'+Number(row.strike).toFixed(Number(row.strike)%1?1:0)+'</b>'+(index===spotIndex?'<span class="spotFlag">SPOT '+fmt(spot)+'</span>':'')+'<small>'+levelTags(index)+'</small></div>'+
      '<div class="gammaTrack positiveTrack"><i style="--w:'+width(positive)+'%"></i></div>'+
      '<strong class="gammaAmount positiveAmount">'+(positive?gammaFormat(positive):'')+'</strong>'+
    '</div>';
  });
  var metricTotal=rows.reduce(function(total,row){return total+gammaMetricValues(row).net},0);
  var regime=metricTotal>=0?'Positive pressure':'Negative pressure',regimeClass=metricTotal>=0?'positive':'negative';
  var profile=snap.exposure,assumption=profile&&profile.assumption?profile.assumption:'Provider-chain exposure is unavailable.';
  var dataMode=(snap.provenance&&snap.provenance.mode)||(state.apiStatus&&state.apiStatus.market)||'unavailable';
  var spotLabel=dataMode==='live'?'LIVE SPOT':dataMode==='delayed'?'DELAYED SPOT':'SPOT UNAVAILABLE';
  var html='<div class="gammaLadderScroll"><div class="gammaLadder">'+
    '<div class="gammaLadderTop"><div class="gammaLadderIdentity"><span>'+sym+'</span><div><strong>Exposure Ladder Pro</strong><small>'+range+' / '+provider+' / '+metric.name+'</small></div></div><div class="gammaLadderStatus">'+dataReadinessBadge('gamma',snap)+'<span class="'+regimeClass+'">'+regime+'</span><b>Spot '+fmt(spot)+'</b></div></div>'+
    '<div class="gammaExposureBar">'+gammaExposureTabs()+'<div class="gammaExposureMethod"><b>'+metric.short+'</b><span>'+metric.method+'</span><em>'+coverage+'</em></div></div>'+
    '<div class="gammaLadderGrid"><div class="gammaBook"><div class="gammaLadderHead"><span>'+(mode==='net'?'NEGATIVE':'PUT SIDE')+'</span><b>STRIKE + LEVELS</b><span>'+(mode==='net'?'POSITIVE':'CALL SIDE')+'</span></div><div class="gammaLadderRows">'+rowHtml+'</div></div>'+
    '<aside class="gammaIntel"><div class="gammaIntelHead"><span>LEVEL INTELLIGENCE</span><strong>'+metric.short+' / '+(mode==='net'?'NET':'CALL-PUT')+'</strong></div>'+
      '<article class="gammaIntelSpot"><label>'+spotLabel+'</label><strong>'+fmt(spot)+'</strong><span>Reference price</span></article>'+
      '<article><label>CALL WALL</label><strong class="green">'+fmt(callWall)+'</strong><span>'+distance(callWall)+' from spot</span></article>'+
      '<article><label>ZERO GAMMA</label><strong class="yellow">'+fmt(zero)+'</strong><span>'+distance(zero)+' from spot</span></article>'+
      '<article><label>PUT WALL</label><strong class="red">'+fmt(putWall)+'</strong><span>'+distance(putWall)+' from spot</span></article>'+
      '<div class="gammaModel"><b>MODEL ASSUMPTION</b><p>'+assumption+'</p><span>'+coverage+'</span></div>'+
    '</aside></div>'+
    '<div class="gammaLadderFoot"><span><i class="putKey"></i>'+(mode==='net'?'Negative pressure':'Put-side exposure')+'</span><span><i class="spotKey"></i>Current spot row</span><span><i class="callKey"></i>'+(mode==='net'?'Positive pressure':'Call-side exposure')+'</span><b>'+rows[rows.length-1].strike+' to '+rows[0].strike+' strike coverage</b></div>'+
  '</div></div>';
  var el=document.getElementById('strikeProfile');
  if(!el)return;
  el.removeAttribute('style');el.className='strikeProfile';el.innerHTML=html;
  var read=getRiskStoryRead(sym);
  signals.innerHTML='<div class="head"><h2>Signals - '+sym+'</h2></div>'+storySignalPanel(read)+gammaRegimePanel(sym,state.commandRange||'0DTE')+flowConfirmationPanel(sym,state.commandRange||'0DTE');
}
