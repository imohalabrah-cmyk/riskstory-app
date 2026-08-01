function heatEscape(value){
  return String(value==null?'':value).replace(/[&<>"']/g,function(char){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]});
}

function heatText(key){
  var en={settings:'Matrix Settings',preset:'Expiry preset',range:'Strike range',expirations:'Expirations',layout:'Layout',scale:'Color scale',theme:'Theme',zoom:'Zoom',all:'All',today:'0DTE',next:'Today + Next',weekly:'Weekly',monthly:'Monthly',custom:'Custom',near:'Near',compare:'Compare',combined:'Combined',percentile:'Percentile',actual:'Actual',reset:'Reset',strike:'Strike',net:'Net',provider:'Provider read',scope:'Data scope',shown:'shown',selected:'selected',support:'Support candidate',pressure:'Downside pressure',resistance:'Resistance candidate',current:'Current strike zone',now:'now',loading:'Calculating matrix',noStrikes:'No strikes in range'};
  var ar={settings:'إعدادات المصفوفة',preset:'نطاق الانتهاء',range:'نطاق الأسعار',expirations:'تواريخ الانتهاء',layout:'طريقة العرض',scale:'مقياس اللون',theme:'المظهر',zoom:'التكبير',all:'الكل',today:'نفس اليوم',next:'اليوم + التالي',weekly:'أسبوعي',monthly:'شهري',custom:'مخصص',near:'قريب',compare:'مقارنة',combined:'مدمج',percentile:'نسبي',actual:'فعلي',reset:'إعادة',strike:'السعر',net:'الصافي',provider:'قراءة المزود',scope:'نطاق البيانات',shown:'ظاهر',selected:'محدد',support:'دعم محتمل',pressure:'ضغط هبوطي',resistance:'مقاومة محتملة',current:'منطقة السعر الحالية',now:'الآن',loading:'جار حساب المصفوفة',noStrikes:'لا توجد أسعار في النطاق'};
  return (state.lang==='ar'?ar:en)[key]||en[key]||key;
}

function heatExpirationLabel(value){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(value||'')))return String(value||'Selected expiry');
  var date=new Date(String(value)+'T12:00:00Z');
  return date.toLocaleDateString(state.lang==='ar'?'ar-SA':'en-US',{month:'short',day:'numeric',timeZone:'UTC'});
}

function heatDte(value){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(value||'')))return '';
  var expiry=new Date(String(value)+'T12:00:00');
  var today=new Date();
  today.setHours(12,0,0,0);
  return Math.max(0,Math.round((expiry.getTime()-today.getTime())/86400000));
}

function heatDteLabel(value){
  var days=heatDte(value);
  return days===''?'':days===0?'0DTE':days+'D';
}

function heatProfiles(snap){
  var exposure=snap&&snap.exposure;
  if(!exposure)return [];
  var profiles=Array.isArray(exposure.expirations)?exposure.expirations.filter(function(profile){return profile&&Array.isArray(profile.rows)&&profile.rows.length}):[];
  if(!profiles.length&&Array.isArray(exposure.rows)&&exposure.rows.length)profiles=[{expiration:snap.range||'Selected expiry',rows:exposure.rows}];
  return profiles.sort(function(left,right){return String(left.expiration).localeCompare(String(right.expiration))});
}

function heatModeId(mode){
  var value=String(mode||'GEX').toUpperCase();
  if(value==='VEX')value='VANNA';
  return ['GEX','CALLPUT','DEX','VANNA','CHARM','VOLUME','OI'].indexOf(value)>=0?value:'GEX';
}

function heatModeConfig(mode){
  var configs={GEX:{label:'GEX',long:'Gamma exposure'},CALLPUT:{label:'Call / Put',long:'Call and put gamma'},DEX:{label:'DEX',long:'Delta exposure'},VANNA:{label:'Vanna',long:'Vanna exposure'},CHARM:{label:'Charm',long:'Charm exposure'},VOLUME:{label:'Volume',long:'Call minus put volume',count:true},OI:{label:'OI',long:'Call minus put open interest',count:true}};
  return configs[heatModeId(mode)];
}

function heatCompact(value){
  var sign=value<0?'-':'',amount=Math.abs(Number(value)||0);
  if(amount>=1e9)return sign+(amount/1e9).toFixed(1)+'B';
  if(amount>=1e6)return sign+(amount/1e6).toFixed(1)+'M';
  if(amount>=1e3)return sign+(amount/1e3).toFixed(1)+'K';
  return sign+Math.round(amount).toLocaleString(state.lang==='ar'?'ar-SA':'en-US');
}

function heatValueLabel(value,mode){return heatModeConfig(mode).count?heatCompact(value):money(value)}

function heatMarker(strike,snap,spotStrike,symbol){
  var markers=[{value:Number(spotStrike),cls:'spot',label:symbol+' spot'},{value:Number(snap.callWall),cls:'call',label:'Call wall'},{value:Number(snap.putWall),cls:'put',label:'Put wall'},{value:Number(snap.zeroGamma),cls:'zero',label:'Zero gamma'}].filter(function(marker){return Number.isFinite(marker.value)&&marker.value>0});
  var hits=markers.filter(function(marker){return Math.abs(marker.value-strike)<.01});
  if(!hits.length)return null;
  var spotHit=hits.find(function(marker){return marker.cls==='spot'});
  return {value:strike,cls:spotHit?'spot':hits[0].cls,label:hits.map(function(marker){return marker.label}).join(' / ')};
}

function heatResolveSelectedProfiles(allProfiles,isMini){
  if(isMini)return allProfiles.slice(0,state.heatAll?6:4);
  var available=allProfiles.map(function(profile){return String(profile.expiration)});
  var selected=(Array.isArray(state.heatSelectedExpirations)?state.heatSelectedExpirations:[]).filter(function(expiration){return available.indexOf(String(expiration))>=0});
  if(state.heatDatePreset==='all'||!selected.length)selected=available.slice();
  state.heatSelectedExpirations=selected;
  return allProfiles.filter(function(profile){return selected.indexOf(String(profile.expiration))>=0});
}

function heatCellRole(strike,value,marker,spot){
  if(marker&&marker.cls==='call')return 'Call wall';
  if(marker&&marker.cls==='put')return 'Put wall';
  if(marker&&marker.cls==='zero')return 'Gamma flip';
  if(marker&&marker.cls==='spot')return 'Current price zone';
  if(value<0)return 'Volatility pressure';
  return strike<spot?'Support candidate':'Resistance candidate';
}

function heatCellScenario(strike,value,marker,spot){
  if(marker&&marker.cls==='call')return 'Call-wall cluster. Watch for rejection or confirmed acceptance above it.';
  if(marker&&marker.cls==='put')return 'Put-wall cluster. A stable reaction may support price; acceptance below increases downside risk.';
  if(marker&&marker.cls==='zero')return 'Gamma regime line. Price behavior can change after a confirmed cross.';
  if(marker&&marker.cls==='spot')return 'Current price is trading in this strike zone. Compare the nearest clusters on both sides.';
  if(value<0)return strike<spot?'Negative exposure below spot can amplify a downside move if this level fails.':'Negative exposure above spot can make a breakout less stable.';
  return strike<spot?'Positive exposure below spot is a support candidate after a confirmed hold.':'Positive exposure above spot is a resistance candidate until price accepts above it.';
}

var heatWorker=null;
var heatWorkerSeq=0;
var heatWorkerPending={};
var heatAnalysisCache=new Map();

function heatGetWorker(){
  if(heatWorker)return heatWorker;
  if(!window.Worker)return null;
  heatWorker=new Worker('/assets/js/workers/heatmap-worker.js?v=20260801ux1');
  heatWorker.onmessage=function(event){
    var message=event.data||{},pending=heatWorkerPending[message.key];
    if(!pending)return;
    delete heatWorkerPending[message.key];
    if(message.result){
      heatAnalysisCache.set(message.key,message.result);
      if(heatAnalysisCache.size>24)heatAnalysisCache.delete(heatAnalysisCache.keys().next().value);
    }
    pending.forEach(function(callback){callback(message.error||null,message.result||null)});
  };
  heatWorker.onerror=function(){heatWorker=null};
  return heatWorker;
}

function heatRequestAnalysis(key,input,callback){
  if(heatAnalysisCache.has(key)){callback(null,heatAnalysisCache.get(key));return}
  if(heatWorkerPending[key]){heatWorkerPending[key].push(callback);return}
  var worker=heatGetWorker();
  if(!worker){callback('Web Worker unavailable');return}
  heatWorkerPending[key]=[callback];
  worker.postMessage({id:++heatWorkerSeq,key:key,input:input});
}

function heatProfileKey(profiles){
  return profiles.map(function(profile){
    var rows=profile.rows||[],first=rows[0]||{},last=rows[rows.length-1]||{};
    return [profile.expiration,rows.length,first.strike,first.netGex,last.strike,last.netGex].join(':');
  }).join('|');
}

function heatContext(id){
  var isMini=String(id).indexOf('hmMini')===0&&!/Expanded$/.test(String(id));
  var symbol=((document.getElementById('ticker')&&document.getElementById('ticker').value)||state.symbol||'SPY').toUpperCase();
  var source=window.riskStoryDataSource||riskStoryDataSource;
  var snap=source.getSnapshot(symbol,state.heatRange||'All Expirations');
  var liveSnap=source.getSnapshot(symbol,state.commandRange||'0DTE');
  var allProfiles=heatProfiles(snap);
  var selectedProfiles=heatResolveSelectedProfiles(allProfiles,isMini);
  var selectedExpirations=selectedProfiles.map(function(profile){return String(profile.expiration)});
  if(!isMini&&selectedExpirations.indexOf(String(state.heatMobileExpiry))<0)state.heatMobileExpiry=selectedExpirations[0]||'';
  var mobileCompare=!isMini&&window.matchMedia&&window.matchMedia('(max-width: 720px)').matches&&state.heatLayout!=='combined';
  var profiles=mobileCompare?selectedProfiles.filter(function(profile){return String(profile.expiration)===String(state.heatMobileExpiry)}):selectedProfiles.slice();
  var mode=heatModeId(state.heatMode),spot=Number(liveSnap.spot||snap.spot||0);
  var key=[symbol,id,mode,state.heatLayout,state.heatStrikeRange,state.heatScale,state.zoom,spot,Number(state.renderRevision||0),heatProfileKey(profiles)].join('~');
  return {id:id,isMini:isMini,isFull:!isMini,symbol:symbol,source:source,snap:snap,liveSnap:liveSnap,allProfiles:allProfiles,selectedProfiles:selectedProfiles,selectedExpirations:selectedExpirations,profiles:profiles,mode:mode,config:heatModeConfig(mode),spot:spot,theme:state.heatTheme||'pro',dataMode:(snap.provenance&&snap.provenance.mode)||(state.apiStatus&&state.apiStatus.market)||'unavailable',readiness:dataSurfaceReadiness('heatmap',snap),key:key};
}

function heatModeButtons(ctx){
  return [['GEX','GEX'],['CALLPUT','Call / Put'],['DEX','DEX'],['VANNA','Vanna'],['CHARM','Charm'],['VOLUME','Volume'],['OI','OI']].map(function(item){return '<button type="button" class="'+(item[0]===ctx.mode?'active':'')+'" data-heat-mode="'+item[0]+'">'+item[1]+'</button>'}).join('');
}

function heatStudio(ctx,result){
  if(!ctx.isFull)return '';
  var presetButtons=[['all',heatText('all')],['zero',heatText('today')],['next',heatText('next')],['weekly',heatText('weekly')],['monthly',heatText('monthly')],['custom',heatText('custom')]].map(function(item){return '<button type="button" class="'+(state.heatDatePreset===item[0]?'active':'')+'" data-heat-preset="'+item[0]+'">'+item[1]+'</button>'}).join('');
  var strikeButtons=[['near',heatText('near')],['5','+/-5'],['10','+/-10'],['20','+/-20'],['all',heatText('all')+' ('+result.allStrikeCount+')']].map(function(item){return '<button type="button" class="'+(String(state.heatStrikeRange)===item[0]?'active':'')+'" data-heat-strike-range="'+item[0]+'" aria-pressed="'+(String(state.heatStrikeRange)===item[0])+'">'+item[1]+'</button>'}).join('');
  var expiryButtons=ctx.allProfiles.map(function(profile){
    var expiration=String(profile.expiration),active=ctx.selectedExpirations.indexOf(expiration)>=0;
    return '<button type="button" class="heatExpiryChoice '+(active?'active':'')+'" data-heat-expiry="'+heatEscape(expiration)+'" aria-pressed="'+active+'"><b>'+heatEscape(heatExpirationLabel(expiration))+'</b><small>'+heatEscape(heatDteLabel(expiration))+'</small></button>';
  }).join('');
  var layout=[['compare',heatText('compare')],['combined',heatText('combined')]].map(function(item){return '<button type="button" class="'+(state.heatLayout===item[0]?'active':'')+'" data-heat-layout="'+item[0]+'">'+item[1]+'</button>'}).join('');
  var scale=[['percentile',heatText('percentile')],['actual',heatText('actual')]].map(function(item){return '<button type="button" class="'+(state.heatScale===item[0]?'active':'')+'" data-heat-scale="'+item[0]+'">'+item[1]+'</button>'}).join('');
  var themes=[['pro','Pro Dark'],['neon','Neon Matrix'],['institutional','Institutional']].map(function(item){return '<button type="button" class="'+(ctx.theme===item[0]?'active':'')+'" data-heat-theme="'+item[0]+'">'+item[1]+'</button>'}).join('');
  var mobile=ctx.selectedProfiles.length>1?'<div class="heatMobileExpiries"><span>Expiry</span>'+ctx.selectedProfiles.map(function(profile){var expiry=String(profile.expiration);return '<button type="button" class="'+(String(state.heatMobileExpiry)===expiry?'active':'')+'" data-heat-mobile-expiry="'+heatEscape(expiry)+'">'+heatEscape(heatExpirationLabel(expiry))+'</button>'}).join('')+'</div>':'';
  return '<div class="heatStudio"><div class="heatPrimaryFilters"><section><label>'+heatText('preset')+'</label><div class="heatSegment">'+presetButtons+'</div></section><section><label>'+heatText('range')+' <em>'+result.rows.length+' / '+result.allStrikeCount+'</em></label><div class="heatSegment">'+strikeButtons+'</div></section></div>'+
    '<div class="heatExpiryBar"><div><label>'+heatText('expirations')+'</label><span>'+ctx.selectedExpirations.length+' / '+ctx.allProfiles.length+' '+heatText('shown')+'</span></div><div class="heatExpiryChoices">'+expiryButtons+'</div></div>'+mobile+
    '<div class="matrixSettingsMenu'+(state.heatSettingsOpen?' open':'')+'"><section><label>'+heatText('layout')+'</label><div class="heatSegment">'+layout+'</div></section><section><label>'+heatText('scale')+'</label><div class="heatSegment">'+scale+'</div></section><section><label>'+heatText('theme')+'</label><div class="heatSegment heatThemes">'+themes+'</div></section><section><label>'+heatText('zoom')+'</label><div class="heatSegment"><button type="button" data-heat-zoom="out" aria-label="Zoom out">'+uiIcon('minus','',14)+'</button><b>'+Math.round(Number(state.zoom||1)*100)+'%</b><button type="button" data-heat-zoom="in" aria-label="Zoom in">'+uiIcon('plus','',14)+'</button><button type="button" data-heat-zoom="reset">'+heatText('reset')+'</button></div></section></div></div>';
}

function heatCellHtml(cell,row,profileIndex,ctx,result,marker){
  if(cell.missing)return '<div class="heatVirtualCell heatData missing"><span>--</span></div>';
  var profile=result.profiles[profileIndex],expiry=(profile.sourceExpirations||[profile.expiration]).join(', '),value=cell.value,distance=row.strike-ctx.spot;
  var role=heatCellRole(row.strike,value,marker,ctx.spot),scenario=heatCellScenario(row.strike,value,marker,ctx.spot),key=marker&&/wall|gamma/i.test(marker.label);
  var content=cell.parts&&ctx.mode==='CALLPUT'?'<span class="heatSplitValue"><i>C '+money(cell.parts.call)+'</i><i>P '+money(cell.parts.put)+'</i></span>':'<span>'+heatEscape(heatValueLabel(value,ctx.mode))+'</span>';
  return '<div tabindex="0" role="gridcell" class="heatVirtualCell heatData '+(value>=0?'pos':'neg')+(key?' hot':'')+(marker&&marker.cls==='spot'?' spotRow':'')+'" style="--a:'+cell.intensity.toFixed(2)+'" data-heat-tip="1" data-symbol="'+heatEscape(ctx.symbol)+'" data-strike="'+heatEscape(row.strike)+'" data-expiry="'+heatEscape(expiry)+'" data-metric="'+heatEscape(ctx.config.label)+'" data-value="'+heatEscape(heatValueLabel(value,ctx.mode))+'" data-rank="'+cell.rank+'" data-strength="'+cell.strength+'" data-distance="'+heatEscape((distance>=0?'+':'')+distance.toFixed(2))+'" data-role="'+heatEscape(role)+'" data-scenario="'+heatEscape(scenario)+'"'+(cell.parts?' data-call-label="'+heatEscape(cell.parts.callLabel)+'" data-call-value="'+heatEscape(heatValueLabel(cell.parts.call,ctx.mode))+'" data-put-label="'+heatEscape(cell.parts.putLabel)+'" data-put-value="'+heatEscape(heatValueLabel(cell.parts.put,ctx.mode))+'"':'')+'>'+content+'</div>';
}

function heatVirtualRowHtml(row,index,ctx,result){
  var marker=heatMarker(row.strike,ctx.snap,result.spotStrike,ctx.symbol),width=Math.max(2,Math.abs(row.total)/result.maxNet*100).toFixed(0);
  var cells=row.cells.map(function(cell,profileIndex){return heatCellHtml(cell,row,profileIndex,ctx,result,marker)}).join('');
  return '<div class="heatVirtualRow '+(index%2?'odd':'even')+(marker?' is-'+marker.cls:'')+'" role="row"><div class="heatVirtualCell heatStrike"><b>$'+heatEscape(row.strike)+'</b>'+(marker?'<small>'+heatEscape(marker.label)+'</small>':'')+'</div>'+cells+'<div class="heatVirtualCell heatNetCell"><b>'+heatEscape(row.strike)+'</b><span class="netTrack"><i class="'+(row.total>=0?'pos':'neg')+'" style="width:'+width+'%"></i></span><strong>'+heatEscape(heatValueLabel(row.total,ctx.mode))+'</strong></div></div>';
}

function heatRenderVirtualRows(viewport,force){
  var store=viewport&&viewport._heatVirtual;
  if(!store)return;
  var dataTop=Math.max(0,viewport.scrollTop-store.headerHeight),height=Math.max(viewport.clientHeight,360);
  var start=Math.max(0,Math.floor(dataTop/store.rowHeight)-5),end=Math.min(store.result.rows.length,Math.ceil((dataTop+height)/store.rowHeight)+5);
  if(!force&&start===store.start&&end===store.end)return;
  store.start=start;store.end=end;
  var host=viewport.querySelector('.heatVirtualRows');
  host.style.transform='translate3d(0,'+(start*store.rowHeight)+'px,0)';
  host.innerHTML=store.result.rows.slice(start,end).map(function(row,index){return heatVirtualRowHtml(row,start+index,store.ctx,store.result)}).join('');
}

function heatMountVirtualTable(el,ctx,result){
  var viewport=el.querySelector('.heatTableViewport');
  if(!viewport)return;
  viewport._heatVirtual={ctx:ctx,result:result,rowHeight:Math.round(40*Number(state.zoom||1)),headerHeight:42,start:-1,end:-1,frame:0};
  heatRenderVirtualRows(viewport,true);
  viewport.addEventListener('scroll',function(){
    var store=viewport._heatVirtual;
    viewport.classList.add('is-scrolling');
    clearTimeout(store.scrollTimer);
    store.scrollTimer=setTimeout(function(){viewport.classList.remove('is-scrolling')},120);
    if(store.frame)return;
    store.frame=requestAnimationFrame(function(){store.frame=0;heatRenderVirtualRows(viewport,false)});
  },{passive:true});
}

function heatRenderResolved(el,ctx,result){
  if(!result.rows.length){el.innerHTML='<div class="surfaceEmpty"><strong>'+heatText('noStrikes')+'</strong></div>';return}
  var call=Number(ctx.snap.callWall||0),put=Number(ctx.snap.putWall||0),zero=Number(ctx.snap.zeroGamma||0),target=zero&&ctx.spot>=zero?call:put,bias=zero?(ctx.spot>=zero?'Call control':'Put pressure'):'Gamma regime unavailable';
  var feedLabel=ctx.readiness.methodLabel+' / '+readinessModeLabel(ctx.dataMode)+' inputs';
  var terminal='<div class="heatTerminal"><div class="heatTicker"><b>'+heatEscape(ctx.symbol)+'</b><strong>'+ctx.spot.toFixed(2)+'</strong><span>'+bias+'</span></div><div class="heatTabs" role="tablist">'+heatModeButtons(ctx)+'</div><div class="heatTerminalActions">'+(ctx.isFull?'<button type="button" class="matrixSettingsButton'+(state.heatSettingsOpen?' active':'')+'" data-heat-settings aria-label="'+heatEscape(heatText('settings'))+'" title="'+heatEscape(heatText('settings'))+'" aria-expanded="'+state.heatSettingsOpen+'">'+uiIcon('sliders-horizontal','',15)+'<span>'+heatText('settings')+'</span></button>':'')+'<div class="heatLive '+heatEscape(ctx.dataMode)+'"><i></i>'+heatEscape(feedLabel)+'</div></div></div>';
  var lower=result.lower,position='<div class="heatPosition"><b class="now"><i></i>'+heatEscape(ctx.symbol)+' '+heatText('now')+' <strong>$'+ctx.spot.toFixed(2)+'</strong></b><span>'+heatText('current')+' <strong>$'+heatEscape(result.spotStrike)+'</strong></span><span class="'+(result.support?'support':'pressure')+'">'+(result.support?heatText('support'):heatText('pressure'))+' <strong>'+(lower?'$'+heatEscape(lower.strike):'--')+'</strong><em>'+(lower?heatEscape(heatValueLabel(lower.total,ctx.mode)):'')+'</em></span><span class="resistance">'+heatText('resistance')+' <strong>'+(result.resistance?'$'+heatEscape(result.resistance.strike):'--')+'</strong><em>'+(result.resistance?heatEscape(heatValueLabel(result.resistance.total,ctx.mode)):'')+'</em></span></div>';
  var cellWidth=Math.round(112*Number(state.zoom||1)),rowHeight=Math.round(40*Number(state.zoom||1)),gridWidth=110+result.profiles.length*cellWidth+300;
  var header='<div class="heatGridHeader" role="row"><div class="heatVirtualCell heatCorner">'+heatText('strike')+'</div>'+result.profiles.map(function(profile){var sourceDates=profile.sourceExpirations||[profile.expiration],label=profile.sourceExpirations?'Combined ('+sourceDates.length+')':heatExpirationLabel(profile.expiration),sub=profile.sourceExpirations?heatText('selected'):heatDteLabel(profile.expiration);return '<div class="heatVirtualCell heatColumnHead" title="'+heatEscape(sourceDates.join(', '))+'"><b>'+heatEscape(label)+'</b><small>'+heatEscape(sub)+'</small></div>'}).join('')+'<div class="heatVirtualCell heatNetHead"><span>'+heatText('net')+' '+heatEscape(ctx.config.label)+'</span><em>'+heatEscape(result.strongest.strike)+' / '+heatEscape(heatValueLabel(result.strongest.total,ctx.mode))+'</em></div></div>';
  var board='<div class="heatBoard"><div class="heatTableViewport'+(ctx.isMini?' compact':'')+'" tabindex="0" role="grid" style="--expiry-cols:'+result.profiles.length+';--heat-cell-w:'+cellWidth+'px;--heat-row-h:'+rowHeight+'px;--heat-grid-min:'+gridWidth+'px">'+header+'<div class="heatVirtualTrack" style="height:'+(result.rows.length*rowHeight)+'px;min-width:'+gridWidth+'px"><div class="heatVirtualRows"></div></div></div></div>';
  var cards='';
  if(ctx.isFull){
    [['Net GEX',money(Number(ctx.snap.netGex||0)),'chain aggregate'],['Call wall',call?'$'+call.toFixed(2):'--','largest call OI'],['Put wall',put?'$'+put.toFixed(2):'--','largest put OI'],['Gamma flip',zero?'$'+zero.toFixed(2):'--','derived regime line'],['Target',target?'$'+target.toFixed(2):'--',bias]].forEach(function(card){cards+='<article><label>'+card[0]+'</label><strong>'+card[1]+'</strong><span>'+card[2]+'</span></article>'});
    cards='<div class="heatCards">'+cards+'</div><div class="heatLegend"><span>teal = positive</span><span>rose = negative</span><span>brighter = stronger</span><span>gold = key level</span></div>';
  }
  el.className='heatmap proHeatmap theme-'+ctx.theme+(state.heatStrikeRange==='all'&&ctx.isFull?' showAll':'')+(result.profiles.length===1&&ctx.isFull?' singleExpiry':'')+' layout-'+heatEscape(state.heatLayout||'compare');
  el.innerHTML=terminal+heatStudio(ctx,result)+position+'<div class="heatRead"><p><b>'+heatText('provider')+'</b><span>'+heatEscape(ctx.config.long)+' from '+ctx.selectedProfiles.length+' actual expiration'+(ctx.selectedProfiles.length===1?'':'s')+'.</span></p><p><b>'+heatText('scope')+'</b><span>Only provider-returned option-chain dates and strikes are shown.</span></p></div>'+board+cards;
  heatMountVirtualTable(el,ctx,result);
  if(window.refreshUiIcons)window.refreshUiIcons(el);
}

function renderHeat(id){
  var el=document.getElementById(id);
  if(!el)return;
  var ctx=heatContext(id);
  if(ctx.dataMode==='unavailable'||!ctx.allProfiles.length){
    el.className='heatmap proHeatmap theme-'+ctx.theme;
    el.innerHTML='<div class="surfaceEmpty"><strong>Heatmap unavailable</strong><span>No provider-backed multi-expiration rows are loaded for '+heatEscape(ctx.symbol)+'.</span><small>'+(ctx.snap.provenance?heatEscape(ctx.snap.provenance.note):'Sync the data feed to try again.')+'</small></div>';
    return;
  }
  var cached=heatAnalysisCache.get(ctx.key);
  if(cached){heatRenderResolved(el,ctx,cached);return}
  el.dataset.heatRequest=ctx.key;
  el.className='heatmap proHeatmap theme-'+ctx.theme+' is-pending';
  el.innerHTML='<div class="heatSkeleton" aria-live="polite"><div>'+uiIcon('loader-circle','',18)+'<strong>'+heatText('loading')+'</strong></div><i></i><i></i><i></i><i></i><i></i></div>';
  if(window.refreshUiIcons)window.refreshUiIcons(el);
  heatRequestAnalysis(ctx.key,{profiles:ctx.profiles,combine:ctx.isFull&&state.heatLayout==='combined',strikeRange:state.heatStrikeRange||'near',spot:ctx.spot,isMini:ctx.isMini,mode:ctx.mode,scale:state.heatScale||'percentile'},function(error,result){
    var current=document.getElementById(id);
    if(!current||current.dataset.heatRequest!==ctx.key)return;
    if(error||!result){current.innerHTML='<div class="surfaceEmpty"><strong>Heatmap calculation unavailable</strong><span>'+heatEscape(error||'Unknown worker error')+'</span></div>';return}
    heatRenderResolved(current,ctx,result);
  });
}

window.heatProfiles=heatProfiles;
window.renderHeat=renderHeat;
window.heatExpirationLabel=heatExpirationLabel;
window.heatDte=heatDte;
