const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');
const patch = `    <script>
      // Patch window.fetch read-only property in certain iframe/sandboxed environments
      if (typeof window !== 'undefined') {
        const originalFetch = window.fetch;
        try {
          Object.defineProperty(window, 'fetch', {
            value: originalFetch,
            writable: true,
            configurable: true
          });
        } catch(e) {}
      }
    </script>
`;
html = html.replace('<head>', '<head>\n' + patch);
fs.writeFileSync('index.html', html);
