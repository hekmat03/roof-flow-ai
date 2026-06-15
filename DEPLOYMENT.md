# 🚀 RoofFlow AI - Production Deployment Guide

RoofFlow AI is a high-performance, responsive React + TypeScript sales assistant dashboard styled with Tailwind CSS v4 and powered by Vite. Since it compiles into fully optimized static assets (`HTML`, `JS`, `CSS`, and assets), it is incredibly fast, highly secure, and extremely cost-effective to host.

Here are the recommended production deployment strategies.

---

## ⚡ Option 1: Vercel (Recommended)
Vercel is the creator of Next.js and has native, ultra-optimized support for Vite React apps. It offers continuous deployment, instant cache invalidation, and a global edge CDN.

### Step-by-Step Deployment:
1. **Push your code to GitHub:**
   If your repository isn't pushed yet, initialize git and push to your GitHub account:
   ```bash
   git remote add origin https://github.com/YOUR_USERNAME/roof-flow-ai.git
   git branch -M main
   git push -u origin main
   ```
2. **Sign in to Vercel:**
   Go to [Vercel](https://vercel.com/) and log in with your GitHub account.
3. **Import Project:**
   - Click **Add New** -> **Project**.
   - Select your `roof-flow-ai` repository from the list.
4. **Configure Settings:**
   - Vercel will automatically detect **Vite** as the framework preset.
   - **Build Command:** `npm run build` (or `tsc -b && vite build`)
   - **Output Directory:** `dist`
5. **Deploy:**
   - Click **Deploy**. Your site will be live in less than 60 seconds with a custom SSL-secured `.vercel.app` domain!

---

## ☁️ Option 2: Netlify
Netlify is another outstanding developer platform that specializes in static web hosting with zero-configuration setup.

### Step-by-Step Deployment:
1. **Sign in to Netlify:**
   Go to [Netlify](https://www.netlify.com/) and log in with your GitHub account.
2. **Add New Site:**
   - Click **Add new site** -> **Import from Git**.
   - Connect your GitHub account and select your `roof-flow-ai` repository.
3. **Configure Build Settings:**
   - Netlify will auto-detect the configuration:
     * **Branch to deploy:** `main`
     * **Build command:** `npm run build`
     * **Publish directory:** `dist`
4. **Deploy:**
   - Click **Deploy roof-flow-ai**. Your production build is automatically generated and deployed to a global network.

---

## 🔒 Option 3: Cloudflare Pages
Cloudflare Pages provides lightning-fast performance, DDoS protection, and free hosting directly integrated into Cloudflare's massive global network of edge servers.

### Step-by-Step Deployment:
1. **Sign in to Cloudflare:**
   Go to the [Cloudflare Dashboard](https://dash.cloudflare.com/) and select **Workers & Pages** -> **Pages**.
2. **Create a Project:**
   - Click **Connect to Git** and authorize your GitHub account.
   - Select the `roof-flow-ai` repository.
3. **Build settings:**
   - Select **Vite** as the framework preset.
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
4. **Save and Deploy:**
   - Click **Save and Deploy**. Cloudflare will build your app and deploy it on its edge infrastructure.

---

## 🛠️ Testing Locally Before Deploying
To test the production build locally before uploading, run the following commands:

```bash
# 1. Compile and build static files
npm run build

# 2. Preview the built static assets locally
npm run preview
```

Your app will compile and launch on `http://localhost:3000` (or another port), letting you verify that everything operates flawlessly under production constraints.
