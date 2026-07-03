import { NextResponse } from "next/server";
import { guardApiKeyOnly } from "@/lib/admin-guard";

const SWAGGER_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Scrapor API Docs</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    const params = new URLSearchParams(window.location.search);
    let apiKey = params.get("apiKey") || sessionStorage.getItem("scrapor_api_key") || "";
    if (apiKey) sessionStorage.setItem("scrapor_api_key", apiKey);

    function promptKey() {
      const entered = window.prompt("Enter your API key (spk_ro_… or spk_fa_…):", apiKey);
      if (entered) {
        apiKey = entered.trim();
        sessionStorage.setItem("scrapor_api_key", apiKey);
        window.location.reload();
      }
    }

    if (!apiKey) {
      promptKey();
    }

    window.ui = SwaggerUIBundle({
      url: "/api/openapi",
      dom_id: "#swagger-ui",
      presets: [SwaggerUIBundle.presets.apis, SwaggerUIBundle.SwaggerUIStandalonePreset],
      layout: "BaseLayout",
      requestInterceptor: (req) => {
        if (apiKey) {
          req.headers["Authorization"] = "Bearer " + apiKey;
        }
        return req;
      },
    });
  </script>
</body>
</html>`;

export async function GET(request: Request) {
  const auth = await guardApiKeyOnly(request);
  if (auth instanceof NextResponse) return auth;

  return new NextResponse(SWAGGER_HTML, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
