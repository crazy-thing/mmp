# Running your MMP server through a Cloudflare Tunnel (recommended)

A Cloudflare Tunnel connects your server to Cloudflare from the inside, and players reach it at your own address, such as `https://packs.example.com`. Compared with the [basic setup](README.md):

- **HTTPS is included**, so players' downloads and your panel sign-in are protected.
- **There's nothing to change on your router.** No port forwarding, and it works even if your provider uses CGNAT.
- **The address never changes**, even when your home IP does.

It's free. You need **a domain that uses Cloudflare for DNS**, and it works the same on a home PC or a rented server (VPS). Allow about 20 minutes, most of it waiting for the domain to switch over.

## 1. Put your domain on Cloudflare

Skip this step if your domain already shows as **Active** in Cloudflare.

1. Don't have a domain yet? You can buy one from Cloudflare (**Domain Registration › Register Domains** in the dashboard), which also skips the rest of this step. Or buy from any registrar, such as Namecheap or Porkbun. Cheap ones cost a few dollars a year.
2. Create a free account at [dash.cloudflare.com](https://dash.cloudflare.com/) and choose **Add a domain**. Enter your domain and pick the **Free** plan.
3. Cloudflare shows two **nameservers**, like `ada.ns.cloudflare.com`. At the company you bought the domain from, replace the domain's nameservers with those two.
4. Wait until Cloudflare emails you that the domain is **Active**. This is often minutes, but can take up to a day.

## 2. Create the tunnel

1. In the Cloudflare dashboard, open **Zero Trust**. The first time, it asks you to pick a team name and the **Free** plan. A payment card may be requested but isn't charged on the free plan.
2. Go to **Networks › Tunnels** and click **Create a tunnel**. Choose **Cloudflared**, and name it something like `mmp`.
3. Cloudflare shows install commands for different systems. **Don't run them.** Copy the long **token** from any of them: it's the text after `--token` or `service install`. It starts with `eyJ`.
4. Click **Next** to add a **public hostname** (newer dashboards call it a *published application route*):

   | Field | Value |
   |---|---|
   | Subdomain | `packs` (or anything you like) |
   | Domain | your domain |
   | Path | leave empty |
   | Service type | `HTTP` |
   | URL | `mmp:8080` |

   Save the tunnel. Your server's address will be `https://packs.example.com`.

## 3. Install Docker and create the server folder

On a new computer, first **install Docker** as described in [step 1 of the main guide](README.md#1-install-docker), including the *Check Docker works* part.

Then make a folder called `mmp` and put two files in it.

**Option A: download them.**

macOS / Linux:

```sh
mkdir mmp && cd mmp
curl -fsSLO https://raw.githubusercontent.com/crazy-thing/mmp/main/deploy/docker-compose.tunnel.yml
curl -fsSL  https://raw.githubusercontent.com/crazy-thing/mmp/main/deploy/.env.example -o .env
```

Windows (PowerShell, use `curl.exe` and not `curl`):

```powershell
mkdir mmp; cd mmp
curl.exe -fsSLO https://raw.githubusercontent.com/crazy-thing/mmp/main/deploy/docker-compose.tunnel.yml
curl.exe -fsSL  https://raw.githubusercontent.com/crazy-thing/mmp/main/deploy/.env.example -o .env
```

**Option B: create them yourself** in a text editor. In Notepad, set *Save as type* to **All files**, so they don't get a `.txt` ending. Save this as `docker-compose.tunnel.yml`:

```yaml
services:
  mmp:
    image: crazything1/mmp:${MMP_VERSION:-latest}
    restart: unless-stopped
    environment:
      SECURE_COOKIES: "true"
      TRUST_PROXY: "true"
    volumes:
      - mmp-data:/data

  cloudflared:
    image: cloudflare/cloudflared:latest
    restart: unless-stopped
    depends_on:
      - mmp
    command: tunnel --no-autoupdate run
    environment:
      TUNNEL_TOKEN: ${TUNNEL_TOKEN:?Set TUNNEL_TOKEN in .env (from the Cloudflare dashboard)}

volumes:
  mmp-data:
```

Either way, open `.env` in a text editor (create it if you used option B) and paste the token from step 2:

```
TUNNEL_TOKEN=eyJhIjoi...
```

The token lets anyone run your tunnel, so don't share the `.env` file or post it anywhere.

## 4. Start it

```sh
docker compose -f docker-compose.tunnel.yml up -d
docker compose -f docker-compose.tunnel.yml logs mmp
```

The first run downloads MMP and the tunnel, a few hundred MB. The log then shows a box with a **setup code**, like `K7PQ-WX3M-9RTD`. In the Cloudflare dashboard, the tunnel's status should change to **Healthy** within a minute.

## 5. Finish setup in the browser

Open `https://packs.example.com`. Enter the setup code, create your owner account, and check the public URL is `https://packs.example.com`.

Then carry on with [After setup](README.md#after-setup) in the main guide. Remember to add `-f docker-compose.tunnel.yml` to every `docker compose` command there, for example when [updating](README.md#updating):

```sh
docker compose -f docker-compose.tunnel.yml pull
docker compose -f docker-compose.tunnel.yml up -d
```

On a home PC, players can connect only while it's on, so turn off sleep as described in the [main guide](README.md#4-finish-setup-in-the-browser).

## Already running the basic setup?

You can switch to the tunnel and keep your packs, settings and accounts. Both setups use the same data volume as long as you stay in the same folder.

1. Do steps 1 and 2 above.
2. In your existing `mmp` folder, add `docker-compose.tunnel.yml` as in step 3, and put the `TUNNEL_TOKEN=` line in `.env` (create it if there isn't one).
3. Stop the basic setup and start the tunnel one:

   ```sh
   docker compose down
   docker compose -f docker-compose.tunnel.yml up -d
   ```

4. Sign in at `https://packs.example.com` and change the **Public URL** in **Settings** to `https://packs.example.com`. Players who added the old address need to add the new one, so share your join page again from the **Launcher** page.

## Problems

| Symptom | Fix |
|---|---|
| Cloudflare shows error 1033, or the tunnel shows as *Down* | The `cloudflared` container isn't running or the token is wrong. Check `docker compose -f docker-compose.tunnel.yml logs cloudflared` |
| Cloudflare shows a 502 Bad Gateway | The public hostname's service must be `HTTP` and `mmp:8080`, not `localhost:8080`. Also check `mmp` is running with `docker compose -f docker-compose.tunnel.yml ps` |
| The address doesn't load at all | The domain isn't **Active** in Cloudflare yet, or the public hostname wasn't saved |
| Lost the setup code | `docker compose -f docker-compose.tunnel.yml logs mmp` |
