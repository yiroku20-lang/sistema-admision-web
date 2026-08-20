const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');
const patch = `    <script>
      if (typeof window !== 'undefined') {
        const originalFetch = window.fetch;
        try {
          Object.defineProperty(window, 'fetch', {
            get: function() { return originalFetch; },
            set: function(v) { 
                console.warn('Attempted to set window.fetch', new Error().stack); 
                // Do not throw! Just ignore.
            },
            configurable: true
          });
        } catch(e) {}
      }
    </script>
`;
// Replace the old patch if it exists
html = html.replace(/<script>\s*\/\/ Patch window\.fetch.*?(?=<\/script>)<\/script>\s*/s, '');
html = html.replace('<head>', '<head>\n' + patch);
fs.writeFileSync('index.html', html);
