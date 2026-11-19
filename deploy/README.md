# Hosting your MMP server

**MMP** (Modpack Management Panel) is the server you publish your modpacks from, with its admin panel. Your players install and update the packs through **MML** (Modpack Management Launcher).

This guide sets MMP up on a computer at home, starting from a brand-new machine: the PC you play on, or an old one that stays on. It takes about 20 minutes, most of it installing Docker.

> **Recommended: run it through a Cloudflare Tunnel.** If you have a domain (or are happy to get one), do steps 1 and 2 here, then follow **[the Cloudflare Tunnel guide](cloudflare-tunnel.md)**. You get HTTPS and a fixed address like `https://packs.example.com`, and you don't need to touch your router. The basic setup below serves the panel over plain HTTP, which is fine for trying MMP out or for players on your own network. For players across the internet, the tunnel is much safer (see [why HTTPS matters](#why-https-matters)).

## What you need

- **A computer that stays on** while people play. Windows 10 or 11 (64-bit), macOS 13 or newer, or a 64-bit Linux. Intel, AMD and ARM machines (including Apple silicon and Raspberry Pi 4/5) all work.
- **At least 4 GB of RAM** (MMP itself uses a few hundred MB) and **10 GB of free disk**, plus room for your packs.
- **An internet connection.** Docker downloads MMP the first time, and the panel imports mods from Modrinth and CurseForge.

## 1. Install Docker

MMP runs in Docker, which keeps it in one tidy package that's easy to update or remove. Install it once per computer.

### Windows

1. Download **Docker Desktop for Windows** from [docker.com/products/docker-desktop](https://www.docker.com/products/docker-desktop/). Pick **AMD64**, or **ARM64** if it's an ARM laptop.
2. Run the installer. Leave **Use WSL 2 instead of Hyper-V** ticked. If Windows asks to install or update WSL, say yes.
3. **Restart the computer** when it asks.
4. Open **Docker Desktop** from the Start menu, accept the terms, and skip signing in. You don't need a Docker account. Wait until the bottom-left corner says **Engine running**.
5. In Docker Desktop, open **Settings › General** and tick **Start Docker Desktop when you sign in to your computer**.

If Docker says **virtualization is disabled**, it needs to be switched on in the computer's BIOS/UEFI settings. It's usually called *Intel VT-x*, *Intel Virtualization Technology*, *AMD-V* or *SVM Mode*. Search for your motherboard or laptop model plus "enable virtualization".

### macOS

1. Check your chip: **Apple menu › About This Mac**. It says *Apple M…* or *Intel*.
2. Download **Docker Desktop** for that chip from [docker.com/products/docker-desktop](https://www.docker.com/products/docker-desktop/), open the `.dmg`, and drag Docker to **Applications**.
3. Open **Docker** from Applications, accept the terms, and skip signing in. Wait for the whale icon in the menu bar to stop animating.
4. In Docker's **Settings › General**, tick **Start Docker Desktop when you sign in to your computer**.

### Linux (Ubuntu, Debian, Fedora, Raspberry Pi OS…)

In a terminal:

```sh
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER"
sudo systemctl enable --now docker
```

Then **log out and back in**, so you can run `docker` without `sudo`.

### Check Docker works

Open a terminal (on Windows, **PowerShell** from the Start menu) and run:

```sh
docker run --rm hello-world
docker compose version
```

The first prints *Hello from Docker!*, and the second prints a version number. If either fails, make sure Docker Desktop is open and says it's running.

## 2. Create the server folder

MMP needs one file, `docker-compose.yml`, in a folder of its own. Make a folder called `mmp`, for example in your home folder or Documents. The folder's name matters later, so keep it `mmp`.

**Option A: download it.**

macOS / Linux:

```sh
mkdir mmp && cd mmp
curl -fsSLO https://raw.githubusercontent.com/crazy-thing/mmp/main/deploy/docker-compose.yml
```

Windows (PowerShell, use `curl.exe` and not `curl`):

```powershell
mkdir mmp; cd mmp
curl.exe -fsSLO https://raw.githubusercontent.com/crazy-thing/mmp/main/deploy/docker-compose.yml
```

**Option B: create it yourself.** In a text editor (Notepad is fine), save this as `docker-compose.yml` in the `mmp` folder. In Notepad, set *Save as type* to **All files**, so it doesn't become `docker-compose.yml.txt`.

```yaml
services:
  mmp:
    image: crazything1/mmp:${MMP_VERSION:-latest}
    restart: unless-stopped
    ports:
      - "8080:8080"
    volumes:
      - mmp-data:/data

volumes:
  mmp-data:
```

Then open a terminal in that folder: `cd` into it, or in Windows File Explorer, type `powershell` in the address bar of the folder and press Enter.

## 3. Start it

In the `mmp` folder:

```sh
docker compose up -d
docker compose logs mmp
```

The first run downloads MMP, which is a few hundred MB. The log then shows a box with a **setup code**, like `K7PQ-WX3M-9RTD`. If Windows asks whether Docker may use the network, allow it on **private networks**.

MMP now starts by itself whenever Docker does, because of `restart: unless-stopped` in the file. On Windows and macOS, Docker starts when you sign in. On Linux, it starts at boot.

## 4. Finish setup in the browser

Open **http://localhost:8080** on the server computer. Enter the setup code and create your owner account.

When the wizard asks for the **public URL**, enter the address players will use:

- **Players on your own network** (same Wi-Fi or LAN): `http://<this computer's local IP>:8080`, for example `http://192.168.1.50:8080`. Find the local IP with `ipconfig` on Windows (the *IPv4 Address* line) or in your network settings.
- **Players over the internet:** see [the next step](#5-optional-let-players-connect-over-the-internet), or better, the [Cloudflare Tunnel guide](cloudflare-tunnel.md).

Keep the computer from sleeping. On Windows, open **Settings › System › Power** and set sleep to **Never** while plugged in. On macOS, open **System Settings › Energy** (or **Battery › Options**) and prevent automatic sleeping.

## 5. (Optional) Let players connect over the internet

Without a tunnel, players outside your home reach the server through your router:

1. **Give the server computer a fixed local IP.** In your router's device list (often under *DHCP*, *LAN* or *Address reservation*), reserve its current IP, for example `192.168.1.50`.
2. **Forward port 8080.** In the router's **Port forwarding** settings, forward external TCP port `8080` to `192.168.1.50` port `8080`.
3. **Find your public IP** at [whatismyip.com](https://www.whatismyip.com/), and set the public URL in **Settings** to `http://<public IP>:8080`.

Some limits to know about:

- **It isn't encrypted.** Read [why HTTPS matters](#why-https-matters) before sharing it widely.
- **Your public IP can change**, and then every player's saved address stops working. A free name from [DuckDNS](https://www.duckdns.org/) that follows your IP helps (`http://mypacks.duckdns.org:8080`).
- **It may not work at all** if your provider uses *CGNAT*: your router's internet IP won't match whatismyip.com, or starts with `100.64`. A Cloudflare Tunnel works either way.

## Why HTTPS matters

Over plain HTTP, anyone between a player and your server can read and change the traffic. Examples are a public Wi-Fi network, a compromised router, or a hostile ISP. That includes:

- **The pack's file list.** The launcher installs whatever files it lists. Someone who changes it in transit can make players install a malicious mod.
- **Your panel password and sign-in**, so someone could take over the panel.

The [Cloudflare Tunnel guide](cloudflare-tunnel.md) adds HTTPS for free. If you started with this basic setup, the guide shows how to [switch over and keep your packs](cloudflare-tunnel.md#already-running-the-basic-setup).

## After setup

- **Upload a modpack.** Use a Modrinth `.mrpack` export, or a CurseForge export once you've added a CurseForge API key in Settings.
- **Share it.** The **Launcher** page in the panel has your join page link (for Discord or your website), a website button, and the server address.
- **Check it's working.** **Settings › Server Status** checks your public URL reaches this server and that Mojang, Modrinth and CurseForge are reachable. It also warns when the server runs without HTTPS.

## Updating

When an update is out, the panel's Settings page says so. In the `mmp` folder:

```sh
docker compose pull
docker compose up -d
```

Your packs, settings and accounts are kept. With the tunnel setup, add `-f docker-compose.tunnel.yml` to both commands.

To pin a version, create a file called `.env` next to `docker-compose.yml` containing one line:
- `MMP_VERSION=5` stays on version 5 and still gets its updates.
- `MMP_VERSION=5.0.0` stays on exactly that release.

## Where your data is

Everything is in the `mmp-data` Docker volume: the database, uploaded files and images. Removing or updating the container doesn't touch it. To copy it somewhere, for example before moving to another computer:

```sh
docker compose stop mmp
docker run --rm -v mmp_mmp-data:/data -v "${PWD}:/out" busybox tar czf /out/mmp-data.tgz -C /data .
docker compose start mmp
```

That leaves `mmp-data.tgz` in the folder. To restore it on the new computer, do steps 1 and 2 there, put `mmp-data.tgz` in the folder, then run:

```sh
docker compose up --no-start
docker run --rm -v mmp_mmp-data:/data -v "${PWD}:/in" busybox tar xzf /in/mmp-data.tgz -C /data
docker compose up -d
```

The volume name starts with the folder name, so it's `mmp_mmp-data` when the folder is called `mmp`.

## Removing MMP

`docker compose down` stops and removes the server but keeps your data. `docker compose down -v` also **deletes all packs, settings and accounts**, and can't be undone.

## Problems

| Symptom | Fix |
|---|---|
| `docker: command not found`, or *cannot connect to the Docker daemon* | Docker Desktop isn't installed or isn't running. Open it and wait for *Engine running*. On Linux, log out and back in after installing |
| `no configuration file provided` | You're not in the `mmp` folder, or the file got saved as `docker-compose.yml.txt` |
| `manifest unknown` or `not found` when pulling | The version in `.env` doesn't exist. Remove `.env` to use the latest release |
| Lost the setup code | `docker compose logs mmp`, or `docker compose restart mmp` to print it again. It only exists until setup is finished |
| `http://localhost:8080` doesn't load | Check `docker compose ps` shows `mmp` as running. If something else already uses port 8080, change the first number in `ports:` (for example `"8081:8080"`) and use that port |
| Other computers on your network can't connect | Allow port 8080 through the server computer's firewall (on Windows, allow Docker Desktop on private networks) |
| Works at home but not for players outside | Check the port forwarding points at the right local IP, and that your provider doesn't use CGNAT. If it does, use the [Cloudflare Tunnel](cloudflare-tunnel.md) |
| Stopped working for players after a while | Your public IP probably changed. Update the public URL in Settings, use DuckDNS, or switch to the tunnel |
| Server Status says the public URL points at a different server | The Public URL in Settings is wrong |
