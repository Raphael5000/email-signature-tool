# CodeCapsules Backend Capsule Configuration

## ✅ Verified Settings

### Capsule Type
- **Type:** Backend (Node.js)

### Build Configuration
- **Build Command:** `npm install && npm run build`
- **Build Output Directory:** `dist` (optional, but recommended)

### Run Configuration  
- **Run Command:** `npm start`

## How It Works

1. **Build Phase:**
   - Installs all dependencies (`npm install`)
   - Builds the React app with Vite (`npm run build`)
   - Outputs to `dist/` folder

2. **Run Phase:**
   - Starts Express server (`npm start` → `node server.js`)
   - Server serves static files from `dist/` folder
   - Sets correct MIME types for JavaScript files
   - Handles SPA routing (all routes serve `index.html`)

## Server Features

- ✅ Correct MIME types: `.js` files served as `application/javascript`
- ✅ SPA routing: All routes serve `index.html`
- ✅ Static file serving from `dist/` directory
- ✅ Uses `process.env.PORT` (CodeCapsules will set this automatically)

## Files Verified

- ✅ `package.json` - Has `express` dependency and `start` script
- ✅ `server.js` - Express server with correct MIME type configuration
- ✅ `vite.config.js` - Builds to `dist/` folder
- ✅ Build output verified - All files in `dist/` folder

## Testing Locally

To test the production build locally:
```bash
npm run build
npm start
```

Then visit `http://localhost:3000`

