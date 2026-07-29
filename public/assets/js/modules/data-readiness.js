function readinessText(value){
  return String(value==null?'':value).replace(/[&<>"']/g,function(char){
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char];
  });
}

function readinessModeLabel(mode){
  return {live:'Live',delayed:'Delayed',unavailable:'Unavailable'}[mode]||String(mode||'Unavailable');
}

function readinessInputMode(snap){
  return (snap&&snap.provenance&&snap.provenance.mode)||(state.apiStatus&&state.apiStatus.market)||'unavailable';
}

function dataSurfaceReadiness(surface,snap){
  var inputMode=readinessInputMode(snap);
  var marketProvider=(snap&&snap.provenance&&snap.provenance.provider)||(state.apiStatus&&state.apiStatus.provider)||'unavailable';
  var flowStatus=state.flowStatus||{market:'unavailable',provider:'unavailable'};
  var candleStatus=state.candleStatus||{market:'unavailable',provider:'unavailable'};
  var definitions={
    market:{label:'Market',method:'reported',methodLabel:'Provider read',mode:inputMode,provider:marketProvider,note:'Price is provider-backed when available.'},
    candles:{label:'Candles',method:'reported',methodLabel:'Provider read',mode:candleStatus.market||'unavailable',provider:candleStatus.provider||'unavailable',note:candleStatus.message||'Candle source status.'},
    gamma:{label:'Gamma',method:'derived',methodLabel:'Calculated',mode:inputMode,provider:marketProvider,note:'Calculated from option-chain gamma and open interest.'},
    heatmap:{label:'Heatmap',method:'derived',methodLabel:'Chain-derived',mode:inputMode,provider:marketProvider,note:'Each cell is calculated from the provider option chain for its actual expiration.'},
    trinity:{label:'Trinity',method:'derived',methodLabel:'Chain-derived',mode:inputMode,provider:marketProvider,note:'Composite view uses only loaded SPX, SPY, and QQQ option-chain reads.'},
    score:{label:'Score',method:'derived',methodLabel:'Calculated',mode:inputMode,provider:'Risk Story model',note:'Risk Story Score is a model output, not a reported market field.'},
    flow:{label:'Flow',method:flowStatus.market==='live'||flowStatus.market==='delayed'?'reported':'unavailable',methodLabel:flowStatus.market==='live'||flowStatus.market==='delayed'?'Provider read':'Unavailable',mode:flowStatus.market||'unavailable',provider:flowStatus.provider||'unavailable',note:flowStatus.message||'A dedicated options-flow provider is not connected.'}
  };
  return definitions[surface]||definitions.market;
}

function dataReadinessBadge(surface,snap,extraClass){
  var read=dataSurfaceReadiness(surface,snap);
  var label=read.methodLabel+' / '+readinessModeLabel(read.mode)+' inputs';
  if(surface==='market'||surface==='candles'||surface==='flow')label=readinessModeLabel(read.mode)+' / '+read.methodLabel;
  return '<span class="dataMethodBadge '+readinessText(read.mode)+' method-'+readinessText(read.method)+' '+readinessText(extraClass||'')+'" title="'+readinessText(read.note)+'">'+readinessText(label)+'</span>';
}

function renderDataTrustBar(){
  var title=document.querySelector('.top .title>div:last-child');
  if(!title)return;
  var host=document.getElementById('dataTrustBar');
  if(!host){
    host=document.createElement('div');
    host.id='dataTrustBar';
    host.className='dataTrustBar';
    title.appendChild(host);
  }
  var source=window.riskStoryDataSource||riskStoryDataSource;
  var symbol=(document.getElementById('ticker')&&document.getElementById('ticker').value)||state.symbol||'SPY';
  var snap=source.getSnapshot(symbol);
  host.innerHTML=['market','candles','gamma','heatmap','flow'].map(function(surface){
    var read=dataSurfaceReadiness(surface,snap);
    var detail=(surface==='market'||surface==='candles'||surface==='flow')?readinessModeLabel(read.mode):read.methodLabel;
    return '<span class="dataTrustChip '+readinessText(read.mode)+' method-'+readinessText(read.method)+'" title="'+readinessText(read.note)+'"><b>'+readinessText(read.label)+'</b><i>'+readinessText(detail)+'</i></span>';
  }).join('');
}

window.dataSurfaceReadiness=dataSurfaceReadiness;
window.dataReadinessBadge=dataReadinessBadge;
window.renderDataTrustBar=renderDataTrustBar;
