# Matomo Client — server-side Google Tag Manager template

A server-side GTM **Client** that makes Matomo tracking first-party. The browser never talks to your Matomo instance anymore, only to your server-side GTM domain:

- serves `matomo.js` (premium plugins included) from your own domain, on a path of your choice, with caching;
- serves **Matomo Tag Manager containers** (`/js/container_XXXX.js`) and the **opt-out script** the same way;
- receives every `matomo.php` hit — GET, `sendBeacon` POST, XHR POST and **bulk** requests — and answers like Matomo (`204` or GIF) with proper CORS headers;
- runs the container **once per hit, in order**, with the raw Matomo hit preserved in `x-matomo-hit`. The [**Matomo**](https://github.com/openmost/gtm-tag-template-matomo-server) tag forwards it to Matomo losslessly.

Supports FormAnalytics, MediaAnalytics, AbTesting (including redirect experiments), CrashAnalytics, ecommerce, goals, content tracking, custom dimensions and page performance. Heatmaps & session recording are intentionally not proxied.

Authored by Ronan HELLO — [Openmost](https://openmost.com).

---

## How it works

```
browser ──matomo.js / hits──► Matomo Client ──event──► server container
                                                         ├─ Matomo tag ─────────► Matomo
                                                         └─ optional: Google Ads, Meta CAPI…
```

The client itself sends nothing to Matomo: add the **Matomo** tag (server-side), triggered on events claimed by this client. Because hits go through your container, you can also filter, enrich or strip them before they reach Matomo, and keep the URL of your Matomo instance private.

## Setup with the JavaScript tracker

1. In your server container, create a client from this template:
   - **Matomo instance URL**: `https://analytics.example.com`
   - **Public path of the tracker JS**: e.g. `/js/app.js`
   - **Public path of the tracking endpoint**: e.g. `/collect`
   - **Allowed Matomo site IDs**: e.g. `1`
2. Point your Matomo snippet to your server-side GTM domain:

```html
<script>
  var _paq = window._paq = window._paq || [];
  _paq.push(['trackPageView']);
  _paq.push(['enableLinkTracking']);
  (function() {
    var u = 'https://sgtm.example.com';
    _paq.push(['setTrackerUrl', u + '/collect']);
    _paq.push(['setSiteId', '1']);
    var d = document, g = d.createElement('script'), s = d.getElementsByTagName('script')[0];
    g.async = true; g.src = u + '/js/app.js'; s.parentNode.insertBefore(g, s);
  })();
</script>
```

3. Add the **Matomo** server-side tag with the trigger `Client Name equals <name of this client>`.

## Setup with Matomo Tag Manager

1. Tick **Proxy Matomo Tag Manager containers**.
2. In Matomo Tag Manager, edit your **Matomo Configuration** variable:
   - **Matomo URL**: `https://sgtm.example.com`
   - Advanced settings: custom **JS endpoint** = your tracker JS path (e.g. `js/app.js`) and custom **tracking endpoint** = your tracking path (e.g. `collect`).
3. Publish, then load the container from your sGTM domain:

```html
<script>
  var _mtm = window._mtm = window._mtm || [];
  _mtm.push({'mtm.startTime': (new Date().getTime()), 'event': 'mtm.Start'});
  (function() {
    var d = document, g = d.createElement('script'), s = d.getElementsByTagName('script')[0];
    g.async = true; g.src = 'https://sgtm.example.com/js/container_XXXX.js'; s.parentNode.insertBefore(g, s);
  })();
</script>
```

Published containers are cached for a few minutes (configurable). Preview containers (`container_XXXX_preview.js`) are never cached, so Matomo Tag Manager's preview mode keeps working.

## Opt-out

Tick **Proxy the Matomo opt-out script**, then use the opt-out code from *Administration → Privacy → Users opt-out* with your sGTM domain instead of your Matomo URL:

```html
<div id="matomo-opt-out"></div>
<script src="https://sgtm.example.com/index.php?module=CoreAdminHome&action=optOutJS&divId=matomo-opt-out&language=auto&showIntro=1"></script>
```

## Settings

| Field | Default | Description |
|---|---|---|
| Matomo instance URL | — | Base URL of your Matomo instance |
| Public path of the tracker JS | `/matomo.js` | Path serving `matomo.js` on the sGTM domain |
| Public path of the tracking endpoint | `/matomo.php` | Path receiving tracking hits |
| Tracker JS cache duration | 12 h | How long `matomo.js` is cached by the server container and browsers |
| Allowed origins | any | Comma-separated list of origins allowed to send hits |
| Allowed Matomo site IDs | any | Hits for other site IDs are dropped. Empty = any site, like Matomo itself |
| Proxy Matomo Tag Manager containers | off | Serves `/js/container_XXXX.js` |
| Matomo Tag Manager container cache duration | 5 min | Cache of published containers |
| Proxy the Matomo opt-out script | off | Serves `/index.php?module=CoreAdminHome&action=optOutJS…` only |
| Proxy A/B Testing redirects | off | Relays `/plugins/AbTesting/redirect.php` for redirect experiments |

## Event data

| Matomo hit | `event_name` |
|---|---|
| pageview | `page_view` |
| site search | `view_search_results` |
| event (`e_c`) | `matomo_event` |
| A/B test event | `matomo_abtesting` |
| outlink / download | `click` / `file_download` |
| ecommerce order / cart update | `purchase` / `update_cart` |
| goal | `matomo_goal` |
| content impression / interaction | `matomo_content` |
| heartbeat | `matomo_ping` |
| FormAnalytics / MediaAnalytics / CrashAnalytics | `matomo_form` / `matomo_media` / `matomo_crash` |

Common fields: `page_location`, `page_title`, `page_referrer`, `client_id` (Matomo visitor ID, empty without cookie consent), `user_id`, `ip_override`, `user_agent`, `language`, `screen_resolution`, and ecommerce fields (`transaction_id`, `value`, `tax`, `shipping`, `discount`, `items`).

Matomo-specific fields:

- `x-matomo-hit`: all hit parameters, decoded;
- `x-matomo-idsite`: the Matomo site ID;
- `x-matomo-consent`: `granted` when the hit carries a visitor ID (cookie consent given, `consent=1`, or a `mtm_cookie_consent` / `mtm_consent` cookie), otherwise `denied`. Use it in the triggers of your other tags (Google Ads, Meta…) so they respect the visitor's choice;
- `x-matomo-request`: Referer, DNT, client hints (`sec-ch-ua*`) and the `matomo_ignore` cookie.

## Security

- `token_auth` and the parameters that require it (`cip`, `cdt`, `cdo`, `country`, `region`, `city`, `lat`, `long`) are stripped from incoming hits: nobody can use the token added by the Matomo tag to backdate visits or fake locations. `matomo.js` never sends them.
- Use **Allowed Matomo site IDs** and **Allowed origins** to restrict what can be sent through your container.
- The opt-out proxy only relays the `optOutJS` action; no other Matomo page is exposed.

## License

Apache 2.0
