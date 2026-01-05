# Deployment Instructions

## CodeCapsules Deployment

1. **Build the project:**
   ```bash
   npm install
   npm run build
   ```

2. **Configure CodeCapsules:**
   - The `capsule` file is already configured
   - Make sure CodeCapsules is set to serve from the `dist` directory
   - Set the build command to: `npm install && npm run build`
   - Set the start command to serve static files from `dist`

3. **If MIME type issues persist:**
   - Ensure CodeCapsules is configured to serve static files
   - The `.htaccess` file should help with Apache servers
   - For Nginx, you may need to add MIME type configuration

## Build Output

After running `npm run build`, the `dist` folder will contain:
- `index.html` - Entry point
- `assets/` - All JavaScript, CSS, and other assets

Make sure your hosting provider serves the `dist` folder as the web root.

