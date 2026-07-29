(function(){
  var loginIntro = document.querySelector('.login-card p');
  if(loginIntro) loginIntro.textContent = 'Private workspace access. Provider-backed reads only; unavailable feeds stay clearly marked.';
  var loginGrid = document.querySelector('.login-art .hero-grid');
  if(loginGrid) loginGrid.innerHTML = [
    '<div class="hero wide"><span>Market Data</span><strong class="green">Provider-backed reads</strong><span>Quotes, candles, and option-chain analytics keep their source and delay visible.</span></div>',
    '<div class="hero"><span>Gamma</span><strong class="yellow">Chain-derived</strong><span>Levels are calculated only from returned contracts.</span></div>',
    '<div class="hero"><span>Data Integrity</span><strong class="blue">No synthetic rows</strong><span>Missing feeds remain unavailable instead of being simulated.</span></div>',
    '<div class="hero"><span>Heatmap</span><strong class="red">Actual expirations</strong><span>Cells map provider strikes to their returned expiry dates.</span></div>',
    '<div class="hero wide"><span>Interactive Chart</span><strong class="purple">Pan, zoom, and inspect</strong><span>Explore provider candles with calculated positioning levels.</span></div>'
  ].join('');
  var modules = [
    '@vendor/lightweight-charts.js',
    'state-data.js',
    'data-source.js',
    'data-readiness.js',
    'risk-story-analysis.js',
    'dashboard.js',
    'heatmap.js',
    'trinity.js',
    'charts.js',
    'gamma.js',
    'flow.js',
    'open-interest.js',
    'alerts.js',
    'navigation.js',
    'interactions.js'
  ];
  function load(index){
    if(index >= modules.length){
      var intro = document.querySelector('.login-card p');
      if(intro) intro.textContent = 'Private workspace access. Provider-backed reads only; unavailable feeds stay clearly marked.';
      return;
    }
    var script = document.createElement('script');
    script.src = modules[index].indexOf('@vendor/')===0
      ? '/assets/vendor/' + modules[index].slice(8) + '?v=5.2.0'
      : '/assets/js/modules/' + modules[index] + '?v=20260728draw1';
    script.async = false;
    script.onload = function(){ load(index + 1); };
    script.onerror = function(){ console.error('Failed to load Risk Story module', modules[index]); };
    document.body.appendChild(script);
  }
  load(0);
})();
