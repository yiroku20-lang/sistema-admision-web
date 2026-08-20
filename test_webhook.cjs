const http = require('http');

const data = JSON.stringify({
  id: "12345",
  nombre: "Juan Pérez",
  correo: "juan@ejemplo.com",
  carrera_interes: "Ingenierías"
});

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/webhook/welcome-email',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(data)
  }
};

const req = http.request(options, res => {
  let body = '';
  res.on('data', d => { body += d; });
  res.on('end', () => {
    console.log(`Status: ${res.statusCode}`);
    console.log(`Body: ${body}`);
  });
});

req.on('error', error => { console.error(error); });
req.write(data);
req.end();
