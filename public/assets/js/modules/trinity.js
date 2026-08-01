function trinitySettings(symbol){
  state.trinityRanges=state.trinityRanges||{};
  state.trinityRanges[symbol]=state.trinityRanges[symbol]||state.trinityRange||state.commandRange||'0DTE';
  return state.trinityRanges[symbol];
}

function trinityRead(){
  var reads=['SPX','SPY','QQQ'].map(function(symbol){var range=trinitySettings(symbol),read=getRiskStoryRead(symbol,range);read.symbol=symbol;read.range=range;return read});
  var available=reads.filter(function(read){return read.available});
  if(!available.length)return {reads:reads,avg:0,spread:0,stateName:'Unavailable',tone:'muted',synced:0,available:0};
  var avg=Math.round(available.reduce(function(total,read){return total+read.score},0)/available.length);
  var scores=available.map(function(read){return read.score});
  var spread=Math.max.apply(null,scores)-Math.min.apply(null,scores);
  var stateName=available.length<3?'Partial':spread<=15?'Aligned':spread<=26?'Mixed':'Divergent';
  var tone=stateName==='Aligned'?'green':stateName==='Divergent'?'red':'yellow';
  var synced=available.filter(function(read){return Math.abs(read.score-avg)<=12}).length;
  return {reads:reads,avg:avg,spread:spread,stateName:stateName,tone:tone,synced:synced,available:available.length};
}

function trinityExpiryLabel(range){
  return {'0DTE':'Same-day positioning','1D':'Next-session positioning','Weekly':'Weekly positioning','Monthly':'Monthly positioning','Custom Dates':'Custom expiry'}[range]||'Selected expiry';
}

function trinityMini(summary){
  var html='<div class="triMiniBoard"><div class="triMiniHeadline"><span>Market alignment</span><strong class="'+summary.tone+'">'+summary.stateName+'</strong><b>'+summary.available+'/3 loaded</b>'+dataReadinessBadge('trinity')+'</div>';
  summary.reads.forEach(function(read){
    var source=window.riskStoryDataSource||riskStoryDataSource,snap=source.getSnapshot(read.symbol,read.range),price=Number(snap.spot||0);
    html+='<button type="button" class="triMiniRow'+(read.available?'':' is-unavailable')+'" data-view-jump="trinity"><span class="triMiniSymbol">'+read.symbol+'</span><span class="triMiniPrice">'+(price?price.toFixed(price>1000?0:2):'--')+'</span><span class="triMiniNode"><small>Control</small><b>'+read.controlNode+'</b></span><span class="triMiniMeter"><i class="'+(read.available&&read.score>=summary.avg?'positive':'negative')+'" style="--score:'+(read.available?read.score:0)+'%"></i></span><strong class="'+read.tone+'">'+(read.available?read.score:'--')+'</strong></button>';
  });
  return html+'<button type="button" class="triMiniOpen" data-view-jump="trinity">Open Trinity workspace '+uiIcon('arrow-right','',15)+'</button></div>';
}

function trinityConfig(symbol,range){
  return '<div class="triConfig" data-tri-config="'+symbol+'"><label>Expiry focus<select class="triRangeSelect" data-tri-range-select="'+symbol+'">'+['0DTE','1D','Weekly','Monthly','Custom Dates'].map(function(option){return '<option value="'+option+'"'+(option===range?' selected':'')+'>'+option+'</option>'}).join('')+'</select></label><div><span>Independent date control</span><b>'+trinityExpiryLabel(range)+'</b></div></div>';
}

function trinityRows(symbol,read){
  var source=window.riskStoryDataSource||riskStoryDataSource,snap=source.getSnapshot(symbol,read.range),spot=Number(snap.spot||0);
  var rows=snap.exposure&&Array.isArray(snap.exposure.rows)?snap.exposure.rows.slice():[];
  if(!rows.length)return '<div class="surfaceEmpty compact"><strong>No chain rows</strong><span>This symbol and expiry did not return provider-backed exposure rows.</span></div>';
  rows.sort(function(a,b){return Number(b.strike)-Number(a.strike)});
  var max=Math.max.apply(null,rows.map(function(row){return Math.abs(Number(row.netGex)||0)}).concat([1]));
  return rows.map(function(row){
    var strike=Number(row.strike),amount=Number(row.netGex)||0,width=Math.max(2,Math.abs(amount)/max*100),isControl=Math.abs(strike-Number(read.controlNode))<.01,isSpot=Math.abs(strike-spot)<=Math.max(.01,spot*.001);
    return '<div class="triLevel'+(isControl?' is-control':'')+(isSpot?' is-spot':'')+'" data-tri-level="'+strike+'"><span class="triLevelPrice">'+strike+'</span><div class="triLevelTrack '+(amount>=0?'call':'put')+'"><i style="--width:'+width+'%"></i></div><b>'+money(amount)+'</b>'+(isControl?'<small>NODE</small>':isSpot?'<small>SPOT</small>':'')+'</div>';
  }).join('');
}

function trinityCard(read,summary){
  var symbol=read.symbol,source=window.riskStoryDataSource||riskStoryDataSource,snap=source.getSnapshot(symbol,read.range),price=Number(snap.spot||0),delta=read.available?read.score-summary.avg:0;
  var pending=!!(state.trinityPending&&state.trinityPending[symbol]);
  if(!read.available){
    return '<article class="tri triPro is-unavailable'+(pending?' is-pending':'')+'" data-tri-card="'+symbol+'"><header class="triProHead"><div class="triIdentity"><strong>'+symbol+'</strong><div><b>'+(price?price.toFixed(price>1000?0:2):'--')+'</b><span class="'+((snap.provenance&&snap.provenance.mode)||'unavailable')+'">'+readinessModeLabel((snap.provenance&&snap.provenance.mode)||'unavailable')+'</span></div></div><div class="triCardActions"><button type="button" class="triIcon gear" data-tri-settings="'+symbol+'" title="Expiry settings" aria-label="Expiry settings">'+uiIcon('settings','',15)+'</button></div></header>'+trinityConfig(symbol,read.range)+(pending?'<div class="triPending">'+uiIcon('loader-circle','',18)+'<strong>Loading '+symbol+'</strong></div>':'<div class="triUnavailableBody"><strong>Provider read unavailable</strong><span>'+(read.reasons&&read.reasons[0]?read.reasons[0]:'No provider-backed chain was returned for this symbol and expiry.')+'</span></div>')+'</article>';
  }
  return '<article class="tri triPro'+(pending?' is-pending':'')+'" data-tri-card="'+symbol+'"><header class="triProHead"><div class="triIdentity"><strong>'+symbol+'</strong><div><b>'+(price?price.toFixed(price>1000?0:2):'--')+'</b><span class="'+((snap.provenance&&snap.provenance.mode)||'unavailable')+'">'+readinessModeLabel((snap.provenance&&snap.provenance.mode)||'unavailable')+'</span></div></div><div class="triCardActions"><button type="button" class="triIcon" data-tri-scroll="up" data-tri-target="'+symbol+'" title="Scroll up" aria-label="Scroll up">'+uiIcon('chevron-up','',15)+'</button><button type="button" class="triIcon" data-tri-scroll="down" data-tri-target="'+symbol+'" title="Scroll down" aria-label="Scroll down">'+uiIcon('chevron-down','',15)+'</button><button type="button" class="triIcon gear" data-tri-settings="'+symbol+'" title="Expiry settings" aria-label="Expiry settings">'+uiIcon('settings','',15)+'</button></div></header>'+trinityConfig(symbol,read.range)+
    (read.available?'<div class="triReadStrip"><div><span>Chain score</span><strong class="'+read.tone+'">'+read.score+'<small>/100</small></strong></div><div><span>Regime</span><b>'+read.regime+'</b><small>'+read.bias+'</small></div><div><span>Vs. Trinity</span><b class="'+(delta>=0?'green':'red')+'">'+(delta>=0?'+':'')+delta+'</b><small>Average '+summary.avg+'</small></div></div><div class="triNode"><span>CONTROL NODE</span><strong>'+read.controlNode+'</strong><b>'+read.range+'</b></div>':'<div class="surfaceEmpty compact"><strong>Provider data unavailable</strong><span>'+read.reasons[0]+'</span></div>')+
    '<div class="triScale"><span>NEGATIVE GEX</span><span>STRIKE MAP</span><span>POSITIVE GEX</span></div><div class="triList triProList" data-tri-list="'+symbol+'">'+trinityRows(symbol,read)+'</div><footer class="triProFoot"><div><span>Net GEX</span><b class="'+(Number(snap.netGex||0)>=0?'green':'red')+'">'+(read.available?money(Number(snap.netGex||0)):'--')+'</b></div><div><span>Range</span><b>'+trinityExpiryLabel(read.range)+'</b></div></footer></article>';
}

function renderTri(id){
  var mount=document.getElementById(id);if(!mount)return;
  var summary=trinityRead();
  var isMini=String(id).indexOf('triMini')===0&&!/Expanded$/.test(String(id));
  if(isMini){mount.className='trinity trinityMini';mount.innerHTML=trinityMini(summary);if(window.refreshUiIcons)window.refreshUiIcons(mount);return}
  mount.className='trinity trinityPro availability-'+summary.available;
  mount.innerHTML='<div class="triSummary triProSummary"><div><span>TRINITY MATRIX</span><strong class="'+summary.tone+'">'+summary.stateName+'</strong></div><div class="triSummaryMetric"><span>Composite</span><b>'+(summary.available?summary.avg+'/100':'--')+'</b></div><div class="triSummaryMetric"><span>Dispersion</span><b>'+(summary.available?summary.spread:'--')+'</b></div><div class="triSummaryMetric"><span>Coverage</span><b>'+summary.available+'/3</b></div>'+dataReadinessBadge('trinity')+'<button type="button" class="chip '+(state.trinityLinked===false?'':'active')+'" data-tri-sync="true" aria-pressed="'+(state.trinityLinked===false?'false':'true')+'">'+uiIcon(state.trinityLinked===false?'unlink':'link','',14)+'<span>'+(state.trinityLinked===false?'Independent':'Linked')+'</span></button></div>'+summary.reads.map(function(read){return trinityCard(read,summary)}).join('');
  initializeTrinityInteraction(mount);
}

function initializeTrinityInteraction(mount){
  var lists=Array.from(mount.querySelectorAll('[data-tri-list]'));
  var expectedPositions=new WeakMap(),frame=0,sourceList=null;
  lists.forEach(function(list){
    list.addEventListener('scroll',function(){
      var expected=expectedPositions.get(list);
      if(expected!==undefined&&Math.abs(list.scrollTop-expected)<1){expectedPositions.delete(list);return}
      expectedPositions.delete(list);
      if(state.trinityLinked===false)return;
      sourceList=list;
      if(frame)return;
      frame=requestAnimationFrame(function(){
        frame=0;
        if(!sourceList)return;
        var max=Math.max(1,sourceList.scrollHeight-sourceList.clientHeight),ratio=sourceList.scrollTop/max;
        lists.forEach(function(other){
          if(other===sourceList)return;
          var next=ratio*Math.max(0,other.scrollHeight-other.clientHeight);
          expectedPositions.set(other,next);
          other.scrollTop=next;
        });
      });
    },{passive:true});
  });
  if(window.refreshUiIcons)window.refreshUiIcons(mount);
}

function loadTrinitySymbol(symbol,range){
  var source=window.riskStoryDataSource||riskStoryDataSource;
  state.trinityLoading=state.trinityLoading||{};
  var key=symbol+'|'+range;
  if(state.trinityLoading[key])return state.trinityLoading[key];
  state.trinityPending=state.trinityPending||{};
  state.trinityPending[symbol]=true;
  renderTri('triFull');
  state.trinityLoading[key]=source.loadMarketRead(symbol,range).then(function(read){delete state.trinityLoading[key];delete state.trinityPending[symbol];state.renderRevision=Number(state.renderRevision||0)+1;renderTri('triFull');return read}).catch(function(error){delete state.trinityLoading[key];delete state.trinityPending[symbol];renderTri('triFull');return null});
  return state.trinityLoading[key];
}

function ensureTrinityData(force){
  var source=window.riskStoryDataSource||riskStoryDataSource;
  return Promise.allSettled(['SPX','SPY','QQQ'].map(function(symbol){var range=trinitySettings(symbol),snap=source.getSnapshot(symbol,range);return force||(snap.provenance&&snap.provenance.mode)==='unavailable'?loadTrinitySymbol(symbol,range):Promise.resolve(snap)}));
}
window.ensureTrinityData=ensureTrinityData;
window.loadTrinitySymbol=loadTrinitySymbol;
