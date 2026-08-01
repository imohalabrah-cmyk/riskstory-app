function chartText(value){
  return String(value==null?'':value).replace(/[&<>"']/g,function(char){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]});
}

var riskStoryChartInstances=window.riskStoryChartInstances||{};
window.riskStoryChartInstances=riskStoryChartInstances;

function destroyRiskStoryChart(id){
  var instance=riskStoryChartInstances[id];
  if(!instance)return;
  if(instance.gammaMap&&instance.gammaMap.destroy)instance.gammaMap.destroy();
  if(instance.chart&&instance.chart.remove)instance.chart.remove();
  delete riskStoryChartInstances[id];
}
window.destroyRiskStoryChart=destroyRiskStoryChart;

function professionalLevelPanel(read,filter){
  var html='<div class="levels">'+replayControls()+
    '<div class="levelHeader"><b>Level Intelligence</b><small>'+chartText(filter)+'</small></div>'+ 
    '<div class="levelFilters">'+
      '<button class="chip '+(filter==='all'?'active':'')+'" data-level-filter="all">All</button>'+ 
      '<button class="chip '+(filter==='wall'?'active':'')+'" data-level-filter="wall">Walls</button>'+ 
      '<button class="chip '+(filter==='magnet'?'active':'')+'" data-level-filter="magnet">Magnet</button>'+ 
      '<button class="chip '+(filter==='flip'?'active':'')+'" data-level-filter="flip">Flip</button>'+ 
    '</div>';
  read.levels.filter(function(level){return filter==='all'||level.type===filter}).forEach(function(level){
    var width=Math.max(22,Math.min(100,level.strength));
    html+='<button class="level riskLevel" data-level-price="'+chartText(level.price)+'" data-level-kind="'+chartText(level.kind)+'" data-level-strength="'+chartText(level.strength)+'" data-level-detail="'+chartText(level.detail)+'">'+
      '<i style="--c:'+chartText(level.color)+';--g:'+chartText(level.color)+'99;--w:'+width+'%"></i>'+ 
      '<b>'+chartText(level.price)+'</b><span>'+chartText(level.kind)+' / '+chartText(level.strength)+'%</span></button>';
  });
  html+=state.selectedLevel?levelReactionCard(state.selectedLevel,read):levelReactionCard(read.levels[2]||read.levels[0],read);
  return html+'</div>';
}

function chartMovingAverage(candles,length){
  var queue=[],sum=0;
  return candles.map(function(candle){
    var value=Number(candle.close)||0;
    queue.push(value);sum+=value;
    if(queue.length>length)sum-=queue.shift();
    return {time:Number(candle.time),value:sum/queue.length};
  });
}

function chartTimestamp(value){
  if(!value)return 'not synced';
  var date=new Date(value);
  if(Number.isNaN(date.getTime()))return 'not synced';
  return date.toLocaleString('en-GB',{timeZone:'Asia/Riyadh',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',hour12:false})+' KSA';
}

function chartDelay(minutes){
  minutes=Number(minutes);
  if(!Number.isFinite(minutes))return '';
  if(minutes<60)return ' · '+Math.max(0,Math.round(minutes))+'m delay';
  if(minutes<1440)return ' · '+Math.round(minutes/60)+'h delay';
  return ' · '+(minutes/1440).toFixed(minutes<2880?1:0)+'d delay';
}

function chartCompact(value){
  value=Number(value)||0;
  var sign=value<0?'-':'';
  var amount=Math.abs(value);
  if(amount>=1e9)return sign+'$'+(amount/1e9).toFixed(1)+'B';
  if(amount>=1e6)return sign+'$'+(amount/1e6).toFixed(1)+'M';
  if(amount>=1e3)return sign+'$'+(amount/1e3).toFixed(1)+'K';
  return sign+'$'+amount.toFixed(0);
}

function gammaSnapshotRows(snap){
  var source=snap&&snap.exposure&&Array.isArray(snap.exposure.rows)?snap.exposure.rows:[];
  var rows=source.map(function(row){
    return {
      strike:Number(row.strike),
      netGex:Number(row.netGex)||0,
      callOi:Number(row.callOpenInterest)||0,
      putOi:Number(row.putOpenInterest)||0,
      volume:(Number(row.callVolume)||0)+(Number(row.putVolume)||0)
    };
  }).filter(function(row){return Number.isFinite(row.strike)&&row.strike>0});
  if(!rows.length)return [];

  var maxGex=Math.max.apply(null,rows.map(function(row){return Math.abs(row.netGex)}).concat([1]));
  var maxOi=Math.max.apply(null,rows.map(function(row){return row.callOi+row.putOi}).concat([1]));
  var maxVolume=Math.max.apply(null,rows.map(function(row){return row.volume}).concat([1]));
  rows.forEach(function(row){
    row.power=.72*Math.abs(row.netGex)/maxGex+.18*(row.callOi+row.putOi)/maxOi+.10*row.volume/maxVolume;
    row.kind=row.netGex>=0?'positive':'negative';
    if(Math.abs(row.strike-Number(snap.callWall))<.001)row.role='call wall';
    if(Math.abs(row.strike-Number(snap.putWall))<.001)row.role='put wall';
    if(Math.abs(row.strike-Number(snap.zeroGamma))<.001)row.role='gamma flip';
  });

  var chosen=[];
  function add(row){
    if(row&&chosen.every(function(item){return item.strike!==row.strike}))chosen.push(row);
  }
  [snap.callWall,snap.putWall,snap.zeroGamma].forEach(function(price){
    price=Number(price);
    if(!Number.isFinite(price)||price<=0)return;
    add(rows.slice().sort(function(a,b){return Math.abs(a.strike-price)-Math.abs(b.strike-price)})[0]);
  });
  rows.slice().sort(function(a,b){return b.power-a.power}).slice(0,10).forEach(add);
  return chosen.sort(function(a,b){return b.strike-a.strike});
}

function renderGammaSnapshotMap(viewport,candleSeries,context){
  var rows=gammaSnapshotRows(context.snap);
  if(!rows.length)return null;
  var overlay=document.createElement('div');
  overlay.className='gammaMapOverlay';
  overlay.innerHTML='<div class="gammaMapLegend"><b>Current gamma snapshot</b><span><i></i> positive</span><span><i></i> negative</span><small>brighter = stronger</small></div>';
  rows.forEach(function(row){
    var dots=Math.max(7,Math.round(8+row.power*16));
    var dotHtml='';
    for(var index=0;index<dots;index+=1)dotHtml+='<i style="--i:'+index+';--n:'+dots+'"></i>';
    var item=document.createElement('div');
    item.className='gammaMapRow '+row.kind+(row.role?' isKey':'');
    item.dataset.strike=String(row.strike);
    item.style.setProperty('--power',Math.max(.18,Math.min(1,row.power)).toFixed(3));
    item.style.setProperty('--reach',(36+Math.max(.18,row.power)*38).toFixed(1)+'%');
    item.innerHTML='<div class="gammaMapDots">'+dotHtml+'</div><span class="gammaMapTip"><b>'+chartText(row.strike.toFixed(row.strike>=1000?1:2))+'</b><em>'+chartText(row.role||'gamma cluster')+'</em><small>Net GEX '+chartText(chartCompact(row.netGex))+' · OI '+chartText((row.callOi+row.putOi).toLocaleString())+' · Vol '+chartText(row.volume.toLocaleString())+'</small></span>';
    overlay.appendChild(item);
  });
  viewport.appendChild(overlay);

  function positionRows(){
    var height=viewport.clientHeight||0;
    overlay.querySelectorAll('.gammaMapRow').forEach(function(item){
      var coordinate=candleSeries.priceToCoordinate(Number(item.dataset.strike));
      var visible=Number.isFinite(coordinate)&&coordinate>100&&coordinate<height-42;
      item.style.display=visible?'flex':'none';
      if(visible)item.style.top=coordinate+'px';
    });
  }
  var animationFrame=0;
  var disposed=false;
  function sync(frames){
    if(disposed)return;
    var remaining=Math.max(1,Number(frames)||1);
    if(animationFrame)cancelAnimationFrame(animationFrame);
    function update(){
      if(disposed)return;
      positionRows();
      remaining-=1;
      if(remaining>0)animationFrame=requestAnimationFrame(update);
      else animationFrame=0;
    }
    animationFrame=requestAnimationFrame(update);
  }
  function syncWheel(){sync(14)}
  function syncPointer(){sync(3)}
  var observer=window.ResizeObserver?new ResizeObserver(function(){sync(5)}):null;
  if(observer)observer.observe(viewport);
  viewport.addEventListener('wheel',syncWheel,{passive:true});
  viewport.addEventListener('pointermove',syncPointer,{passive:true});
  viewport.addEventListener('pointerup',syncWheel,{passive:true});
  viewport.addEventListener('touchmove',syncPointer,{passive:true});
  sync(18);
  return {
    overlay:overlay,
    position:positionRows,
    sync:sync,
    destroy:function(){
      disposed=true;
      if(animationFrame)cancelAnimationFrame(animationFrame);
      if(observer)observer.disconnect();
      viewport.removeEventListener('wheel',syncWheel);
      viewport.removeEventListener('pointermove',syncPointer);
      viewport.removeEventListener('pointerup',syncWheel);
      viewport.removeEventListener('touchmove',syncPointer);
    }
  };
}

function renderProfessionalChart(id,mount,context){
  var L=window.LightweightCharts;
  if(!L||!L.createChart||!L.CandlestickSeries)return false;
  destroyRiskStoryChart(id);
  mount.classList.add('nativeChartStage');
  mount.classList.toggle('drawMode',!!state.drawMode);

  var candles=context.candles.slice().map(function(candle){
    return {time:Number(candle.time),open:Number(candle.open),high:Number(candle.high),low:Number(candle.low),close:Number(candle.close),volume:Number(candle.volume)||0};
  }).filter(function(candle){return candle.time&&candle.open&&candle.high&&candle.low&&candle.close}).sort(function(a,b){return a.time-b.time});
  var unique=[];
  candles.forEach(function(candle){
    if(unique.length&&unique[unique.length-1].time===candle.time)unique[unique.length-1]=candle;
    else unique.push(candle);
  });
  candles=unique;
  if(!candles.length)return false;

  var filter=state.levelFilter||'all';
  var status=context.candleStatus||{};
  var mode=status.market||'unavailable';
  var labels={live:'LIVE CANDLES',delayed:'DELAYED CANDLES',unavailable:'CANDLES OFFLINE'};
  var statusLabel=labels[mode]||String(mode).toUpperCase();
  var asOf=status.asOf||status.updatedAt;
  var stamp=chartTimestamp(asOf);
  var provider=String(status.provider||'unavailable').split(':')[0];
  var gammaSource=context.snap.provenance||{};
  var gammaMode=gammaSource.mode||'unavailable';
  var gammaStamp=chartTimestamp(gammaSource.asOf||context.snap.updatedAt);
  var mixedTimes=asOf&&gammaSource.asOf&&Math.abs(new Date(asOf).getTime()-new Date(gammaSource.asOf).getTime())>60*60*1000;
  var latest=candles[candles.length-1];

  mount.innerHTML='<div class="tvChartViewport">'+
    '<div class="tvChartCanvas"></div>'+ 
    '<div class="chartSourceStack">'+
      '<span class="chartSourceChip '+chartText(mode)+'" title="'+chartText(status.message||status.label||statusLabel)+'"><b>CANDLES</b>'+chartText(provider+' · '+stamp+chartDelay(status.delayMinutes))+'</span>'+
      '<span class="chartSourceChip '+chartText(gammaMode)+'" title="'+chartText(gammaSource.note||gammaSource.label||'Gamma source')+'"><b>GAMMA</b>'+chartText(String(gammaSource.provider||'unavailable')+' · '+gammaStamp+chartDelay(gammaSource.delayMinutes))+'</span>'+
    '</div>'+
    '<div class="timeBadge '+(mixedTimes?'mixed':'')+'">'+chartText(context.sym+' / '+context.frame+' / '+context.read.range+' / Score '+(context.read.available?context.read.score:'--')+(mixedTimes?' / MIXED DATA TIMES':''))+'</div>'+ 
    '<div class="tvOhlc"><b>'+chartText(context.sym)+'</b><span>O '+latest.open.toFixed(2)+'</span><span>H '+latest.high.toFixed(2)+'</span><span>L '+latest.low.toFixed(2)+'</span><span>C '+latest.close.toFixed(2)+'</span></div>'+ 
    '<a class="chartAttribution" href="https://www.tradingview.com/" target="_blank" rel="noreferrer">Charts by TradingView</a>'+ 
  '</div>'+professionalLevelPanel(context.read,filter);

  var container=mount.querySelector('.tvChartCanvas');
  var chart=L.createChart(container,{
    autoSize:true,
    layout:{background:{type:L.ColorType.Solid,color:'#0b1420'},textColor:'#8ea3bd',fontFamily:'Inter, ui-sans-serif, system-ui'},
    grid:{vertLines:{color:'rgba(148,177,218,.08)'},horzLines:{color:'rgba(148,177,218,.08)'}},
    rightPriceScale:{borderColor:'rgba(148,177,218,.16)',scaleMargins:{top:.08,bottom:.2}},
    timeScale:{borderColor:'rgba(148,177,218,.16)',timeVisible:true,secondsVisible:false,rightOffset:5,barSpacing:11,minBarSpacing:4},
    crosshair:{mode:L.CrosshairMode.Normal,vertLine:{color:'rgba(25,217,255,.5)',labelBackgroundColor:'#164a66'},horzLine:{color:'rgba(25,217,255,.35)',labelBackgroundColor:'#164a66'}},
    // Vertical wheel and one-finger vertical gestures belong to the page.
    // The chart keeps horizontal drag, axis drag, and pinch interactions.
    handleScroll:{mouseWheel:false,pressedMouseMove:true,horzTouchDrag:true,vertTouchDrag:false},
    handleScale:{axisPressedMouseMove:true,mouseWheel:false,pinch:true},
  });
  var candleSeries=chart.addSeries(L.CandlestickSeries,{upColor:'#20e27b',downColor:'#ff456b',wickUpColor:'#20e27b',wickDownColor:'#ff456b',borderVisible:false,priceLineVisible:false,lastValueVisible:true});
  candleSeries.setData(candles.map(function(candle){return {time:candle.time,open:candle.open,high:candle.high,low:candle.low,close:candle.close}}));

  var volumeSeries=chart.addSeries(L.HistogramSeries,{priceScaleId:'',priceFormat:{type:'volume'},priceLineVisible:false,lastValueVisible:false});
  volumeSeries.setData(candles.map(function(candle){return {time:candle.time,value:candle.volume,color:candle.close>=candle.open?'rgba(32,226,123,.32)':'rgba(255,69,107,.3)'}}));
  volumeSeries.priceScale().applyOptions({scaleMargins:{top:.82,bottom:0}});

  if(state.showIndicators!==false){
    [[8,'#20e27b'],[21,'#e6e12b'],[50,'#ff3333']].forEach(function(item){
      var series=chart.addSeries(L.LineSeries,{color:item[1],lineWidth:1,priceLineVisible:false,lastValueVisible:false,crosshairMarkerVisible:false});
      series.setData(chartMovingAverage(candles,item[0]));
    });
  }

  var gammaFlip=Number(context.snap.zeroGamma);
  if(Number.isFinite(gammaFlip)&&gammaFlip>0){
    candleSeries.createPriceLine({price:gammaFlip,color:'rgba(255,232,74,.58)',lineWidth:1,lineStyle:L.LineStyle.Dotted,axisLabelVisible:true,title:'gamma flip'});
  }
  var drawingKey=context.sym+'|'+context.frame;
  state.chartDrawings=state.chartDrawings||{};
  (state.chartDrawings[drawingKey]||[]).forEach(function(price){
    candleSeries.createPriceLine({price:Number(price),color:'#19d9ff',lineWidth:1,lineStyle:L.LineStyle.Dotted,axisLabelVisible:true,title:'User level'});
  });

  var visible=Math.max(18,Math.round(54/Math.max(.65,state.chartZoom||1)));
  state.chartMaxPan=Math.max(0,candles.length-visible);
  if(state.chartFollowLatest!==false)state.chartPan=state.chartMaxPan;
  state.chartPan=Math.max(0,Math.min(state.chartMaxPan,Number(state.chartPan)||0));
  chart.timeScale().setVisibleLogicalRange({from:state.chartPan-.5,to:state.chartPan+visible-.5});
  var gammaMap=renderGammaSnapshotMap(mount.querySelector('.tvChartViewport'),candleSeries,context);
  chart.timeScale().subscribeVisibleLogicalRangeChange(function(range){
    if(!range)return;
    var next=Math.max(0,Math.min(state.chartMaxPan,Math.round(range.from+.5)));
    state.chartPan=next;
    state.chartFollowLatest=next>=state.chartMaxPan-1;
    if(gammaMap&&gammaMap.sync)gammaMap.sync(8);
  });

  var legend=mount.querySelector('.tvOhlc');
  chart.subscribeCrosshairMove(function(param){
    if(gammaMap&&gammaMap.sync)gammaMap.sync(2);
    if(!legend)return;
    var row=param&&param.seriesData&&param.seriesData.get?param.seriesData.get(candleSeries):null;
    if(!row)row=latest;
    legend.innerHTML='<b>'+chartText(context.sym)+'</b><span>O '+Number(row.open).toFixed(2)+'</span><span>H '+Number(row.high).toFixed(2)+'</span><span>L '+Number(row.low).toFixed(2)+'</span><span>C '+Number(row.close).toFixed(2)+'</span>';
  });
  container.addEventListener('click',function(event){
    if(!state.drawMode||!candleSeries.coordinateToPrice)return;
    var bounds=container.getBoundingClientRect();
    var price=candleSeries.coordinateToPrice(event.clientY-bounds.top);
    if(!Number.isFinite(price))return;
    var decimals=price>=1000?1:2;
    price=Number(price.toFixed(decimals));
    state.chartDrawings[drawingKey]=state.chartDrawings[drawingKey]||[];
    state.chartDrawings[drawingKey].push(price);
    candleSeries.createPriceLine({price:price,color:'#19d9ff',lineWidth:1,lineStyle:L.LineStyle.Dotted,axisLabelVisible:true,title:'User level'});
    if(window.updateDrawingControls)window.updateDrawingControls();
    if(window.showToast)showToast('User level added at '+price.toFixed(decimals));
  });

  riskStoryChartInstances[id]={chart:chart,series:candleSeries,gammaMap:gammaMap};
  return true;
}

function renderChart(id){
  var mount=document.getElementById(id);
  if(!mount)return;

  var zoom=state.chartZoom||1;
  var pan=state.chartPan||0;
  var frame=state.chartFrame||'10m';
  var sym=(ticker.value||state.symbol||'SPY').toUpperCase();
  var source=window.riskStoryDataSource||riskStoryDataSource;
  var snap=source.getSnapshot(sym,state.commandRange||'0DTE');
  var read=getRiskStoryRead(sym,state.commandRange||'0DTE');
  var candles=source.getCandles(sym,frame);
  var candleStatus=state.candleStatus||state.apiStatus||{};
  var market=candleStatus.market||'unavailable';
  var marketLabels={live:'LIVE CANDLES',delayed:'DELAYED CANDLES',unavailable:'CANDLES OFFLINE'};
  var marketLabel=marketLabels[market]||String(market).toUpperCase();
  var asOf=candleStatus.asOf||candleStatus.updatedAt;
  var updated=asOf?new Date(asOf).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'}):'not synced';
  var candleProvider=String(candleStatus.provider||'unavailable').split(':')[0];
  var statusTitle=(candleStatus.label||marketLabel)+(candleStatus.message?' - '+candleStatus.message:'');
  var filter=state.levelFilter||'all';
  if(!candles.length){destroyRiskStoryChart(id);mount.innerHTML='<div class="surfaceEmpty chartEmpty"><strong>Chart data unavailable</strong><span>No provider-backed candles were returned for '+chartText(sym)+' / '+chartText(frame)+'.</span><small>'+chartText(candleStatus.message||'Sync the MarketData feed to try again.')+'</small></div>';return}
  if(renderProfessionalChart(id,mount,{sym:sym,frame:frame,snap:snap,read:read,candles:candles,candleStatus:candleStatus}))return;
  var draw=state.drawMode?' drawMode':'';
  var ind=state.showIndicators===false?' hideIndicators':'';
  var total=Math.max(1,candles.length);
  var visible=Math.max(14,Math.round(36/zoom));
  state.chartMaxPan=Math.max(0,total-visible);
  if(state.chartFollowLatest!==false)state.chartPan=state.chartMaxPan;
  var first=Math.max(0,Math.min(state.chartMaxPan,pan));
  first=Math.max(0,Math.min(state.chartMaxPan,state.chartPan||0));
  if(first!==(state.chartPan||0))state.chartPan=first;
  var slice=candles.slice(first,first+visible);
  if(!slice.length)slice=candles.slice(-visible);
  var highs=slice.map(function(c){return Number(c.high)||0});
  var lows=slice.map(function(c){return Number(c.low)||0});
  var maxP=Math.max.apply(null,highs.concat([Number(snap.spot)||0,Number(snap.callWall)||0,Number(snap.putWall)||0,Number(snap.zeroGamma)||0]));
  var minP=Math.min.apply(null,lows.concat([Number(snap.spot)||0,Number(snap.callWall)||0,Number(snap.putWall)||0,Number(snap.zeroGamma)||0]));
  var pad=Math.max((maxP-minP)*.12,Math.max(maxP*.003,.5));
  maxP+=pad;minP-=pad;
  var priceY=function(price){
    if(!Number.isFinite(price)||maxP===minP)return 50;
    return Math.max(9,Math.min(78,9+(maxP-price)/(maxP-minP)*69));
  };
  // Zoom changes how many candles are visible. Keep the canvas width stable so
  // the same zoom is not applied twice and candles remain evenly readable.
  var chartW=Math.max(1120,Math.round((mount.clientWidth||1330)-210));
  var bodyW=Math.max(7,Math.min(18,9*zoom));
  var maxVol=Math.max.apply(null,slice.map(function(c){return Number(c.volume)||0}).concat([1]));
  var closes=candles.map(function(c){return Number(c.close)||0});
  var ma=function(index,len){
    var start=Math.max(0,index-len+1),vals=closes.slice(start,index+1).filter(Boolean);
    if(!vals.length)return null;
    return vals.reduce(function(sum,v){return sum+v},0)/vals.length;
  };
  var poly=function(len,color){
    var pts=slice.map(function(c,j){
      var idx=first+j,avg=ma(idx,len);
      if(avg===null)return null;
      var x=5+j*(88/Math.max(1,slice.length-1));
      return x.toFixed(2)+','+priceY(avg).toFixed(2);
    }).filter(Boolean).join(' ');
    return pts?'<polyline class="emaLine" points="'+pts+'" style="--c:'+color+'"></polyline>':'';
  };
  var timeLabel=function(c){
    var d=new Date(Number(c.time)*1000);
    if(frame==='1d'||frame==='daily')return (d.getMonth()+1)+'/'+d.getDate();
    return d.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
  };
  var tickEvery=Math.max(1,Math.floor(slice.length/5));

  var html='<div class="chartViewport" aria-label="Scrollable chart area">'+
    '<div class="chart'+draw+ind+'" style="width:'+chartW+'px">'+
    '<div class="grid"></div>'+
    '<div class="marketBadge '+chartText(market)+'" title="'+chartText(statusTitle)+'">'+chartText(marketLabel+' / '+candleProvider+' / '+updated)+'</div>'+
    '<div class="timeBadge">'+sym+' / '+frame+' / '+read.range+' / Score '+read.score+'</div>'+
    '<svg class="chartOverlay" viewBox="0 0 100 100" preserveAspectRatio="none">'+poly(8,'#20e27b')+poly(21,'#e6e12b')+poly(50,'#ff3333')+'</svg>';

  var chartLevels=[
    ['call wall',snap.callWall,'#ba37ff'],
    ['zero gamma',snap.zeroGamma,'#ffe84a'],
    ['put wall',snap.putWall,'#ff456b'],
    ['spot',snap.spot,'#a7b2c8']
  ].map(function(level){
    return {name:level[0],price:Number(level[1]||0),color:level[2],y:priceY(Number(level[1]))};
  });
  var orderedLevels=chartLevels.slice().sort(function(a,b){return a.y-b.y});
  orderedLevels.forEach(function(level,index){
    level.labelY=Math.max(10,Math.min(76,level.y));
    if(index&&level.labelY-orderedLevels[index-1].labelY<5.5){
      level.labelY=orderedLevels[index-1].labelY+5.5;
    }
  });
  for(var levelIndex=orderedLevels.length-2;levelIndex>=0;levelIndex--){
    if(orderedLevels[levelIndex+1].labelY>76){orderedLevels[levelIndex+1].labelY=76}
    if(orderedLevels[levelIndex+1].labelY-orderedLevels[levelIndex].labelY<5.5){
      orderedLevels[levelIndex].labelY=orderedLevels[levelIndex+1].labelY-5.5;
    }
  }
  chartLevels.forEach(function(level){
    var levelClass='level-'+level.name.replace(/\s/g,'-');
    html+='<div class="chartLevelLine '+levelClass+'" style="--y:'+level.y+'%;--c:'+level.color+'"></div>';
    html+='<div class="chartLevelLabel '+levelClass+'" style="--label-y:'+level.labelY+'%;--c:'+level.color+'"><span>'+level.price.toFixed(2)+'</span><small>'+level.name+'</small></div>';
  });

  slice.forEach(function(c,j){
    var up=Number(c.close)>=Number(c.open);
    var l=5+j*(88/Math.max(1,slice.length-1));
    var wickTop=priceY(Number(c.high)),wickBottom=priceY(Number(c.low));
    var openY=priceY(Number(c.open)),closeY=priceY(Number(c.close));
    var bodyTop=Math.min(openY,closeY),bodyBottom=Math.max(openY,closeY);
    var bodyH=Math.max(7,bodyBottom-bodyTop);
    var volH=Math.max(3,(Number(c.volume)||0)/maxVol*10);
    html+='<i class="volumeBar" style="--l:'+l+'%;--h:'+volH+'%;--c:'+(up?'#20e27b':'#ff4368')+'"></i>';
    html+='<i class="candle liveCandle" title="'+new Date(Number(c.time)*1000).toLocaleString()+'" style="--l:'+l+'%;--top:'+bodyTop+'%;--h:'+bodyH+'%;--wick-top:'+wickTop+'%;--wick-h:'+(wickBottom-wickTop)+'%;--c:'+(up?'#20e27b':'#ff4368')+';width:'+bodyW+'px"></i>';
    if(j===0||j===slice.length-1||j%tickEvery===0){
      html+='<span class="timeTick" style="--l:'+l+'%">'+timeLabel(c)+'</span>';
    }
  });

  html+='<div class="priceScale top">'+maxP.toFixed(2)+'</div><div class="priceScale mid">'+((maxP+minP)/2).toFixed(2)+'</div><div class="priceScale bottom">'+minP.toFixed(2)+'</div>'+
    '<div class="chartPanHint">Drag to pan / Zoom '+zoom.toFixed(1)+'x / '+(first+1)+'-'+(first+slice.length)+' of '+total+'</div>'+
    '</div></div>'+
    '<div class="levels">'+replayControls()+
    '<div class="levelHeader"><b>Level Intelligence</b><small>'+filter+'</small></div>'+
    '<div class="levelFilters">'+
    '<button class="chip '+(filter==='all'?'active':'')+'" data-level-filter="all">All</button>'+
    '<button class="chip '+(filter==='wall'?'active':'')+'" data-level-filter="wall">Walls</button>'+
    '<button class="chip '+(filter==='magnet'?'active':'')+'" data-level-filter="magnet">Magnet</button>'+
    '<button class="chip '+(filter==='flip'?'active':'')+'" data-level-filter="flip">Flip</button>'+
    '</div>';

  read.levels.filter(function(l){return filter==='all'||l.type===filter}).forEach(function(l){
    var w=Math.max(22,Math.min(100,l.strength));
    html+='<button class="level riskLevel" data-level-price="'+l.price+'" data-level-kind="'+l.kind+'" data-level-strength="'+l.strength+'" data-level-detail="'+l.detail+'">'+
      '<i style="--c:'+l.color+';--g:'+l.color+'99;--w:'+w+'%"></i>'+
      '<b>'+l.price+'</b><span>'+l.kind+' / '+l.strength+'%</span></button>';
  });

  html+=state.selectedLevel?levelReactionCard(state.selectedLevel,read):levelReactionCard(read.levels[2]||read.levels[0],read);
  html+='</div>';
  mount.innerHTML=html;

  var vp=mount.querySelector('.chartViewport');
  if(vp)vp.scrollLeft=Math.max(0,(chartW-vp.clientWidth)*(first/Math.max(1,state.chartMaxPan||1)));
}
