# Lightning invoice link test

Static Safari test page for opening BOLT11 invoices through the `lightning:` URL scheme.

## Usage

1. Open the published GitHub Pages URL.
2. Paste a BOLT11 invoice.
3. Tap **Open lightning link** in Safari.

The page accepts raw invoices such as `lnbcrt...`, `lntb...`, or `lnbc...`. It also accepts values already prefixed with `lightning:`.

## Local preview

```bash
cd tools/ln-invoice-link
python3 -m http.server 8080
```

Open `http://localhost:8080` on the simulator, or `http://<mac-lan-ip>:8080` on a physical iPhone connected to the same network.
