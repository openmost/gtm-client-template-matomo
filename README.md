# Matomo Client — server-side Google Tag Manager template

A server-side GTM **Client** that makes Matomo tracking first-party:

- serves `matomo.js` (premium plugins included) from your own domain, on a path of your choice, with caching;
- receives every `matomo.php` hit — GET, `sendBeacon` POST, XHR POST and **bulk** requests — and answers `204` with proper CORS headers;
- runs the container **once per hit** with a **dual-format event**: standard sGTM fields (`page_view`, `purchase`, `items`, `client_id`, `ip_override`…) usable by any tag (GA4, Meta CAPI, BigQuery…), plus the raw Matomo hit in `x-matomo-hit` for lossless forwarding with the **Matomo (server)** tag.

Supports FormAnalytics, MediaAnalytics, AbTesting (including redirect experiments), CrashAnalytics, ecommerce, goals, content tracking, custom dimensions and page performance. Heatmaps & session recording are intentionally not proxied.

Authored by Ronan HELLO — [Openmost](https://openmost.com).

---

## Setup

1. In your server container, create a client from this template:
   - **Matomo instance URL**: `https://analytics.example.com`
   - **Public path of the tracker JS**: e.g. `/js/app.js`
   - **Public path of the tracking endpoint**: e.g. `/collect`
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

3. Add the [**Matomo (server)**](https://github.com/openmost/gtm-tag-template-matomo-server) tag, triggered on events claimed by this client (`Client Name` equals the name of this client).

## Settings

| Field | Default | Description |
|---|---|---|
| Matomo instance URL | — | Base URL of your Matomo instance |
| Public path of the tracker JS | `/matomo.js` | Path serving `matomo.js` on the sGTM domain |
| Public path of the tracking endpoint | `/matomo.php` | Path receiving tracking hits |
| Tracker JS cache duration | 12 h | How long `matomo.js` is cached by the server container and browsers |
| Allowed origins | any | Comma-separated list of origins allowed to send hits |
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

Every event also carries:

- `x-matomo-hit`: all hit parameters, decoded;
- `x-matomo-idsite`: the Matomo site ID;
- `x-matomo-request`: Referer, DNT, client hints (`sec-ch-ua*`) and the `matomo_ignore` cookie.

## Security

`token_auth` is stripped from incoming hits. Use **Allowed origins** to restrict which sites can send hits.

## License

Apache 2.0
