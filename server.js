// Simple Express server for CodeCapsules with correct MIME types
const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Set correct MIME types
express.static.mime.define({
  'application/javascript': ['js', 'mjs'],
  'text/css': ['css']
});

// Serve static files from dist directory
app.use(express.static(path.join(__dirname, 'dist'), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.js') || filePath.endsWith('.mjs')) {
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    } else if (filePath.endsWith('.css')) {
      res.setHeader('Content-Type', 'text/css; charset=utf-8');
    }
  }
}));

// Handle SPA routing - serve index.html for all routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

