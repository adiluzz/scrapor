# Browser Automation MCP Server

This MCP server provides browser automation tools for scraping workflows:

- `browser_open`
- `browser_navigate`
- `browser_click` (selector, coordinates, or text-match)
- `browser_type`
- `browser_screenshot`
- `browser_get_click_targets`
- `browser_save_video`
- `browser_close`

## Run

```bash
npm run mcp:browser
```

## Add to Cursor MCP config

Use this server entry in your MCP config:

```json
{
  "mcpServers": {
    "scrapor-browser": {
      "command": "node",
      "args": ["/home/adi_iluz/projects/scrapor/mcp/browser-automation-server/server.mjs"]
    }
  }
}
```

## Notes

- Screenshots are saved to `library/mcp-screenshots`.
- Videos are saved to `library/mcp-recordings`.
- Recording is enabled by default when opening a browser session.

