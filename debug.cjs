const http = require('http');

http.get('http://localhost:9222/json/list', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const targets = JSON.parse(data);
    const page = targets.find(t => t.type === 'page' && t.url.includes('localhost:3000'));
    if (!page) {
      console.error('No page target found');
      process.exit(1);
    }
    
    console.log('Connecting to:', page.webSocketDebuggerUrl);
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    
    ws.onopen = () => {
      console.log('Connected to Chrome DevTools Protocol!');
      
      ws.send(JSON.stringify({ id: 1, method: 'Runtime.enable' }));
      ws.send(JSON.stringify({ id: 2, method: 'Log.enable' }));
      ws.send(JSON.stringify({ id: 3, method: 'Page.enable' }));
      
      // Navigate to patient login page
      setTimeout(() => {
        console.log('Navigating to http://localhost:3000/patient/login');
        ws.send(JSON.stringify({
          id: 10,
          method: 'Page.navigate',
          params: { url: 'http://localhost:3000/patient/login' }
        }));
      }, 500);

      // Request screenshot
      setTimeout(() => {
        ws.send(JSON.stringify({
          id: 100,
          method: 'Page.captureScreenshot',
          params: { format: 'png' }
        }));
      }, 5000);
    };
    
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      
      if (msg.method === 'Runtime.consoleAPICalled') {
        const type = msg.params.type;
        const args = msg.params.args.map(a => a.value || a.description || JSON.stringify(a)).join(' ');
        console.log(`[Console ${type}] ${args}`);
      }
      
      if (msg.method === 'Runtime.exceptionThrown') {
        console.error('[Page Exception]', msg.params.exceptionDetails.exception.description);
      }
      
      if (msg.id === 100) {
        if (msg.error) {
          console.error('Screenshot failed:', msg.error);
        } else {
          const fs = require('fs');
          const buffer = Buffer.from(msg.result.data, 'base64');
          fs.writeFileSync('c:\\Users\\Charanya\\OneDrive\\cardioalert-ai-+-iot (1)\\screenshot_debug.png', buffer);
          console.log('Screenshot written successfully to screenshot_debug.png');
        }
        ws.close();
        process.exit(0);
      }
    };
    
    ws.onerror = (err) => {
      console.error('WebSocket Error:', err);
    };
  });
});
