# Webhooker

Webhooker is a Raycast extension for saving webhook URLs, running them with a `GET` request, and triggering actions from the text response.

## What It Does

- Save and manage named webhook URLs.
- Run a webhook from Raycast.
- Show request progress while waiting for a response.
- Execute configurable response actions per webhook.

## Supported Response Actions

- Show Raycast toast notification
- Show Raycast HUD
- Copy response to clipboard
- Show macOS notification
- Open URL (for valid links)
- Close Raycast window

## How It Works

1. Open `Manage Webhooks` in Raycast.
2. Create a webhook with a name and URL.
3. Edit that webhook's response actions.
4. Run the webhook to send a `GET` request.
5. Webhooker reads the response as text and runs the selected actions.

## Notes

- Responses are treated as plain text.
- Toast and HUD output use a shortened preview of the response.
- `Open URL` only opens valid `http` or `https` links from the response body.
- Existing legacy webhooks without an explicit saved action list still fall back to the older default action set.

## Development

From the extension directory:

```bash
npm install
npm run dev
```

Useful commands:

```bash
npm run build
npm run lint
```
