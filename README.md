<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy

This contains everything you need to deploy this app.

## Run Locally

**Prerequisites:**  Node.js

1. Install dependencies:
   `npm install`
2. Set the `GEMINI_LIVE_KEY` in `private/.env` to your Gemini API key
3. Run the app:
   `npm run dev`

## Documentation

See the [User Guide](manual/USER_GUIDE.md) and the other documents in the [manual](manual) folder.

## Third-party software

MP3 export uses [LAME](https://lame.sourceforge.io) through [@breezystack/lamejs](https://www.npmjs.com/package/@breezystack/lamejs), unmodified, under the LGPL ([license](public/licenses/lamejs-LICENSE.txt)). It is built as its own file (`assets/lamejs-*.js`) and loaded only when an MP3 is exported.

THIS APP IS DESIGNED USING AI STUDIO & GEMINI AI.

