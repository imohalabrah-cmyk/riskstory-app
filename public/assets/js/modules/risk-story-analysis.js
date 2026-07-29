function storyClamp(value,min,max){return Math.max(min,Math.min(max,value))}

function getRiskStoryRead(symbol,range){
  var source=window.riskStoryDataSource||riskStoryDataSource;
  var activeRange=range||state.commandRange||state.trinityRange||'0DTE';
  var snap=source.getSnapshot(symbol||'SPY',activeRange);
  var mode=(snap.provenance&&snap.provenance.mode)||'unavailable';
  var spot=Number(snap.spot||0),zero=Number(snap.zeroGamma||0),callWall=Number(snap.callWall||0),putWall=Number(snap.putWall||0);
  var rows=snap.exposure&&Array.isArray(snap.exposure.rows)?snap.exposure.rows:[];
  var available=mode!=='unavailable'&&spot>0&&rows.length>0;
  var levels=(snap.levels||[]).filter(function(level){return Number(level.price)>0}).map(function(level){
    var type=level.type||'level';
    var color=type==='call_wall'?'#b935ff':type==='put_wall'?'#ff456b':type==='zero_gamma'?'#ffe84a':'#19d9ff';
    return {price:Number(level.price).toFixed(2),kind:type.replace(/_/g,' '),type:type.indexOf('wall')>=0?'wall':type.indexOf('zero')>=0?'flip':type,color:color,strength:Number(level.strength||0),detail:level.reason||'Provider-chain level'};
  });
  if(!available){
    return {available:false,symbol:snap.symbol||symbol||'SPY',range:activeRange,rangeLabel:'Provider data unavailable',score:0,regime:'Unavailable',tone:'muted',bias:'No provider-backed chain',flowPressure:null,spot:0,zeroGamma:0,callWall:0,putWall:0,controlNode:'--',levels:[],reasons:[snap.provenance&&snap.provenance.note?snap.provenance.note:'No provider-backed option chain is loaded.']};
  }

  var gross=Math.abs(Number(snap.callGex||0))+Math.abs(Number(snap.putGex||0));
  var netRatio=gross?Math.abs(Number(snap.netGex||0))/gross:0;
  var completeness=Number(snap.quality&&snap.quality.completeness)||0;
  var levelStrength=levels.length?levels.reduce(function(total,level){return total+level.strength},0)/levels.length:0;
  var score=Math.round(storyClamp(20+completeness*.35+levelStrength*.3+netRatio*25,0,100));
  var zeroDistancePct=zero?Math.abs(spot-zero)/spot*100:null;
  var transition=zeroDistancePct!==null&&zeroDistancePct<.18;
  var regime=transition?'Transition':Number(snap.netGex||0)>=0?'Positive Gamma':'Negative Gamma';
  var tone=regime==='Positive Gamma'?'green':regime==='Transition'?'yellow':'red';
  var bias=zero?(spot>=zero?'Above gamma flip':'Below gamma flip'):(Number(snap.netGex||0)>=0?'Positive gamma balance':'Negative gamma balance');
  var controlNode=spot>=zero&&callWall?callWall:putWall||callWall||zero;
  var expirations=snap.exposure&&Array.isArray(snap.exposure.expirations)?snap.exposure.expirations.map(function(item){return item.expiration}).filter(Boolean):[];
  var reasons=[
    activeRange+' option-chain read from '+((snap.provenance&&snap.provenance.provider)||'provider'),
    zero?'Spot is '+Math.abs(spot-zero).toFixed(2)+' from the derived gamma flip':'Gamma flip was not available',
    callWall?'Call wall '+callWall.toFixed(2)+' from largest call OI cluster':'Call wall was not available',
    putWall?'Put wall '+putWall.toFixed(2)+' from largest put OI cluster':'Put wall was not available',
    'Options flow is excluded until a dedicated flow provider is connected'
  ];
  return {available:true,symbol:snap.symbol||symbol||'SPY',range:activeRange,rangeLabel:expirations.length?expirations.join(', '):'Selected provider expiry',score:score,regime:regime,tone:tone,bias:bias,flowPressure:null,spot:spot,zeroGamma:zero,callWall:callWall,putWall:putWall,controlNode:controlNode?Number(controlNode).toFixed(2):'--',levels:levels,reasons:reasons};
}

function storyScoreCard(read){
  if(!read.available)return '<article class="panel stat storyStat unavailableStat"><div class="storyTop"><label>Risk Story Score</label><span class="regime muted">Unavailable</span></div><div class="scoreLine"><strong>--</strong></div><small>'+read.reasons[0]+'</small></article>';
  return '<article class="panel stat storyStat"><div class="storyTop"><label>Risk Story Score</label><span class="regime '+read.tone+'">'+read.regime+'</span></div><div class="scoreLine"><strong class="'+read.tone+'">'+read.score+'</strong><small>/100</small></div><div class="storyMeter"><i style="width:'+read.score+'%"></i></div><small>'+read.range+' / '+read.bias+' / Node '+read.controlNode+' / Chain-derived</small></article>';
}

function storySignalPanel(read){
  if(!read.available)return '<div class="sig storySignal"><h3>Risk Story Score <span class="tag muted">Unavailable</span></h3>'+dataReadinessBadge('score')+'<p>'+read.reasons[0]+'</p></div>';
  return '<div class="sig storySignal"><h3>Risk Story Score <span class="tag '+read.tone+'">'+read.regime+'</span></h3>'+dataReadinessBadge('score')+'<div class="score big">'+read.score+'<small>/100</small></div><div class="storyMeter"><i style="width:'+read.score+'%"></i></div><ul class="storyReasons">'+read.reasons.map(function(reason){return '<li>'+reason+'</li>'}).join('')+'</ul></div>';
}
window.getRiskStoryRead=getRiskStoryRead;
window.storyScoreCard=storyScoreCard;
window.storySignalPanel=storySignalPanel;

function getFlowConfirmation(symbol,range){
  var source=window.riskStoryDataSource||riskStoryDataSource;
  var read=getRiskStoryRead(symbol||'SPY',range||state.commandRange||'0DTE');
  var rows=source.getFlowRows().filter(function(row){return !symbol||row.ticker===symbol}).slice(0,80);
  if(!rows.length)return {available:false,status:'Unavailable',tone:'muted',message:(state.flowStatus&&state.flowStatus.message)||'A dedicated options-flow provider is not connected.',callRatio:null,putRatio:null,sweeps:0,dark:0,read:read};
  var calls=rows.filter(function(row){return row.side==='Call'}).reduce(function(total,row){return total+row.premium},0);
  var puts=rows.filter(function(row){return row.side==='Put'}).reduce(function(total,row){return total+row.premium},0);
  var callRatio=Math.round(calls/Math.max(1,calls+puts)*100);
  var gammaBullish=read.bias.indexOf('Above')>=0||Number(read.callWall)>Number(read.spot);
  var flowBullish=callRatio>=58;
  var status=gammaBullish===flowBullish?'Confirmed':'Conflict';
  if(Math.abs(callRatio-50)<12)status='Watch';
  return {available:true,status:status,tone:status==='Confirmed'?'green':status==='Conflict'?'red':'yellow',message:status==='Confirmed'?'Reported flow confirms the gamma map':status==='Conflict'?'Reported flow conflicts with the gamma map':'Reported flow is balanced near the current levels',callRatio:callRatio,putRatio:100-callRatio,sweeps:rows.filter(function(row){return row.type==='SWEEP'}).length,dark:rows.filter(function(row){return row.type==='DARK'}).length,read:read};
}

function flowConfirmationBadge(row){
  var confirmation=getFlowConfirmation(row.ticker||'SPY',row.expiry==='0DTE'?'0DTE':state.commandRange||'0DTE');
  if(!confirmation.available)return '<span class="flowConfirm muted">No flow source</span>';
  return '<span class="flowConfirm '+confirmation.tone+'">'+confirmation.status+'</span>';
}

function flowConfirmationPanel(symbol,range){
  var confirmation=getFlowConfirmation(symbol||'SPY',range||state.commandRange||'0DTE');
  if(!confirmation.available)return '<div class="sig flowConfirmPanel"><h3>Flow Confirmation <span class="tag muted">Unavailable</span></h3><p>'+confirmation.message+'</p></div>';
  return '<div class="sig flowConfirmPanel"><h3>Flow Confirmation <span class="tag '+confirmation.tone+'">'+confirmation.status+'</span></h3><div>'+confirmation.message+'</div><div class="flowBars"><span>Calls <b>'+confirmation.callRatio+'%</b></span><i><em style="width:'+confirmation.callRatio+'%"></em></i><span>Puts <b>'+confirmation.putRatio+'%</b></span></div><div class="miniFacts"><b>'+confirmation.sweeps+'</b> sweeps / <b>'+confirmation.dark+'</b> dark prints / '+confirmation.read.range+'</div></div>';
}
window.getFlowConfirmation=getFlowConfirmation;
window.flowConfirmationBadge=flowConfirmationBadge;
window.flowConfirmationPanel=flowConfirmationPanel;

function getLevelReaction(level,read){
  read=read||getRiskStoryRead(ticker.value||'SPY',state.commandRange||'0DTE');
  var price=Number(level.price||String(level.price).replace('$',''));
  var strength=Number(level.strength||0),type=level.type||'level',reaction='Watch',tone='yellow';
  var text='Observe price behavior at this chain-derived level.';
  if(type==='flip'){reaction='Regime Shift';tone='purple';text='A move through the derived gamma flip can change volatility behavior.'}
  else if(type==='wall'&&price>Number(read.spot||0)){reaction='Upper Wall';tone='red';text='Largest call OI cluster above spot; watch for rejection or acceptance.'}
  else if(type==='wall'&&price<Number(read.spot||0)){reaction='Lower Wall';tone='green';text='Largest put OI cluster below spot; watch for support or failure.'}
  else if(type==='node'){reaction='Control Zone';tone='cyan';text='This is the strongest loaded positioning level.'}
  var confidence=read.available?storyClamp(Math.round((strength+read.score)/2),0,100):0;
  return {reaction:reaction,tone:tone,text:text,confidence:confidence,price:level.price,kind:level.kind||type,strength:strength};
}

function levelReactionCard(level,read){
  if(!level)return '<div class="levelReaction"><strong>No provider-backed levels are available.</strong></div>';
  var reaction=getLevelReaction(level,read);
  return '<div class="levelReaction"><div><label>Level Intelligence</label><strong class="'+reaction.tone+'">'+reaction.reaction+'</strong></div><p>'+reaction.kind+' '+reaction.price+' / Strength '+reaction.strength+'% / Model confidence '+reaction.confidence+'%</p><span>'+reaction.text+'</span></div>';
}
window.getLevelReaction=getLevelReaction;
window.levelReactionCard=levelReactionCard;

function getReplayFrame(){return {index:0,time:'--',scoreShift:0,flowShift:0,label:'Historical snapshots required'}}
function gammaRegimeDeepDive(read){return {time:'Current',label:'Provider snapshot',score:read.score,regime:read.regime,tone:read.tone,playbook:read.available?'Current regime is calculated from the loaded option chain.':'No provider-backed chain is loaded.',flow:null}}
function gammaRegimePanel(symbol,range){
  var read=getRiskStoryRead(symbol||'SPY',range||state.commandRange||'0DTE'),regime=gammaRegimeDeepDive(read);
  return '<div class="sig regimeDeep"><h3>Gamma Regime <span class="tag '+regime.tone+'">'+regime.regime+'</span></h3><div class="regimeScore"><b class="'+regime.tone+'">'+(read.available?regime.score:'--')+'</b><span>Current / Provider snapshot</span></div><p>'+regime.playbook+'</p></div>';
}
function replayControls(){return '<div class="replayBox replayUnavailable"><div><b>Replay unavailable</b><span>Historical intraday snapshots are required.</span></div></div>'}
window.getReplayFrame=getReplayFrame;
window.gammaRegimeDeepDive=gammaRegimeDeepDive;
window.gammaRegimePanel=gammaRegimePanel;
window.replayControls=replayControls;
