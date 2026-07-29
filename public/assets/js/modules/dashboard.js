function dashboardText(value){
  return String(value==null?'':value).replace(/[&<>"']/g,function(char){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]});
}

function apiStatusCard(){
  var status=state.apiStatus||{};
  var market=status.market||'unavailable';
  var provider=status.provider||'unavailable';
  var cls=market==='live'?'green':market==='delayed'?'yellow':'red';
  var labels={live:'LIVE API',delayed:'DELAYED API',unavailable:'OFFLINE'};
  var label=labels[market]||String(market).toUpperCase();
  var asOf=status.asOf||status.updatedAt;
  var updated=asOf?new Date(asOf).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'}):'not synced';
  var quality=status.quality&&Number.isFinite(Number(status.quality.completeness))?' / Q'+Number(status.quality.completeness)+'%':'';
  return '<article class="panel stat apiStat '+dashboardText(market)+'" title="'+dashboardText(status.message||'')+'"><label>Data Status</label><strong class="'+cls+'">'+dashboardText(label)+'</strong><small>'+dashboardText(provider.split(':')[0]+' / '+updated+quality)+'</small></article>';
}

function statCard(label,value,caption,tone){
  return '<article class="panel stat"><label>'+label+'</label><strong class="'+tone+'">'+value+'</strong><small>'+caption+'</small></article>';
}

function renderStats(){
  var sym=(ticker.value||state.symbol||'SPY').toUpperCase();
  var source=window.riskStoryDataSource||riskStoryDataSource;
  var snap=source.getSnapshot(sym,state.commandRange||'0DTE');
  var read=getRiskStoryRead(sym,state.commandRange||'0DTE');
  var spot=Number(snap.spot||0);
  var net=Number(snap.netGex||0);
  var rows=snap.exposure&&Array.isArray(snap.exposure.rows)?snap.exposure.rows:[];
  var callGex=Number(snap.callGex);
  var putGex=Number(snap.putGex);
  if(!Number.isFinite(callGex))callGex=rows.reduce(function(total,row){return total+(Number(row.callGex)||0)},0);
  if(!Number.isFinite(putGex))putGex=rows.reduce(function(total,row){return total+(Number(row.putGex)||0)},0);
  if(!Number.isFinite(callGex))callGex=0;
  if(!Number.isFinite(putGex))putGex=0;
  var provider=(snap.provider||source.provider||'unavailable').split(':')[0];
  var market=(snap.provenance&&snap.provenance.mode)||(state.apiStatus&&state.apiStatus.market)||'unavailable';
  var modeLabel={live:'Live',delayed:'Delayed',unavailable:'Unavailable'}[market]||market;
  var metrics=snap.metrics||{};
  var metricCaption=function(key,fallback){
    var metric=metrics[key];
    return metric&&metric.label?metric.label+' / '+modeLabel:fallback;
  };
  var available=read.available;
  var tri=typeof trinityRead==='function'?trinityRead():{stateName:'Unavailable',available:0};
  var common=[
    ['Spot',available?spot.toFixed(2)+' '+sym:'--',metricCaption('spot',provider+' / '+modeLabel),'green'],
    ['Net GEX',available?money(net):'--',metricCaption('netGex','Derived / '+modeLabel),net>=0?'green':'red'],
    ['Call GEX',available?money(callGex):'--',metricCaption('callGex','Derived / '+modeLabel),'green'],
    ['Put GEX',available?money(putGex):'--',metricCaption('putGex','Derived / '+modeLabel),'red'],
    ['Zero Gamma',available&&Number(snap.zeroGamma)>0?Number(snap.zeroGamma).toFixed(2):'--',metricCaption('zeroGamma',read.range+' / '+modeLabel),'yellow'],
    ['Trinity',tri.stateName,'Provider reads '+tri.available+'/3','cyan']
  ];
  stats.innerHTML=storyScoreCard(read)+apiStatusCard()+common.map(function(x){return statCard(x[0],x[1],x[2],x[3])}).join('');
  gammaStats.innerHTML=storyScoreCard(read)+apiStatusCard()+common.concat([
    ['Call Wall',available&&Number(snap.callWall)>0?'$'+Number(snap.callWall).toFixed(2):'--',metricCaption('callWall',read.range+' / '+modeLabel),'green'],
    ['Put Wall',available&&Number(snap.putWall)>0?'$'+Number(snap.putWall).toFixed(2):'--',metricCaption('putWall',read.range+' / '+modeLabel),'red']
  ]).map(function(x){return statCard(x[0],x[1],x[2],x[3])}).join('');
}
