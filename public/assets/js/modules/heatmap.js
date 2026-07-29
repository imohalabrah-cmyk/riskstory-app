function heatEscape(value){
  return String(value==null?'':value).replace(/[&<>"']/g,function(char){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]});
}

function heatExpirationLabel(value){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(value||'')))return String(value||'Selected expiry');
  var date=new Date(String(value)+'T12:00:00Z');
  return date.toLocaleDateString([], {month:'short',day:'numeric'});
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
  if(!profiles.length&&Array.isArray(exposure.rows)&&exposure.rows.length){
    profiles=[{expiration:snap.range||'Selected expiry',rows:exposure.rows}];
  }
  return profiles.sort(function(left,right){return String(left.expiration).localeCompare(String(right.expiration))});
}

function heatModeId(mode){
  var value=String(mode||'GEX').toUpperCase();
  if(value==='VEX')value='VANNA';
  if(['GEX','CALLPUT','DEX','VANNA','CHARM','VOLUME','OI'].indexOf(value)<0)value='GEX';
  return value;
}

function heatModeConfig(mode){
  var configs={
    GEX:{label:'GEX',long:'Gamma exposure'},
    CALLPUT:{label:'Call / Put',long:'Call and put gamma'},
    DEX:{label:'DEX',long:'Delta exposure'},
    VANNA:{label:'Vanna',long:'Vanna exposure'},
    CHARM:{label:'Charm',long:'Charm exposure'},
    VOLUME:{label:'Volume',long:'Call minus put volume',count:true},
    OI:{label:'OI',long:'Call minus put open interest',count:true}
  };
  return configs[heatModeId(mode)];
}

function heatMetric(row,mode){
  if(!row)return null;
  mode=heatModeId(mode);
  if(mode==='DEX')return Number(row.netDex);
  if(mode==='VANNA')return Number(row.netVanna);
  if(mode==='CHARM')return Number(row.netCharm);
  if(mode==='VOLUME')return Number(row.callVolume||0)-Number(row.putVolume||0);
  if(mode==='OI')return Number(row.callOpenInterest||0)-Number(row.putOpenInterest||0);
  return Number(row.netGex);
}

function heatCompact(value){
  var sign=value<0?'-':'';
  var amount=Math.abs(Number(value)||0);
  if(amount>=1e9)return sign+(amount/1e9).toFixed(1)+'B';
  if(amount>=1e6)return sign+(amount/1e6).toFixed(1)+'M';
  if(amount>=1e3)return sign+(amount/1e3).toFixed(1)+'K';
  return sign+Math.round(amount).toLocaleString();
}

function heatValueLabel(value,mode){
  return heatModeConfig(mode).count?heatCompact(value):money(value);
}

function heatMarker(strike,snap,spotStrike,symbol){
  var markers=[
    {value:Number(spotStrike),cls:'spot',label:symbol+' spot zone'},
    {value:Number(snap.callWall),cls:'call',label:'Call wall'},
    {value:Number(snap.putWall),cls:'put',label:'Put wall'},
    {value:Number(snap.zeroGamma),cls:'zero',label:'Zero gamma'}
  ].filter(function(marker){return Number.isFinite(marker.value)&&marker.value>0});
  var hits=markers.filter(function(marker){return Math.abs(marker.value-strike)<.01});
  if(!hits.length)return null;
  var spotHit=hits.find(function(marker){return marker.cls==='spot'});
  return {value:strike,cls:spotHit?'spot':hits[0].cls,label:hits.map(function(marker){return marker.label}).join(' / ')};
}

function heatAggregateProfiles(profiles){
  var numericFields=['callOpenInterest','putOpenInterest','callVolume','putVolume','callGex','putGex','netGex','callDex','putDex','netDex','callVanna','putVanna','netVanna','callCharm','putCharm','netCharm','combined'];
  var rows={};
  profiles.forEach(function(profile){
    profile.rows.forEach(function(row){
      var key=String(Number(row.strike));
      if(!rows[key])rows[key]={strike:Number(row.strike)};
      numericFields.forEach(function(field){rows[key][field]=Number(rows[key][field]||0)+Number(row[field]||0)});
    });
  });
  return {
    expiration:'Combined '+profiles.length,
    sourceExpirations:profiles.map(function(profile){return profile.expiration}),
    rows:Object.keys(rows).map(function(key){return rows[key]}).sort(function(left,right){return right.strike-left.strike})
  };
}

function heatResolveSelectedProfiles(allProfiles,isMini){
  if(isMini)return allProfiles.slice(0,state.heatAll?6:4);
  var available=allProfiles.map(function(profile){return String(profile.expiration)});
  var selected=(Array.isArray(state.heatSelectedExpirations)?state.heatSelectedExpirations:[]).filter(function(expiration){return available.indexOf(String(expiration))>=0});
  if(state.heatDatePreset==='all'||!selected.length)selected=available.slice();
  state.heatSelectedExpirations=selected;
  return allProfiles.filter(function(profile){return selected.indexOf(String(profile.expiration))>=0});
}

function heatFilterStrikes(strikes,spot,id){
  var sorted=strikes.slice().sort(function(left,right){return right-left});
  if(id==='hmMini'){
    return sorted.slice().sort(function(left,right){return Math.abs(left-spot)-Math.abs(right-spot)}).slice(0,15).sort(function(left,right){return right-left});
  }
  var range=String(state.heatStrikeRange||'near').toLowerCase();
  if(range==='all')return sorted;
  if(range==='near'){
    return sorted.slice().sort(function(left,right){return Math.abs(left-spot)-Math.abs(right-spot)}).slice(0,15).sort(function(left,right){return right-left});
  }
  var points=Number(range);
  var filtered=sorted.filter(function(strike){return Math.abs(strike-spot)<=points+.0001});
  return filtered.length?filtered:sorted.slice().sort(function(left,right){return Math.abs(left-spot)-Math.abs(right-spot)}).slice(0,15).sort(function(left,right){return right-left});
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
  if(marker&&marker.cls==='call')return 'Call-wall cluster. Watch whether price rejects here or accepts above it before using the next level.';
  if(marker&&marker.cls==='put')return 'Put-wall cluster. A stable reaction can support price; acceptance below raises downside risk.';
  if(marker&&marker.cls==='zero')return 'Gamma regime line. Behavior may change when price crosses and holds on the other side.';
  if(marker&&marker.cls==='spot')return 'Current price is trading in this strike zone. Read the adjacent clusters for the nearest path.';
  if(value<0)return strike<spot?'Negative exposure below spot can amplify a downside move if the level fails.':'Negative exposure above spot can make a breakout less stable and more volatile.';
  return strike<spot?'Positive exposure below spot is a support candidate when price reacts and holds.':'Positive exposure above spot is a resistance candidate until price accepts above it.';
}

function heatCellParts(row,mode){
  mode=heatModeId(mode);
  if(mode==='CALLPUT')return {call:Number(row&&row.callGex||0),put:Math.abs(Number(row&&row.putGex||0)),callLabel:'Call GEX',putLabel:'Put GEX'};
  if(mode==='VOLUME')return {call:Number(row&&row.callVolume||0),put:Number(row&&row.putVolume||0),callLabel:'Call volume',putLabel:'Put volume'};
  if(mode==='OI')return {call:Number(row&&row.callOpenInterest||0),put:Number(row&&row.putOpenInterest||0),callLabel:'Call OI',putLabel:'Put OI'};
  return null;
}

function renderHeat(id){
  var el=document.getElementById(id);
  if(!el)return;
  var isMini=id==='hmMini';
  var isFull=id==='hmFull';
  var symbol=(ticker.value||state.symbol||'SPY').toUpperCase();
  var source=window.riskStoryDataSource||riskStoryDataSource;
  var heatRange=state.heatRange||'All Expirations';
  var snap=source.getSnapshot(symbol,heatRange);
  var liveSnap=source.getSnapshot(symbol,state.commandRange||'0DTE');
  var allProfiles=heatProfiles(snap);
  var dataMode=(snap.provenance&&snap.provenance.mode)||(state.apiStatus&&state.apiStatus.market)||'unavailable';
  var heatReadiness=dataSurfaceReadiness('heatmap',snap);
  var mode=heatModeId(state.heatMode);
  var config=heatModeConfig(mode);
  var theme=state.heatTheme||'pro';
  state.heatMode=mode;

  if(dataMode==='unavailable'||!allProfiles.length){
    el.className='heatmap proHeatmap theme-'+theme;
    el.innerHTML='<div class="surfaceEmpty"><strong>Heatmap unavailable</strong><span>No provider-backed multi-expiration rows are loaded for '+heatEscape(symbol)+'.</span><small>'+(snap.provenance?heatEscape(snap.provenance.note):'Sync the MarketData feed to try again.')+'</small></div>';
    return;
  }

  var selectedProfiles=heatResolveSelectedProfiles(allProfiles,isMini);
  var selectedExpirations=selectedProfiles.map(function(profile){return String(profile.expiration)});
  if(isFull&&selectedExpirations.indexOf(String(state.heatMobileExpiry))<0)state.heatMobileExpiry=selectedExpirations[0]||'';
  var mobileCompare=isFull&&window.matchMedia&&window.matchMedia('(max-width: 720px)').matches&&state.heatLayout!=='combined';
  var displayedProfiles=mobileCompare?selectedProfiles.filter(function(profile){return String(profile.expiration)===String(state.heatMobileExpiry)}):selectedProfiles.slice();
  if(isFull&&state.heatLayout==='combined'&&selectedProfiles.length>1)displayedProfiles=[heatAggregateProfiles(selectedProfiles)];

  var rowMaps=displayedProfiles.map(function(profile){
    var map={};
    profile.rows.forEach(function(row){map[String(Number(row.strike))]=row});
    return map;
  });
  var allStrikes={};
  displayedProfiles.forEach(function(profile){profile.rows.forEach(function(row){if(Number.isFinite(Number(row.strike)))allStrikes[String(Number(row.strike))]=Number(row.strike)})});
  var strikes=Object.keys(allStrikes).map(function(key){return allStrikes[key]}).sort(function(left,right){return right-left});
  var allStrikeCount=strikes.length;
  var mapSpot=Number(snap.spot||0);
  var spot=Number(liveSnap.spot||mapSpot);
  strikes=heatFilterStrikes(strikes,spot,id);
  var visibleStrikeCount=strikes.length;

  if(!strikes.length){
    el.className='heatmap proHeatmap theme-'+theme;
    el.innerHTML='<div class="surfaceEmpty"><strong>No strikes in range</strong><span>Choose a wider strike range for '+heatEscape(symbol)+'.</span></div>';
    return;
  }

  var spotStrike=strikes.reduce(function(nearest,strike){return Math.abs(strike-spot)<Math.abs(nearest-spot)?strike:nearest},strikes[0]);
  var values=[];
  strikes.forEach(function(strike){rowMaps.forEach(function(map){var value=heatMetric(map[String(strike)],mode);if(Number.isFinite(value))values.push(Math.abs(value))})});
  var maxValue=Math.max.apply(null,values.concat([1]));
  var rankedValues=values.slice().sort(function(left,right){return right-left});
  var matrix='<div class="heatCell heatHead heatCorner">Strike</div>';
  displayedProfiles.forEach(function(profile){
    var sourceDates=profile.sourceExpirations||[profile.expiration];
    var title=sourceDates.join(', ');
    var label=profile.sourceExpirations?'Combined ('+sourceDates.length+')':heatExpirationLabel(profile.expiration);
    var sub=profile.sourceExpirations?'selected':heatDteLabel(profile.expiration);
    matrix+='<div class="heatCell heatHead" title="'+heatEscape(title)+'"><b>'+heatEscape(label)+'</b><small>'+heatEscape(sub)+'</small></div>';
  });
  var netRows=[];

  strikes.forEach(function(strike){
    var marker=heatMarker(strike,snap,spotStrike,symbol);
    var total=0;
    matrix+='<div class="heatCell heatStrike'+(marker?' is-'+marker.cls:'')+'"><b>$'+heatEscape(strike)+'</b>'+(marker?'<small>'+heatEscape(marker.label)+'</small>':'')+'</div>';
    rowMaps.forEach(function(map,profileIndex){
      var row=map[String(strike)];
      var value=heatMetric(row,mode);
      if(!Number.isFinite(value)){
        matrix+='<div class="heatCell heatData missing"><span>--</span></div>';
        return;
      }
      total+=value;
      var absolute=Math.abs(value);
      var percentile=rankedValues.length?(rankedValues.filter(function(item){return item<=absolute}).length/rankedValues.length):0;
      var intensity=state.heatScale==='actual'?(.08+absolute/maxValue*.84):(.08+percentile*.84);
      intensity=Math.min(.94,intensity).toFixed(2);
      var rank=rankedValues.filter(function(item){return item>absolute}).length+1;
      var strength=Math.round(absolute/maxValue*100);
      var key=marker&&/wall|gamma/i.test(marker.label);
      var profile=displayedProfiles[profileIndex];
      var expiry=(profile.sourceExpirations||[profile.expiration]).join(', ');
      var role=heatCellRole(strike,value,marker,spot);
      var scenario=heatCellScenario(strike,value,marker,spot);
      var distance=strike-spot;
      var parts=heatCellParts(row,mode);
      var content;
      if(parts&&mode==='CALLPUT'){
        content='<span class="heatSplitValue"><i>C '+money(parts.call)+'</i><i>P '+money(parts.put)+'</i></span>';
      }else{
        content='<span>'+heatEscape(heatValueLabel(value,mode))+'</span>';
      }
      matrix+='<div tabindex="0" role="gridcell" class="heatCell heatData '+(value>=0?'pos':'neg')+(key?' hot':'')+(marker&&marker.cls==='spot'?' spotRow':'')+'" style="--a:'+intensity+'" data-heat-tip="1" data-symbol="'+heatEscape(symbol)+'" data-strike="'+heatEscape(strike)+'" data-expiry="'+heatEscape(expiry)+'" data-metric="'+heatEscape(config.label)+'" data-value="'+heatEscape(heatValueLabel(value,mode))+'" data-rank="'+rank+'" data-strength="'+strength+'" data-distance="'+heatEscape((distance>=0?'+':'')+distance.toFixed(2))+'" data-role="'+heatEscape(role)+'" data-scenario="'+heatEscape(scenario)+'"'+(parts?' data-call-label="'+heatEscape(parts.callLabel)+'" data-call-value="'+heatEscape(heatValueLabel(parts.call,mode))+'" data-put-label="'+heatEscape(parts.putLabel)+'" data-put-value="'+heatEscape(heatValueLabel(parts.put,mode))+'"':'')+'>'+content+'</div>';
    });
    netRows.push({strike:strike,total:total,marker:marker});
  });

  var maxNet=Math.max.apply(null,netRows.map(function(row){return Math.abs(row.total)}).concat([1]));
  var strongest=netRows.slice().sort(function(left,right){return Math.abs(right.total)-Math.abs(left.total)})[0]||{strike:'--',total:0};
  function pickZone(direction,polarity){
    var candidates=netRows.filter(function(row){
      var inDirection=direction==='support'?row.strike<=spot:row.strike>=spot;
      var hasPolarity=polarity==='positive'?row.total>0:polarity==='negative'?row.total<0:true;
      return inDirection&&hasPolarity;
    });
    if(!candidates.length)return null;
    return candidates.sort(function(left,right){
      var leftScore=.68*Math.abs(left.total)/maxNet+.32/(1+Math.abs(left.strike-spot)/5);
      var rightScore=.68*Math.abs(right.total)/maxNet+.32/(1+Math.abs(right.strike-spot)/5);
      return rightScore-leftScore;
    })[0];
  }
  var support=pickZone('support','positive');
  var downsidePressure=support?null:pickZone('support','negative');
  var lowerZone=support||downsidePressure;
  var resistance=pickZone('resistance','positive');
  var bars='<div class="netTitle"><span>Net '+heatEscape(config.label)+' by strike</span><em>largest '+heatEscape(strongest.strike)+' / '+heatEscape(heatValueLabel(strongest.total,mode))+'</em></div>';
  netRows.forEach(function(row){
    var width=Math.max(2,Math.abs(row.total)/maxNet*100).toFixed(0);
    bars+='<div class="netRow '+(row.marker?'is-'+row.marker.cls:'')+'"><b>'+heatEscape(row.strike)+'</b><div class="netTrack"><i class="'+(row.total>=0?'pos':'neg')+'" style="width:'+width+'%"></i></div><strong>'+heatEscape(heatValueLabel(row.total,mode))+'</strong></div>';
  });

  var call=Number(snap.callWall||0),put=Number(snap.putWall||0),zero=Number(snap.zeroGamma||0);
  var target=zero&&spot>=zero?call:put;
  var bias=zero?(spot>=zero?'Call control':'Put pressure'):'Gamma regime unavailable';
  var modeButtons=[
    ['GEX','GEX'],['CALLPUT','Call / Put'],['DEX','DEX'],['VANNA','Vanna'],['CHARM','Charm'],['VOLUME','Volume'],['OI','OI']
  ].map(function(item){return '<button type="button" class="'+(item[0]===mode?'active':'')+'" data-heat-mode="'+item[0]+'">'+item[1]+'</button>'}).join('');
  var themes=[{id:'pro',label:'Pro Dark'},{id:'neon',label:'Neon Matrix'},{id:'institutional',label:'Institutional'}].map(function(item){return '<button type="button" class="'+(item.id===theme?'active':'')+'" data-heat-theme="'+item.id+'">'+item.label+'</button>'}).join('');
  var feedLabel=heatReadiness.methodLabel+' / '+readinessModeLabel(dataMode)+' inputs';
  var position='<div class="heatPosition"><b class="now"><i></i>'+heatEscape(symbol)+' now <strong>$'+spot.toFixed(2)+'</strong></b><span>Current strike zone <strong>$'+heatEscape(spotStrike)+'</strong></span>'+
    '<span class="'+(support?'support':'pressure')+'">'+(support?'Support candidate':'Downside pressure')+' <strong>'+(lowerZone?'$'+heatEscape(lowerZone.strike):'--')+'</strong><em>'+(lowerZone?heatEscape(heatValueLabel(lowerZone.total,mode)):'')+'</em></span>'+
    '<span class="resistance">Resistance candidate <strong>'+(resistance?'$'+heatEscape(resistance.strike):'--')+'</strong><em>'+(resistance?heatEscape(heatValueLabel(resistance.total,mode)):'')+'</em></span></div>';

  var studio='';
  if(isFull){
    var presetButtons=[['all','All'],['zero','0DTE'],['next','Today + Next'],['weekly','Weekly'],['monthly','Monthly'],['custom','Custom']].map(function(item){
      return '<button type="button" class="'+(state.heatDatePreset===item[0]?'active':'')+'" data-heat-preset="'+item[0]+'">'+item[1]+'</button>';
    }).join('');
    var expiryButtons=allProfiles.map(function(profile){
      var expiration=String(profile.expiration);
      var active=selectedExpirations.indexOf(expiration)>=0;
      return '<button type="button" class="heatExpiryChoice '+(active?'active':'')+'" data-heat-expiry="'+heatEscape(expiration)+'" aria-pressed="'+(active?'true':'false')+'"><b>'+heatEscape(heatExpirationLabel(expiration))+'</b><small>'+heatEscape(heatDteLabel(expiration))+'</small></button>';
    }).join('');
    var layoutButtons=[['compare','Compare'],['combined','Combined']].map(function(item){return '<button type="button" class="'+(state.heatLayout===item[0]?'active':'')+'" data-heat-layout="'+item[0]+'">'+item[1]+'</button>'}).join('');
    var strikeButtons=[['near','Near'],['5','+/-5'],['10','+/-10'],['20','+/-20'],['all','All ('+allStrikeCount+')']].map(function(item){return '<button type="button" class="'+(String(state.heatStrikeRange)===item[0]?'active':'')+'" data-heat-strike-range="'+item[0]+'" aria-pressed="'+(String(state.heatStrikeRange)===item[0]?'true':'false')+'">'+item[1]+'</button>'}).join('');
    var scaleButtons=[['percentile','Percentile'],['actual','Actual']].map(function(item){return '<button type="button" class="'+(state.heatScale===item[0]?'active':'')+'" data-heat-scale="'+item[0]+'">'+item[1]+'</button>'}).join('');
    var mobileExpiryButtons=selectedProfiles.map(function(profile){
      var expiration=String(profile.expiration);
      return '<button type="button" class="'+(String(state.heatMobileExpiry)===expiration?'active':'')+'" data-heat-mobile-expiry="'+heatEscape(expiration)+'">'+heatEscape(heatExpirationLabel(expiration))+'</button>';
    }).join('');
    studio='<div class="heatStudio">'+
      '<div class="heatStudioRow"><section><label>Expiry preset</label><div class="heatSegment">'+presetButtons+'</div></section><section><label>Layout</label><div class="heatSegment">'+layoutButtons+'</div></section><section><label>Strike range <em data-heat-range-summary>'+visibleStrikeCount+' / '+allStrikeCount+' strikes</em></label><div class="heatSegment">'+strikeButtons+'</div></section><section><label>Color scale</label><div class="heatSegment">'+scaleButtons+'</div></section><section class="heatZoomControl"><label>Zoom</label><div class="heatSegment"><button type="button" data-heat-zoom="out" aria-label="Zoom out">-</button><b>'+Math.round(Number(state.zoom||1)*100)+'%</b><button type="button" data-heat-zoom="in" aria-label="Zoom in">+</button><button type="button" data-heat-zoom="reset">Reset</button></div></section></div>'+
      '<div class="heatExpiryBar"><div><label>Expirations</label><span>'+selectedExpirations.length+' / '+allProfiles.length+' shown</span></div><div class="heatExpiryChoices">'+expiryButtons+'</div></div>'+
      (selectedProfiles.length>1?'<div class="heatMobileExpiries"><span>Expiry</span>'+mobileExpiryButtons+'</div>':'')+
    '</div>';
  }

  var cards='';
  [
    ['Net GEX',money(Number(snap.netGex||0)),'chain aggregate'],
    ['Call wall',call?'$'+call.toFixed(2):'--','largest call OI'],
    ['Put wall',put?'$'+put.toFixed(2):'--','largest put OI'],
    ['Gamma flip',zero?'$'+zero.toFixed(2):'--','derived regime line'],
    ['Target',target?'$'+target.toFixed(2):'--',bias]
  ].forEach(function(card){cards+='<article><label>'+card[0]+'</label><strong>'+card[1]+'</strong><span>'+card[2]+'</span></article>'});

  var readCount=selectedProfiles.length;
  el.className='heatmap proHeatmap theme-'+theme+(state.heatStrikeRange==='all'&&isFull?' showAll':'')+(displayedProfiles.length===1&&isFull?' singleExpiry':'')+' layout-'+heatEscape(state.heatLayout||'compare');
  el.style.setProperty('--cols',displayedProfiles.length);
  el.style.setProperty('--heatCellW',Math.round(112*Number(state.zoom||1))+'px');
  el.style.setProperty('--heatRowH',Math.round(39*Number(state.zoom||1))+'px');
  el.innerHTML='<div class="heatTerminal"><div class="heatTicker"><b>'+heatEscape(symbol)+'</b><strong>'+spot.toFixed(2)+'</strong><span>'+bias+'</span></div><div class="heatTabs" role="tablist">'+modeButtons+'</div><div class="heatThemes" role="tablist">'+themes+'</div><div class="heatLive '+heatEscape(dataMode)+'"><i></i> '+heatEscape(feedLabel)+'</div></div>'+
    studio+
    position+
    '<div class="heatRead"><p><b>Provider read</b><span>'+heatEscape(config.long)+' from '+readCount+' actual expiration'+(readCount===1?'':'s')+'.</span></p><p><b>Data scope</b><span>Only provider-returned option-chain dates and strikes are shown.</span></p></div>'+
    '<div class="heatBoard" role="region" aria-label="'+heatEscape(config.long)+' matrix"><div class="heatBoardCanvas"><div class="heatMatrix" role="grid">'+matrix+'</div><aside class="netBars">'+bars+'</aside></div></div>'+
    '<div class="heatCards">'+cards+'</div><div class="heatLegend"><span>teal = positive</span><span>rose = negative</span><span>brighter = stronger</span><span>gold border = key level</span></div>';
}
