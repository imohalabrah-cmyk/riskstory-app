var riskStoryDataSource={
  mode:'unavailable',
  provider:'unavailable',
  updatedAt:new Date().toISOString(),
  snapshots:{},
  flowRows:null,
  getSymbols:function(){
    return top100.map(function(symbol){
      return {symbol:symbol,assetType:clsAsset(symbol),has0DTE:['SPX','SPY','QQQ','IWM','DIA'].indexOf(symbol)>=0}
    })
  },
  getExpirations:function(symbol){
    var asset=clsAsset(symbol||'SPY');
    if(asset==='stock')return ['Weekly','Monthly','Custom'];
    return ['0DTE','1D','Weekly','Monthly','Custom'];
  },
  getFlowRows:function(){
    return (this.flowRows||[]).slice();
  },
  snapshotKey:function(symbol,range){
    return String(symbol||state.symbol||'SPY').toUpperCase()+'|'+String(range||state.commandRange||'0DTE');
  },
  getSnapshot:function(symbol,range){
    symbol=(symbol||state.symbol||'SPY').toUpperCase();
    var key=this.snapshotKey(symbol,range);
    if(this.snapshots[key])return this.snapshots[key];
    if(!range&&this.snapshots[symbol])return this.snapshots[symbol];
    return {
      symbol:symbol,
      range:range||state.commandRange||'0DTE',spot:0,netGex:0,callGex:0,putGex:0,callWall:0,putWall:0,zeroGamma:0,
      levels:[],exposure:null,metrics:null,
      provenance:{provider:'unavailable',mode:'unavailable',label:'Waiting for provider',asOf:null,receivedAt:this.updatedAt,delayMinutes:null,note:'No provider-backed market read is loaded for this symbol and expiry.'},
      quality:{completeness:0,warnings:['Provider data has not been loaded.']}
    };
  },
  setMarketRead:function(read){
    if(!read||!read.symbol||!read.snapshot)return;
    var s=String(read.symbol).toUpperCase();
    this.provider=read.provider||this.provider;
    this.updatedAt=read.updatedAt||new Date().toISOString();
    var provenance=read.provenance||{};
    var mode=provenance.mode||((this.provider==='marketdata')?'delayed':'unavailable');
    var statusMessage=provenance.note||provenance.label||'Data source updated.';
    state.apiStatus={
      market:mode,
      flow:(state.flowStatus&&state.flowStatus.market)||'unavailable',
      provider:this.provider,
      updatedAt:this.updatedAt,
      asOf:provenance.asOf||null,
      delayMinutes:provenance.delayMinutes==null?null:Number(provenance.delayMinutes),
      label:provenance.label||mode,
      provenance:provenance,
      quality:read.quality||null,
      lastSymbol:s,
      lastRange:read.range||state.commandRange||'0DTE',
      message:statusMessage
    };
    var snapshot={
      symbol:s,
      range:read.range||state.commandRange||'0DTE',
      spot:Number(read.snapshot.spot)||0,
      netGex:Number(read.snapshot.netGex)||0,
      callGex:Number(read.snapshot.callGex)||0,
      putGex:Number(read.snapshot.putGex)||0,
      callWall:Number(read.snapshot.callWall)||0,
      putWall:Number(read.snapshot.putWall)||0,
      zeroGamma:Number(read.snapshot.zeroGamma)||0,
      levels:read.levels||[],
      exposure:read.exposure||null,
      metrics:read.metrics||null,
      provenance:provenance,
      quality:read.quality||null,
      provider:this.provider,
      updatedAt:this.updatedAt,
      trinity:null
    };
    this.snapshots[this.snapshotKey(s,snapshot.range)]=snapshot;
    this.snapshots[s]=snapshot;
  },
  candleKey:function(symbol,frame){
    return String(symbol||state.symbol||'SPY').toUpperCase()+'|'+String(frame||state.chartFrame||'10m');
  },
  getCandles:function(symbol,frame){
    var key=this.candleKey(symbol,frame);
    if(state.candles&&state.candles[key]&&state.candles[key].length)return state.candles[key];
    return [];
  },
  setCandleRead:function(read){
    if(!read||!read.symbol||!read.candles)return;
    var symbol=String(read.symbol).toUpperCase(),frame=read.frame||state.chartFrame||'10m';
    state.candles=state.candles||{};
    state.candles[this.candleKey(symbol,frame)]=read.candles.map(function(c){
      return {time:Number(c.time)||0,open:Number(c.open)||0,high:Number(c.high)||0,low:Number(c.low)||0,close:Number(c.close)||0,volume:Number(c.volume)||0};
    }).filter(function(c){return c.time&&c.open&&c.high&&c.low&&c.close});
    var provenance=read.provenance||{};
    var mode=provenance.mode||(read.provider==='marketdata'?'delayed':'unavailable');
    state.candleStatus={
      market:mode,
      provider:read.provider||'unavailable',
      updatedAt:read.updatedAt||new Date().toISOString(),
      asOf:provenance.asOf||null,
      delayMinutes:provenance.delayMinutes==null?null:Number(provenance.delayMinutes),
      label:provenance.label||mode,
      provenance:provenance,
      quality:read.quality||null,
      lastSymbol:symbol,
      lastFrame:frame,
      message:provenance.note||provenance.label||'Candle source updated.'
    };
  },
  setFlowRead:function(read){
    if(!read||!Array.isArray(read.rows))return;
    var provenance=read.provenance||{};
    var mode=provenance.mode||'unavailable';
    this.flowRows=read.rows.map(function(row){
      var side=row.side==='Put'?'Put':'Call';
      var premium=Number(row.premium)||0;
      return {
        time:String(row.time||''),ticker:String(row.symbol||row.ticker||'').toUpperCase(),asset:String(row.assetType||row.asset||'stock'),side:side,
        type:String(row.type||'BLOCK').toUpperCase(),strike:Number(row.strike)||0,expiry:String(row.expiry||''),premium:premium,
        volume:Number(row.volume)||0,oi:Number(row.openInterest||row.oi)||0,sentiment:side==='Call'?'Bullish':'Bearish',
        signal:premium>=2500000?'High conviction':String(row.type||'').toUpperCase()==='SWEEP'?'Urgent sweep':'Watch'
      };
    });
    state.flowStatus={
      market:mode,
      provider:read.provider||provenance.provider||'unavailable',
      updatedAt:read.updatedAt||new Date().toISOString(),
      asOf:provenance.asOf||null,
      label:provenance.label||mode,
      provenance:provenance,
      quality:read.quality||null,
      message:provenance.note||provenance.label||'Flow source updated.'
    };
    if(state.apiStatus)state.apiStatus.flow=mode;
  },
  loadCandles:function(symbol,frame){
    var self=this;
    symbol=(symbol||state.symbol||'SPY').toUpperCase();
    frame=frame||state.chartFrame||'10m';
    return fetch('/api/candles?symbol='+encodeURIComponent(symbol)+'&frame='+encodeURIComponent(frame),{cache:'no-store'})
      .then(function(res){
        if(!res.ok)throw new Error('Candle request failed: '+res.status);
        return res.json();
      })
      .then(function(read){
        self.setCandleRead(read);
        return read;
      });
  },
  loadFlowRead:function(symbol,range){
    var self=this;
    symbol=(symbol||state.symbol||'SPY').toUpperCase();
    range=range||state.commandRange||'0DTE';
    return fetch('/api/flow?symbol='+encodeURIComponent(symbol)+'&range='+encodeURIComponent(range),{cache:'no-store'})
      .then(function(res){
        if(!res.ok)throw new Error('Flow request failed: '+res.status);
        return res.json();
      })
      .then(function(read){
        self.setFlowRead(read);
        return read;
      });
  },
  loadMarketRead:function(symbol,range){
    var self=this;
    symbol=(symbol||state.symbol||'SPY').toUpperCase();
    range=range||state.commandRange||'0DTE';
    return fetch('/api/market?symbol='+encodeURIComponent(symbol)+'&range='+encodeURIComponent(range),{cache:'no-store'})
      .then(function(res){
        if(!res.ok)throw new Error('Market request failed: '+res.status);
        return res.json();
      })
      .then(function(read){
        self.setMarketRead(read);
        return read;
      });
  }
};

window.riskStoryDataSource=riskStoryDataSource;
