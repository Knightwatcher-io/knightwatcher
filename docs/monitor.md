# A monitor on the host

A homelab host usually has no desktop, and it often has a spare video output. This page shows
how to put the display on a monitor plugged straight into such a host, with no tablet and no
desktop environment.

It uses [cage](https://github.com/cage-kiosk/cage), a small Wayland compositor that shows one
program full screen, and a browser in kiosk mode, started by systemd on a spare virtual
terminal. This was set up and checked on Ubuntu 26.04 with an NVIDIA card and Chromium. Other
distributions package the same pieces under the same names.

## Before you start

- **The page must already be served somewhere the host can reach**, for example
  `http://127.0.0.1:8080/`. The examples below use that address; put your own in its place.
- **The kernel must see the monitor.** No display server is needed for this check:

  ```bash
  for c in /sys/class/drm/card*-*; do echo "$(basename "$c"): $(cat "$c/status")"; done
  ```

  One line should say `connected`. If every line says `disconnected`, or there are no lines,
  the graphics driver is not doing kernel mode setting and nothing below will work until it is.
  With NVIDIA's own driver that means `nvidia-drm.modeset=1`, which recent packages set for you.

## Install

A compositor and a browser:

```bash
sudo apt install cage chromium
```

On Ubuntu, `chromium` and `firefox` are snaps. Any browser with a kiosk mode will do; for
Firefox the command further down becomes `firefox --kiosk <address>`.

A user of its own to run the browser, so that it has no access to anything else on the host:

```bash
sudo useradd --create-home --shell /usr/sbin/nologin kiosk
```

## The service

Save this as `/etc/systemd/system/knightwatcher-monitor.service`. It gives the `kiosk` user a
login session on virtual terminal 7. An ordinary user can draw on the monitor only from such a
session.

```ini
[Unit]
Description=Knightwatcher on the attached monitor
After=systemd-user-sessions.service getty@tty7.service
Conflicts=getty@tty7.service

[Service]
User=kiosk
PAMName=login
TTYPath=/dev/tty7
TTYReset=yes
TTYVHangup=yes
TTYVTDisallocate=yes
StandardInput=tty-fail
UtmpIdentifier=tty7
UtmpMode=user
Environment=XDG_SESSION_TYPE=wayland
ExecStartPre=+/usr/bin/chvt 7
ExecStart=/usr/bin/cage -s -- chromium --kiosk --ozone-platform=wayland --no-first-run --noerrdialogs --disable-session-crashed-bubble http://127.0.0.1:8080/
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Then start it, and have it start with the host:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now knightwatcher-monitor.service
```

The knight should fill the monitor within a few seconds.

## What to expect

- **No cursor** appears unless a mouse is plugged in. A USB mouse or keyboard plugged into the
  host works in the browser.
- **The screen stays on.** cage does not blank it, and the page's own wake lock works because a
  loopback address counts as a secure context.
- **Kiosk mode is already full screen,** so the page's tap to go full screen has nothing to do.
- **The host's console is still there** on the other virtual terminals. `sudo chvt 1` shows it
  and `sudo chvt 7` returns to the knight.

## When it does not work

Read the service's log first:

```bash
journalctl -u knightwatcher-monitor.service -n 30 --no-pager
```

- **The monitor shows the console, and the log ends with cage failing to find a display or a
  seat.** The service is not getting a login session. Check that `PAMName=login` and the `TTY`
  lines are present, and that nothing else holds virtual terminal 7.
- **A black screen or a flickering cursor with an NVIDIA card.** Add
  `Environment=WLR_NO_HARDWARE_CURSORS=1` to the `[Service]` section and restart.
- **The browser opens and shows an error page.** The address in `ExecStart` is not reachable
  from the host. Try it with `curl` on the host itself.
- **The browser refuses to start as a snap.** Install the browser another way, or run the
  service as a user with a normal login shell.

## Removing it

```bash
sudo systemctl disable --now knightwatcher-monitor.service
sudo rm /etc/systemd/system/knightwatcher-monitor.service
sudo systemctl daemon-reload
sudo userdel --remove kiosk
```
