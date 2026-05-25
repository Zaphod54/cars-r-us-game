# Deploy Cars R Us

Use `cars-r-us.shivane.com` for the public URL. Domain names cannot contain spaces, so `Cars R Us.shivane.com` is not a valid hostname.

## Railway

1. Push this folder to a GitHub repo.
2. In Railway, create a new project from that GitHub repo.
3. Railway will use `railway.json`:
   - build command: `npm run build`
   - start command: `npm run start`
   - health check: `/`
4. After the first deploy succeeds, open the Railway service settings and add the custom domain `cars-r-us.shivane.com`.
5. Copy the `CNAME` and `TXT` records Railway gives you.

## Cloudflare

In the Cloudflare DNS settings for `shivane.com`, add the records Railway provides:

1. `CNAME`
   - name: `cars-r-us`
   - target: the Railway CNAME value, such as `abc123.up.railway.app`
   - proxy status: Proxied for a first-level subdomain
2. `TXT`
   - name: the Railway verification name
   - value: the Railway verification value

Set Cloudflare SSL/TLS mode to `Full` for the Railway subdomain. Railway will verify the domain and serve the game over HTTPS.

## Shivane.com Link

On your Cloudflare static homepage, add a normal link or button to:

```html
<a href="https://cars-r-us.shivane.com/">Play Cars R Us</a>
```
